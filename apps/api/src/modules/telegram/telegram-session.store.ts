import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Persists the GramJS StringSession per workspace as a plain file
 * (`<dir>/<slug>.session`). Mirrors the Baileys SessionManager: lets the API
 * resume authorized Telegram accounts after a restart without re-scanning.
 */
export class TelegramSessionStore {
  constructor(private readonly dir: string) {
    try {
      mkdirSync(this.dir, { recursive: true });
    } catch {
      /* ignore */
    }
  }

  private file(slug: string): string {
    return join(this.dir, `${slug.replace(/[^a-z0-9_-]/gi, "_")}.session`);
  }

  load(slug: string): string {
    const f = this.file(slug);
    try {
      return existsSync(f) ? readFileSync(f, "utf8").trim() : "";
    } catch {
      return "";
    }
  }

  save(slug: string, session: string): void {
    try {
      writeFileSync(this.file(slug), session, "utf8");
    } catch {
      /* ignore */
    }
  }

  delete(slug: string): void {
    try {
      rmSync(this.file(slug), { force: true });
    } catch {
      /* ignore */
    }
  }

  /** Workspace slugs that have a stored session (to resume on boot). */
  listSessions(): string[] {
    try {
      return readdirSync(this.dir)
        .filter((f) => f.endsWith(".session"))
        .map((f) => f.replace(/\.session$/, ""));
    } catch {
      return [];
    }
  }
}
