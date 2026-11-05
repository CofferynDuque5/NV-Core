import { Link } from "react-router-dom";
import {
  PAYMENT_STATUS_LABEL,
  formatPaymentAmount,
  type Conversation,
} from "@nv/domain";
import { ExternalLink, Loader2, ShieldOff, UserPlus, Wallet } from "lucide-react";

import { useConversationContact, usePayments } from "@/hooks/use-domain-data";
import { useCreateContact } from "@/hooks/use-domain-mutations";
import { useWorkspace } from "@/hooks/use-workspace";
import { STATUS_BADGE } from "@/lib/payments";
import { relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * «Ficha del cliente» next to the chat: the CRM contact with the same phone,
 * its stage, tags, origin and latest payments. Read-only here; editing stays
 * in Contactos.
 */
export function ChatContactCard({ conversation, onCharge }: { conversation: Conversation; onCharge: () => void }) {
  const ws = useWorkspace();
  const q = useConversationContact(conversation.id);
  const contact = q.data?.contact ?? null;
  const payments = usePayments(contact?.id);
  const create = useCreateContact();
  const handle = conversation.contactHandle ?? "";
  const digits = handle.replace(/@.*/, "").replace(/\D/g, "");
  // WhatsApp handles are phone numbers (except private «@lid» ids); Telegram ones are chat ids.
  const isPhone = conversation.channel === "wa" && !handle.includes("@lid") && digits.length >= 7;

  if (q.isLoading) {
    return (
      <div className="grid place-items-center p-6">
        <Loader2 className="text-ink-faint size-5 animate-spin" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="space-y-3 p-4 text-sm" data-testid="chat-contact-card">
        <p className="text-ink-muted text-xs">
          Este chat todavía no está en tus Contactos. Guárdalo para ver su historial de cobros y usarlo en segmentos.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={create.isPending}
          data-testid="chat-contact-create"
          onClick={() =>
            create.mutate(
              {
                name: conversation.contactName,
                ...(isPhone ? { phone: `+${digits}` } : {}),
                tags: [],
                stage: "Lead",
              },
              { onSuccess: () => void q.refetch() },
            )
          }
        >
          <UserPlus className="size-4" /> Guardar en Contactos
        </Button>
        {!isPhone ? (
          <p className="text-ink-faint text-[11px]">Sin número de teléfono: se guardará solo con el nombre.</p>
        ) : null}
      </div>
    );
  }

  const list = (payments.data ?? []).slice(0, 4);
  return (
    <div className="space-y-4 p-4 text-sm" data-testid="chat-contact-card">
      <div>
        <p className="text-ink-bright font-semibold">{contact.name}</p>
        <p className="text-ink-muted text-xs">
          {[contact.phone, contact.email, contact.company].filter(Boolean).join(" · ") || "Sin datos de contacto"}
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-ink-faint">Etapa</dt>
        <dd className="text-ink" data-testid="chat-contact-stage">{contact.stage}</dd>
        <dt className="text-ink-faint">Cliente desde</dt>
        <dd className="text-ink">{new Date(contact.createdAt).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}</dd>
        {contact.lastContactAt ? (
          <>
            <dt className="text-ink-faint">Último mensaje</dt>
            <dd className="text-ink">{relativeTime(contact.lastContactAt)}</dd>
          </>
        ) : null}
        {contact.attribution?.source ? (
          <>
            <dt className="text-ink-faint">Llegó por</dt>
            <dd className="text-ink">{contact.attribution.source}</dd>
          </>
        ) : null}
      </dl>
      {contact.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {contact.tags.map((t) => (
            <span key={t} className="bg-panel-high text-ink-muted rounded px-1.5 py-0.5 text-[10px]">
              {t}
            </span>
          ))}
        </div>
      ) : null}
      {contact.optOutAt ? (
        <p className="text-state-warning inline-flex items-center gap-1 text-xs">
          <ShieldOff className="size-3.5" /> Pidió no recibir mensajes automáticos
        </p>
      ) : null}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-ink-faint text-[11px] font-semibold uppercase tracking-wide">Cobros</p>
          <button type="button" onClick={onCharge} className="text-brand inline-flex items-center gap-1 text-xs font-medium">
            <Wallet className="size-3.5" /> Nuevo
          </button>
        </div>
        {list.length === 0 ? (
          <p className="text-ink-faint text-xs">Sin cobros todavía.</p>
        ) : (
          <ul className="space-y-1" data-testid="chat-contact-payments">
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-xs">
                <span className="text-ink min-w-0 flex-1 truncate">{p.concept}</span>
                <span className="text-ink-muted tabular-nums">{formatPaymentAmount(p.amount, p.currency)}</span>
                <Badge variant={STATUS_BADGE[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        to={`/w/${ws.slug}/contactos?contacto=${encodeURIComponent(contact.id)}`}
        className="text-ink-muted hover:text-ink inline-flex items-center gap-1 text-xs"
      >
        <ExternalLink className="size-3.5" /> Abrir en Contactos
      </Link>
    </div>
  );
}
