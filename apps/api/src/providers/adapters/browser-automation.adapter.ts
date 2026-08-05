import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { Injectable, Logger } from "@nestjs/common";

import { BaseAdapter } from "./base.adapter";
import {
  AdapterUnsupportedError,
  type AdapterContext,
  type AdapterStatus,
  type HealthResult,
  type ProviderId,
  type PublishInput,
  type PublishResult,
} from "../provider.types";

/* eslint-disable @typescript-eslint/no-explicit-any */

type BrowserTarget = "facebook" | "instagram";

const HOME: Record<BrowserTarget, string> = {
  facebook: "https://www.facebook.com/",
  instagram: "https://www.instagram.com/",
};

/**
 * Publishing through headless browser automation (Playwright) for accounts
 * without Graph API access.
 *
 * Playwright is an OPTIONAL dependency: if it isn't installed the adapter stays
 * registered but reports itself unconfigured (nothing here fails the build or
 * the app). A per-workspace, per-target `storageState` JSON holds the logged-in
 * session; use {@link authenticate} once (headed) to create it, then publish()
 * reuses it headless.
 */
abstract class BrowserAutomationAdapter extends BaseAdapter {
  readonly id = "browser-automation";
  readonly label = "Automatización de navegador (Playwright)";
  protected abstract readonly target: BrowserTarget;
  private readonly logger = new Logger(BrowserAutomationAdapter.name);

  private sessionDir(): string {
    const dir = resolve(process.env.BROWSER_SESSION_DIR ?? "data/browser");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  private statePath(ctx: AdapterContext): string {
    return resolve(this.sessionDir(), `${ctx.workspaceSlug}-${this.target}.json`);
  }

  /** Load Playwright lazily; returns null when it isn't installed. */
  private async loadPlaywright(): Promise<any | null> {
    try {
      // Non-literal specifier: Playwright is an optional runtime dependency, so
      // the compiler must not try to resolve it at build time.
      const specifier = "playwright";
      return await import(specifier);
    } catch {
      return null;
    }
  }

  private hasSession(ctx: AdapterContext): boolean {
    return existsSync(this.statePath(ctx));
  }

  /** Open a headed browser so the operator can log in; persists the session. */
  override async authenticate(ctx: AdapterContext): Promise<AdapterStatus> {
    const pw = await this.loadPlaywright();
    if (!pw) throw new AdapterUnsupportedError(this.id, "authenticate (Playwright no instalado)");

    const browser = await pw.chromium.launch({ headless: false });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(HOME[this.target], { waitUntil: "domcontentloaded" });
      // Wait for the operator to finish logging in (up to 3 minutes).
      await page.waitForTimeout(180_000).catch(() => undefined);
      await context.storageState({ path: this.statePath(ctx) });
      return this.getStatus(ctx);
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  override async publish(ctx: AdapterContext, input: PublishInput): Promise<PublishResult> {
    const pw = await this.loadPlaywright();
    if (!pw) return { ok: false, error: "Playwright no está instalado en el servidor." };
    if (!this.hasSession(ctx)) {
      return { ok: false, error: "Sin sesión de navegador. Ejecuta authenticate() primero." };
    }

    const browser = await pw.chromium.launch({ headless: true, args: ["--no-sandbox"] });
    try {
      const context = await browser.newContext({ storageState: this.statePath(ctx) });
      const page = await context.newPage();
      await page.goto(HOME[this.target], { waitUntil: "domcontentloaded" });
      const id = await this.compose(page, input);
      return { ok: true, id, format: input.format ?? "feed" };
    } catch (err) {
      this.logger.warn(`Automatización ${this.target} falló: ${(err as Error).message}`);
      return { ok: false, error: (err as Error).message };
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  /** Target-specific composer flow. */
  protected abstract compose(page: any, input: PublishInput): Promise<string>;

  override async getStatus(ctx: AdapterContext): Promise<AdapterStatus> {
    const pw = await this.loadPlaywright();
    if (!pw) {
      return {
        provider: this.provider,
        adapter: this.id,
        state: "unconfigured",
        detail: "Playwright no instalado (dependencia opcional).",
      };
    }
    const ready = this.hasSession(ctx);
    return {
      provider: this.provider,
      adapter: this.id,
      state: ready ? "connected" : "disconnected",
      detail: ready ? "Sesión de navegador guardada." : "Sin sesión: usa authenticate().",
    };
  }

  override async healthCheck(ctx: AdapterContext): Promise<HealthResult> {
    const pw = await this.loadPlaywright();
    const ready = Boolean(pw) && this.hasSession(ctx);
    return {
      provider: this.provider,
      adapter: this.id,
      healthy: ready,
      configured: Boolean(pw),
      message: !pw
        ? "Instala Playwright para usar este adapter."
        : ready
          ? "Sesión de navegador lista."
          : "Falta iniciar sesión (authenticate).",
    };
  }
}

@Injectable()
export class FacebookBrowserAutomationAdapter extends BrowserAutomationAdapter {
  readonly provider: ProviderId = "facebook";
  protected readonly target: BrowserTarget = "facebook";

  protected async compose(page: any, input: PublishInput): Promise<string> {
    const text = input.message ?? "";
    // Open the "create post" composer and type the message.
    await page.getByRole("button", { name: /crear publicación|create post|qué estás pensando|what's on your mind/i })
      .first()
      .click({ timeout: 20_000 });
    const box = page.getByRole("textbox").first();
    await box.click({ timeout: 20_000 });
    if (text) await box.type(text, { delay: 10 });
    await page.getByRole("button", { name: /publicar|post/i }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(4_000);
    return `fb-web-${Date.now()}`;
  }
}

@Injectable()
export class InstagramBrowserAutomationAdapter extends BrowserAutomationAdapter {
  readonly provider: ProviderId = "instagram";
  protected readonly target: BrowserTarget = "instagram";

  protected async compose(page: any, input: PublishInput): Promise<string> {
    const text = input.message ?? "";
    // Instagram web requires an image to create a feed post.
    await page.getByRole("link", { name: /nueva publicación|new post|create/i })
      .first()
      .click({ timeout: 20_000 })
      .catch(() => undefined);
    const caption = page.getByRole("textbox").first();
    await caption.click({ timeout: 20_000 }).catch(() => undefined);
    if (text) await caption.type(text, { delay: 10 }).catch(() => undefined);
    await page.getByRole("button", { name: /compartir|share/i }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(4_000);
    return `ig-web-${Date.now()}`;
  }
}
