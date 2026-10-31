import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";

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
 * Transactional email. Two free ways, in this order:
 * - SMTP with the brand's own mailbox (e.g. nvmarketing@ on cPanel): no
 *   third party and no domain verification;
 * - Resend over `fetch` (free tier) with `RESEND_API_KEY`.
 *
 * Fully optional: with neither the service is a no-op and returns
 * `{ sent: false }` so callers never fail because email is unconfigured.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly from: string;
  private readonly smtp?: Transporter;

  constructor(config: ConfigService<AppConfig, true>) {
    this.apiKey = config.get("integrations", { infer: true }).resend.apiKey;
    const mail = config.get("mail", { infer: true });
    this.from = mail.from;
    if (mail.smtp) {
      this.smtp = createTransport({
        host: mail.smtp.host,
        port: mail.smtp.port,
        // 465 is TLS from the start; 587/25 upgrade with STARTTLS.
        secure: mail.smtp.port === 465,
        auth: { user: mail.smtp.user, pass: mail.smtp.pass },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
      });
    }
  }

  get enabled(): boolean {
    return Boolean(this.smtp || this.apiKey);
  }

  /** Which way mail goes out (for the admin screen). */
  get provider(): "smtp" | "resend" | "none" {
    return this.smtp ? "smtp" : this.apiKey ? "resend" : "none";
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    if (this.smtp) return this.sendSmtp(this.smtp, input);
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

  private async sendSmtp(smtp: Transporter, input: SendMailInput): Promise<SendMailResult> {
    try {
      const info = (await smtp.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      })) as { messageId?: string };
      return { sent: true, id: info.messageId };
    } catch (err) {
      // Never let a failed notification break the primary action.
      this.logger.warn(`SMTP send failed: ${(err as Error).message}`);
      return { sent: false };
    }
  }
}
