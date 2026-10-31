import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ModuleRef } from "@nestjs/core";
import {
  SALES_PLANS,
  formatPaymentAmount,
  planPayerFields,
  salesPlanId,
  type PaymentCurrency,
} from "@nv/domain";

import type { AppConfig } from "../../config/configuration";
import { MailService } from "../../common/mail.service";
import { WhatsappService } from "../whatsapp/whatsapp.service";

export interface PlanPaymentAlert {
  id: string;
  forWorkspace: string;
  forName: string;
  planId: string | null;
  amount: number;
  currency: string;
  localAmount?: number | null;
  localCurrency?: string | null;
  rate?: number | null;
  methodKind: string;
  methodLabel: string;
  reference: string;
  payer: Record<string, string>;
  sentBy: string;
  receipt?: { buf: Buffer; type: string; ext: string };
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** The plain lines of an alert (shared by WhatsApp and email). */
export function alertLines(a: PlanPaymentAlert): string[] {
  const plan = SALES_PLANS[salesPlanId(a.planId) ?? "pro"].name;
  const amount = formatPaymentAmount(a.amount, a.currency as PaymentCurrency);
  const local =
    a.localAmount != null && a.localCurrency
      ? ` (${formatPaymentAmount(a.localAmount, a.localCurrency as PaymentCurrency)}${a.rate ? ` a ${a.rate} Bs/USDT` : ""})`
      : "";
  const lines = [
    `Marca: ${a.forName} (${a.forWorkspace})`,
    `Plan ${plan}: ${amount}${local}`,
    `Método: ${a.methodLabel}`,
    `Referencia: ${a.reference}`,
  ];
  for (const f of planPayerFields(a.methodKind)) {
    const v = a.payer[f.key];
    if (v) lines.push(`${f.label}: ${v}`);
  }
  lines.push(`Enviado por: ${a.sentBy}`);
  return lines;
}

/**
 * Tell the operator a customer sent a plan payment: by WhatsApp (from the
 * billing brand's connected number to NV_ADMIN_WHATSAPP) and by email to the
 * platform admins, with the receipt attached to the email. Both are best
 * effort: a failed alert never fails the payment (the in-app notice and the
 * /admin list are always there). The WhatsApp text has no receipt: it stays
 * private, behind the admin login.
 */
@Injectable()
export class PlanPaymentAlerts {
  private readonly logger = new Logger(PlanPaymentAlerts.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly mail: MailService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async send(a: PlanPaymentAlert): Promise<{ whatsapp: boolean; email: number }> {
    const lines = alertLines(a);
    const link = `${this.config.get("appUrl", { infer: true })}/admin`;
    const [whatsapp, email] = await Promise.all([
      this.whatsapp(a, lines, link),
      this.email(a, lines, link),
    ]);
    return { whatsapp, email };
  }

  private async whatsapp(a: PlanPaymentAlert, lines: string[], link: string): Promise<boolean> {
    const billing = this.config.get("billing", { infer: true });
    if (!billing.adminWhatsapp || !billing.operatorWorkspace) return false;
    try {
      const wa = this.moduleRef.get(WhatsappService, { strict: false });
      if (!wa.isConnected(billing.operatorWorkspace)) return false;
      const text = [
        `💳 *Pago de plan por aprobar*`,
        ...lines,
        "",
        `Revisa el comprobante y apruébalo aquí: ${link}`,
      ].join("\n");
      await wa.sendText(billing.operatorWorkspace, billing.adminWhatsapp, text);
      return true;
    } catch (err) {
      this.logger.warn(
        `No se pudo avisar del pago ${a.id} por WhatsApp: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private async email(a: PlanPaymentAlert, lines: string[], link: string): Promise<number> {
    const to = this.config.get("superAdmins", { infer: true });
    if (to.length === 0) return 0;
    const html = `<p><strong>Pago de plan por aprobar</strong></p><ul>${lines
      .map((l) => `<li>${esc(l)}</li>`)
      .join(
        "",
      )}</ul><p>Revisa el comprobante adjunto y apruébalo o recházalo en <a href="${esc(link)}">${esc(link)}</a>.</p>`;
    const attachments = a.receipt
      ? [
          {
            filename: `comprobante-${a.forWorkspace}.${a.receipt.ext}`,
            content: a.receipt.buf,
            contentType: a.receipt.type,
          },
        ]
      : undefined;
    let sent = 0;
    for (const address of to) {
      const r = await this.mail.send({
        to: address,
        subject: `Pago de plan por aprobar · ${a.forName}`,
        html,
        text: [...lines, "", `Aprobar: ${link}`].join("\n"),
        attachments,
      });
      if (r.sent) sent++;
    }
    return sent;
  }
}
