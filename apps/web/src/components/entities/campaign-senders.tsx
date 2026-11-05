import type { Group, TelegramStatus, WhatsappStatus } from "@nv/domain";
import { Send, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTelegramLines, useWhatsappLines } from "@/hooks/use-domain-data";
import { Label } from "@/components/ui/label";

type Line = { line: number; name: string; detail: string; connected: boolean };

/** Display name of a WhatsApp number or Telegram account («Ventas · +58 412…»). */
export function waLineName(l: Pick<WhatsappStatus, "line" | "label">): string {
  const n = l.line ?? 1;
  return l.label?.trim() || (n === 1 ? "Número principal" : `Número ${n}`);
}
export function tgLineName(l: Pick<TelegramStatus, "line" | "label">): string {
  const n = l.line ?? 1;
  return l.label?.trim() || (n === 1 ? "Cuenta principal" : `Cuenta ${n}`);
}

function waLines(data: WhatsappStatus[] | undefined): Line[] {
  return (data ?? []).map((l) => ({
    line: l.line ?? 1,
    name: waLineName(l),
    detail: l.number ? `+${l.number.replace(/^\+/, "")}` : "sin vincular",
    connected: l.status === "connected",
  }));
}
function tgLines(data: TelegramStatus[] | undefined): Line[] {
  return (data ?? []).map((l) => ({
    line: l.line ?? 1,
    name: tgLineName(l),
    detail: l.username ? `@${l.username}` : (l.phone ?? "sin vincular"),
    connected: l.status === "connected",
  }));
}

/** Whether a group is sent to with the chosen numbers (empty choice = all). */
export function groupLineAllowed(g: Pick<Group, "channel" | "line">, wa: number[], tg: number[]): boolean {
  const chosen = g.channel === "tg" ? tg : wa;
  return chosen.length === 0 || chosen.includes(g.line ?? 1);
}

/** Lookup of the brand's numbers/accounts by channel and line, for badges. */
export function useLineNames() {
  const wa = useWhatsappLines();
  const tg = useTelegramLines();
  return {
    wa: new Map(waLines(wa.data).map((l) => [l.line, l])),
    tg: new Map(tgLines(tg.data).map((l) => [l.line, l])),
    waCount: wa.data?.length ?? 0,
    tgCount: tg.data?.length ?? 0,
  };
}

/**
 * «Enviar desde»: which WhatsApp numbers and Telegram accounts send this campaign.
 * Nothing ticked = every number of the brand (each group goes out from the number
 * that is in it).
 */
export function CampaignSenders({
  wa,
  tg,
  onChange,
}: {
  wa: number[];
  tg: number[];
  onChange: (next: { wa: number[]; tg: number[] }) => void;
}) {
  const waQ = useWhatsappLines();
  const tgQ = useTelegramLines();
  const waList = waLines(waQ.data);
  const tgList = tgLines(tgQ.data);

  const toggle = (kind: "wa" | "tg", line: number) => {
    const cur = kind === "wa" ? wa : tg;
    const next = cur.includes(line) ? cur.filter((x) => x !== line) : [...cur, line].sort((a, b) => a - b);
    onChange(kind === "wa" ? { wa: next, tg } : { wa, tg: next });
  };

  const summary = (list: Line[], chosen: number[], noun: string) => {
    if (list.length === 0) return `No hay ${noun} conectad${noun.endsWith("s") ? "os" : "as"}.`;
    const used = chosen.length === 0 ? list : list.filter((l) => chosen.includes(l.line));
    if (used.length === 0) return "Ninguno.";
    return used.map((l) => `${l.name} (${l.detail})`).join(", ");
  };

  return (
    <div className="space-y-2" data-testid="campaign-senders">
      <Label>Enviar desde</Label>
      <p className="text-ink-faint text-[11px]">
        Elige con qué números sale esta campaña. Si no marcas ninguno, se usan todos: cada grupo recibe el mensaje
        desde el número que está en ese grupo.
      </p>
      <SenderRow
        icon={<Smartphone className="size-3.5 text-emerald-400" />}
        title="WhatsApp"
        list={waList}
        chosen={wa}
        onToggle={(n) => toggle("wa", n)}
        onAll={() => onChange({ wa: [], tg })}
        testid="sender-wa"
      />
      <SenderRow
        icon={<Send className="size-3.5 text-sky-400" />}
        title="Telegram"
        list={tgList}
        chosen={tg}
        onToggle={(n) => toggle("tg", n)}
        onAll={() => onChange({ wa, tg: [] })}
        testid="sender-tg"
      />
      <p className="border-line-soft bg-panel-raised text-ink rounded-lg border px-3 py-2 text-xs" data-testid="sender-summary">
        <span className="text-ink-muted">Saldrá desde → </span>
        <b>WhatsApp:</b> {summary(waList, wa, "números")} · <b>Telegram:</b> {summary(tgList, tg, "cuentas")}
      </p>
    </div>
  );
}

function SenderRow({
  icon,
  title,
  list,
  chosen,
  onToggle,
  onAll,
  testid,
}: {
  icon: React.ReactNode;
  title: string;
  list: Line[];
  chosen: number[];
  onToggle: (line: number) => void;
  onAll: () => void;
  testid: string;
}) {
  if (list.length === 0) return null;
  const all = chosen.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={testid}>
      <span className="text-ink-muted inline-flex w-20 items-center gap-1 text-xs">
        {icon}
        {title}
      </span>
      <button
        type="button"
        aria-pressed={all}
        onClick={onAll}
        className={cn(
          "rounded-full border px-2.5 py-1 text-xs transition-colors",
          all ? "border-brand/60 bg-brand/10 text-ink" : "border-line-soft text-ink-muted hover:border-line-bright",
        )}
      >
        Todos ({list.length})
      </button>
      {list.map((l) => {
        const on = chosen.includes(l.line);
        return (
          <button
            key={l.line}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(l.line)}
            title={l.connected ? "Conectado" : "Desconectado: conéctalo en Conexiones antes del envío"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
              on ? "border-brand/60 bg-brand/10 text-ink" : "border-line-soft text-ink-muted hover:border-line-bright",
            )}
          >
            <span className={cn("size-1.5 rounded-full", l.connected ? "bg-state-success" : "bg-ink-faint")} />
            {l.name}
            <span className="text-ink-faint">{l.detail}</span>
          </button>
        );
      })}
    </div>
  );
}
