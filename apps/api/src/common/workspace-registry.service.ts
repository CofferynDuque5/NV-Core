import { BadRequestException, Injectable } from "@nestjs/common";
import {
  getWorkspaceBySlug,
  MODULE_IDS,
  WORKSPACE_KINDS,
  WORKSPACES,
  type Workspace,
  type WorkspaceKind,
} from "@nv/domain";

import { AuthStore } from "../auth/auth.store";
import { PrismaService } from "../prisma/prisma.service";

/** Slugify a name into a URL-safe slug. Pure — unit tested. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function monogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = (words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "");
  return letters.toUpperCase() || "NV";
}

interface DbWorkspaceRow {
  slug: string;
  name: string;
  kind: string;
  accent: string;
  tagline: string | null;
}

export interface CreateWorkspaceInput {
  name: string;
  kind?: WorkspaceKind;
  accent?: string;
  tagline?: string;
}

/**
 * Single source of truth for workspaces: the 14 built-in (config) ones plus any
 * user-created ones stored in the DB. Guards and controllers resolve tenants
 * through here so DB workspaces are first-class.
 */
@Injectable()
export class WorkspaceRegistry {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: AuthStore,
  ) {}

  private mapDb(row: DbWorkspaceRow): Workspace {
    return {
      id: row.slug,
      slug: row.slug,
      name: row.name,
      kind: (WORKSPACE_KINDS as readonly string[]).includes(row.kind)
        ? (row.kind as WorkspaceKind)
        : "creative",
      accent: row.accent,
      initials: monogram(row.name),
      tagline: row.tagline ?? undefined,
      enabledModules: [...MODULE_IDS],
    };
  }

  /** Resolve a workspace by slug (config first, then DB). */
  async resolve(slug: string): Promise<Workspace | null> {
    const builtin = getWorkspaceBySlug(slug);
    if (builtin) return builtin;
    if (!this.prisma.enabled) return null;
    const row = await this.prisma.workspace.findUnique({ where: { slug } });
    return row ? this.mapDb(row) : null;
  }

  async exists(slug: string): Promise<boolean> {
    return (await this.resolve(slug)) !== null;
  }

  /** All workspaces: built-in config + user-created DB rows. */
  async listAll(): Promise<Workspace[]> {
    if (!this.prisma.enabled) return [...WORKSPACES];
    const rows = await this.prisma.workspace.findMany({ orderBy: { createdAt: "asc" } });
    return [...WORKSPACES, ...rows.map((r) => this.mapDb(r))];
  }

  /** Create a DB workspace with a unique slug; the creator becomes Owner. */
  async create(
    input: CreateWorkspaceInput,
    creator: { userId: string; email: string },
  ): Promise<Workspace> {
    if (!this.prisma.enabled) {
      throw new BadRequestException("Base de datos no configurada.");
    }
    const base = slugify(input.name);
    if (!base) throw new BadRequestException("El nombre no es válido.");

    // Ensure uniqueness across both config and DB workspaces.
    let slug = base;
    for (let i = 2; await this.exists(slug); i++) slug = `${base}-${i}`;

    const row = await this.prisma.workspace.create({
      data: {
        slug,
        name: input.name.trim(),
        kind: input.kind ?? "creative",
        accent: input.accent ?? "#5B8DEF",
        tagline: input.tagline,
        createdBy: creator.email,
      },
    });
    await this.store.upsertMembership(creator.userId, slug, "Owner");
    return this.mapDb(row);
  }
}
