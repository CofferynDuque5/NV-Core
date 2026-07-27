import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * File-based WhatsApp session store. Baileys writes credentials + keys under
 * `<baseDir>/<workspaceSlug>/`; this manager owns those paths and their lifecycle.
 */
export class SessionManager {
  private readonly base: string;

  constructor(baseDir: string) {
    this.base = resolve(baseDir);
    mkdirSync(this.base, { recursive: true });
  }

  /** Absolute session directory for a workspace (created on demand). */
  dirFor(workspaceSlug: string): string {
    const dir = join(this.base, sanitize(workspaceSlug));
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** True when a workspace already has stored credentials (i.e. was linked). */
  hasSession(workspaceSlug: string): boolean {
    return existsSync(join(this.base, sanitize(workspaceSlug), "creds.json"));
  }

  /** Workspace slugs that currently have stored credentials. */
  listSessions(): string[] {
    if (!existsSync(this.base)) return [];
    return readdirSync(this.base).filter(
      (name) =>
        safeIsDir(join(this.base, name)) && existsSync(join(this.base, name, "creds.json")),
    );
  }

  /** Remove a workspace's stored credentials (on logout). */
  deleteSession(workspaceSlug: string): void {
    rmSync(join(this.base, sanitize(workspaceSlug)), { recursive: true, force: true });
  }
}

/** Keep slugs to a safe, single path segment. */
export function sanitize(slug: string): string {
  return slug.replace(/[^a-z0-9_-]/gi, "").slice(0, 64) || "default";
}

function safeIsDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
