import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../config/configuration";

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback. */
  text?: string;
}

export interface SendMailResult {
  /** false when no provider is configured (best-effort no-op). */
  sent: boolean;
  id?: string;
}

/**
 * Transactional email via Resend, over `fetch` (no SDK dependency).
 *
 * Fully optional: with no `RESEND_API_KEY` the service is a no-op and returns
 * `{ sent: false }` so callers never fail because email is unconfigured.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly from: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.apiKey = config.get("integrations", { infer: true }).resend.apiKey;
    this.from = config.get("mail", { infer: true }).from;
  }

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    if (!this.apiKey) return { sent: false };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          ...(input.text ? { text: input.text } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        this.logger.warn(`Resend error ${res.status}: ${body.slice(0, 200)}`);
        return { sent: false };
      }
      const data = (await res.json()) as { id?: string };
      return { sent: true, id: data.id };
    } catch (err) {
      // Never let a failed notification break the primary action.
      this.logger.warn(`Resend request failed: ${(err as Error).message}`);
      return { sent: false };
    }
  }
}
