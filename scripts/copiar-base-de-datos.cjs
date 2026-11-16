#!/usr/bin/env node
/*
 * Copia TODOS los datos del panel de una base PostgreSQL a otra (por ejemplo,
 * de Neon a Supabase). No borra nada en la base de origen.
 *
 *   ORIGEN_DATABASE_URL=...  DESTINO_DATABASE_URL=...  node copiar-base-de-datos.js
 *
 * En cPanel: pon esas dos variables en «Setup Node.js App», guarda y pulsa
 * «Run JS script» → «copiar-base». Después cambia DATABASE_URL por la de
 * destino y reinicia la app.
 *
 * Qué hace:
 *   1. Crea en el destino las tablas del panel (las mismas migraciones que
 *      aplica la app al arrancar).
 *   2. Si el destino ya tiene datos, se detiene (para no mezclar). Con
 *      COPIAR_REEMPLAZAR=si vacía el destino antes de copiar.
 *   3. Copia tabla por tabla, en lotes, y al final compara cuántas filas hay
 *      en cada lado.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

let pg;
try {
  pg = require("pg");
} catch {
  console.error("Falta el paquete «pg». Ejecuta primero «Run NPM Install».");
  process.exit(1);
}

const origen = (process.env.ORIGEN_DATABASE_URL || process.argv[2] || "").trim();
const destino = (process.env.DESTINO_DATABASE_URL || process.argv[3] || "").trim();
const reemplazar = /^(si|sí|yes|true|1)$/i.test(process.env.COPIAR_REEMPLAZAR || "");

if (!origen || !destino) {
  console.error("Faltan ORIGEN_DATABASE_URL (la base actual) y DESTINO_DATABASE_URL (la nueva).");
  process.exit(1);
}
if (origen === destino) {
  console.error("ORIGEN y DESTINO son la misma base: no hay nada que copiar.");
  process.exit(1);
}

const SUPABASE_TX = /@[^/?#]*\.pooler\.supabase\.com:6543(\/|$)/i;

/** URL para node-postgres: sin parámetros que solo entiende Prisma, y el pooler de transacción de Supabase pasa al de sesión. */
function pgUrl(url) {
  let [base, query = ""] = url.split("?");
  if (SUPABASE_TX.test(base)) base = base.replace(/\.pooler\.supabase\.com:6543/i, ".pooler.supabase.com:5432");
  const keep = query
    .split("&")
    .filter((p) => p && !/^(sslmode|sslaccept|sslcert|sslrootcert|pgbouncer|connection_limit|pool_timeout|schema|channel_binding)=/.test(p));
  return keep.length ? `${base}?${keep.join("&")}` : base;
}

/** Nombre visible de una base, sin usuario ni contraseña. */
function hostOf(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(URL no válida)";
  }
}

function client(url) {
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new pg.Client({
    connectionString: pgUrl(url),
    ssl: local ? false : { rejectUnauthorized: false },
    // Todo como texto: así se copian tal cual JSON, listas, fechas y enums.
    types: { getTypeParser: () => (v) => v },
  });
}

const q = (name) => `"${name.replace(/"/g, '""')}"`;

async function migrate(db) {
  const migDir = path.join(__dirname, "prisma", "migrations");
  if (!fs.existsSync(migDir)) throw new Error(`No encuentro las migraciones en ${migDir}`);
  await db.query(
    'CREATE TABLE IF NOT EXISTS "_prisma_migrations" (id varchar(36) PRIMARY KEY NOT NULL, checksum varchar(64) NOT NULL, finished_at timestamptz, migration_name varchar(255) NOT NULL, logs text, rolled_back_at timestamptz, started_at timestamptz NOT NULL DEFAULT now(), applied_steps_count integer NOT NULL DEFAULT 0)',
  );
  const done = new Set(
    (await db.query('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).rows.map(
      (r) => r.migration_name,
    ),
  );
  const names = fs
    .readdirSync(migDir)
    .filter((f) => fs.existsSync(path.join(migDir, f, "migration.sql")))
    .sort();
  let applied = 0;
  for (const name of names) {
    if (done.has(name)) continue;
    const sql = fs.readFileSync(path.join(migDir, name, "migration.sql"), "utf8");
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(
        'INSERT INTO "_prisma_migrations"(id, checksum, migration_name, started_at, finished_at, applied_steps_count) VALUES ($1,$2,$3,now(),now(),1)',
        [crypto.randomUUID(), crypto.createHash("sha256").update(sql).digest("hex"), name],
      );
      await db.query("COMMIT");
      applied++;
    } catch (e) {
      await db.query("ROLLBACK");
      throw new Error(`La migración ${name} falló en el destino: ${e.message}`);
    }
  }
  return applied;
}

async function tablesOf(db) {
  const rows = (
    await db.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`,
    )
  ).rows;
  return rows.map((r) => r.table_name);
}

async function columnsOf(db, table) {
  const rows = (
    await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND is_generated = 'NEVER'
        ORDER BY ordinal_position`,
      [table],
    )
  ).rows;
  return rows.map((r) => r.column_name);
}

/** Tablas en un orden que respeta las claves foráneas (padres primero). */
async function ordered(db, tables) {
  const deps = new Map(tables.map((t) => [t, new Set()]));
  const fk = (
    await db.query(
      `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
         FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.contype = 'f' AND n.nspname = 'public'`,
    )
  ).rows;
  const clean = (t) => t.replace(/^public\./, "").replace(/^"|"$/g, "");
  for (const { child, parent } of fk) {
    const c = clean(child);
    const p = clean(parent);
    if (deps.has(c) && deps.has(p) && c !== p) deps.get(c).add(p);
  }
  const out = [];
  const seen = new Set();
  const visit = (t, stack = new Set()) => {
    if (seen.has(t) || stack.has(t)) return;
    stack.add(t);
    for (const p of deps.get(t)) visit(p, stack);
    seen.add(t);
    out.push(t);
  };
  for (const t of [...tables].sort()) visit(t);
  return out;
}

async function primaryKey(db, table) {
  const rows = (
    await db.query(
      `SELECT a.attname FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass AND i.indisprimary`,
      [`public.${q(table)}`],
    )
  ).rows;
  return rows.map((r) => r.attname);
}

async function count(db, table) {
  return Number((await db.query(`SELECT COUNT(*)::text AS n FROM ${q(table)}`)).rows[0].n);
}

async function copyTable(src, dst, table) {
  const srcCols = new Set(await columnsOf(src, table));
  const cols = (await columnsOf(dst, table)).filter((c) => srcCols.has(c));
  if (cols.length === 0) return 0;
  const pk = await primaryKey(src, table);
  const order = pk.length ? pk.map(q).join(", ") : "ctid";
  const list = cols.map(q).join(", ");
  const batch = Math.max(1, Math.min(500, Math.floor(30000 / cols.length)));
  let copied = 0;
  for (let offset = 0; ; offset += batch) {
    const { rows } = await src.query(`SELECT ${list} FROM ${q(table)} ORDER BY ${order} LIMIT ${batch} OFFSET ${offset}`);
    if (rows.length === 0) break;
    const values = [];
    const tuples = rows.map((row, r) => {
      cols.forEach((c) => values.push(row[c]));
      return `(${cols.map((_, i) => `$${r * cols.length + i + 1}`).join(", ")})`;
    });
    await dst.query(`INSERT INTO ${q(table)} (${list}) VALUES ${tuples.join(", ")}`, values);
    copied += rows.length;
    if (rows.length < batch) break;
  }
  return copied;
}

(async () => {
  const src = client(origen);
  const dst = client(destino);
  console.log(`Origen:  ${hostOf(origen)}`);
  console.log(`Destino: ${hostOf(destino)}`);
  await src.connect();
  await dst.connect();
  try {
    const applied = await migrate(dst);
    console.log(applied ? `✔ Tablas creadas en el destino (${applied} migraciones).` : "✔ El destino ya tenía las tablas.");

    const tables = await ordered(src, await tablesOf(src));
    const dstTables = new Set(await tablesOf(dst));
    const missing = tables.filter((t) => !dstTables.has(t));
    if (missing.length) console.warn(`⚠ Estas tablas no existen en el destino y no se copian: ${missing.join(", ")}`);
    const toCopy = tables.filter((t) => dstTables.has(t));

    const withData = [];
    for (const t of toCopy) if ((await count(dst, t)) > 0) withData.push(t);
    if (withData.length && !reemplazar) {
      console.error(
        `✖ El destino ya tiene datos (${withData.slice(0, 5).join(", ")}${withData.length > 5 ? "…" : ""}).\n` +
          "  No copio para no mezclar. Si quieres vaciarlo y copiar de nuevo, añade COPIAR_REEMPLAZAR=si.",
      );
      process.exitCode = 2;
      return;
    }

    await dst.query("BEGIN");
    try {
      // Sin revisar claves foráneas mientras se copia (se copian todas las filas).
      await dst.query("SET LOCAL session_replication_role = replica").catch(async () => {
        await dst.query("ROLLBACK");
        await dst.query("BEGIN");
        console.warn("⚠ El destino no permite pausar las claves foráneas: copio en orden de dependencias.");
      });
      if (withData.length) {
        await dst.query(`TRUNCATE ${toCopy.map(q).join(", ")} CASCADE`);
        console.log("✔ Destino vaciado.");
      }
      for (const t of toCopy) {
        const n = await copyTable(src, dst, t);
        console.log(`  ${t}: ${n} filas`);
      }
      await dst.query("COMMIT");
    } catch (e) {
      await dst.query("ROLLBACK").catch(() => undefined);
      throw e;
    }

    let ok = true;
    for (const t of toCopy) {
      const [a, b] = [await count(src, t), await count(dst, t)];
      if (a !== b) {
        ok = false;
        console.error(`✖ ${t}: origen ${a} filas, destino ${b}`);
      }
    }
    if (ok) {
      console.log(`\n✔ Copia completa: ${toCopy.length} tablas, las filas coinciden.`);
      console.log("  Ahora cambia DATABASE_URL por la de destino y reinicia la app.");
    } else {
      process.exitCode = 3;
    }
  } finally {
    await src.end().catch(() => undefined);
    await dst.end().catch(() => undefined);
  }
})().catch((e) => {
  console.error(`✖ No se pudo copiar: ${e.message}`);
  process.exit(1);
});
