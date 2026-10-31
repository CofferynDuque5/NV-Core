import * as React from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import {
  CHANNELS,
  MODULE_META,
  NAV_SECTIONS,
  categoryLabel,
  initialsOf,
  type Campaign,
  type Contact,
  type Conversation,
  type Group,
  type Product,
} from "@nv/domain";
import {
  ArrowLeft,
  Clock,
  CornerDownLeft,
  ExternalLink,
  Megaphone,
  MessageSquare,
  Plug,
  Search,
  ShoppingBag,
  UserPlus,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { CAMPAIGN_STATUS_SHORT } from "@/lib/campaigns";
import {
  clearRecents,
  highlightParts,
  matches,
  pushRecentItem,
  pushRecentQuery,
  recentItems,
  recentQueries,
  removeRecentQuery,
  type RecentItem,
} from "@/lib/search";
import { useCommandStore } from "@/stores/command-store";
import { useUiStore } from "@/stores/ui-store";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useWorkspace } from "@/hooks/use-workspace";
import { useServices } from "@/hooks/use-services";
import { usePlanLocks } from "@/hooks/use-plan-locks";
import { useCampaigns, useContacts, useGroups, useProducts } from "@/hooks/use-domain-data";
import { getNavIcon } from "./sidebar-icon";

export { fold, matches } from "@/lib/search";

type Kind = RecentItem["kind"];
type Tone = "neutral" | "ok" | "warn" | "blue" | "bad";

/** One row of the results, plus what its preview panel shows. */
interface Result {
  key: string;
  kind: Kind;
  id: string;
  title: string;
  subtitle?: string;
  badge?: { text: string; tone: Tone };
  path: string;
  /** Initials avatar (people) or an icon. */
  initials?: string;
  hue?: number;
  icon?: LucideIcon;
  iconColor?: string;
  /** Text cmdk filters on (records already matched on the server keep the term). */
  value: string;
  data?: Contact | Conversation | Campaign | Group | Product;
  description?: string;
}

const FILTERS: { id: "all" | Kind; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "contact", label: "Contactos" },
  { id: "conversation", label: "Conversaciones" },
  { id: "campaign", label: "Campañas" },
  { id: "group", label: "Grupos" },
  { id: "product", label: "Productos" },
  { id: "page", label: "Páginas" },
];

const GROUP_HEADING: Record<Kind, string> = {
  contact: "Contactos",
  conversation: "Conversaciones",
  campaign: "Campañas",
  group: "Grupos",
  product: "Productos",
  page: "Ir a",
};

const TONE: Record<Tone, string> = {
  neutral: "border-line-strong text-ink-muted",
  ok: "border-emerald-400/35 bg-emerald-400/10 text-emerald-300",
  warn: "border-amber-400/35 bg-amber-400/10 text-amber-300",
  blue: "border-brand/40 bg-brand/10 text-sky-300",
  bad: "border-red-400/35 bg-red-400/10 text-red-300",
};

const CAMPAIGN_TONE: Record<Campaign["status"], Tone> = {
  borrador: "neutral",
  programada: "blue",
  activa: "ok",
  pausada: "warn",
  completada: "neutral",
};

const STAGE_TONE: Record<Contact["stage"], Tone> = {
  Lead: "blue",
  Cliente: "ok",
  "En riesgo": "warn",
  Inactivo: "neutral",
};

const groupCls =
  "[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-faint";
const itemCls = cn(
  "group relative flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-ink-soft",
  "data-[selected=true]:bg-panel-high data-[selected=true]:text-ink data-[selected=true]:shadow-[inset_0_0_0_1px_hsl(var(--line-strong))]",
);

function hueOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function ago(iso: string | undefined | null, now = Date.now()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const min = Math.round((now - t) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

function when(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Highlight({ text, term }: { text: string; term: string }) {
  return (
    <>
      {highlightParts(text, term).map((p, i) =>
        p.hit ? (
          <mark key={i} className="bg-brand/25 rounded-[3px] px-px text-sky-200">
            {p.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function Avatar({
  initials,
  hue,
  size = "sm",
}: {
  initials: string;
  hue: number;
  size?: "sm" | "lg";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid flex-none place-items-center rounded-full font-semibold text-white",
        size === "sm" ? "size-8 text-xs" : "size-14 text-lg",
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 40) % 360} 65% 62%))`,
      }}
    >
      {initials}
    </span>
  );
}

function IconTile({
  icon: Icon,
  color,
  size = "sm",
}: {
  icon: LucideIcon;
  color?: string;
  size?: "sm" | "lg";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "border-line-strong bg-panel-high grid flex-none place-items-center border",
        size === "sm" ? "size-8 rounded-[9px]" : "size-14 rounded-2xl",
      )}
      style={color ? { color } : undefined}
    >
      <Icon className={size === "sm" ? "size-4" : "size-6"} />
    </span>
  );
}

function Badge({ text, tone }: { text: string; tone: Tone }) {
  return (
    <span
      className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px]", TONE[tone])}
    >
      {text}
    </span>
  );
}

function Lead({ r }: { r: Result }) {
  if (r.initials) return <Avatar initials={r.initials} hue={r.hue ?? 210} />;
  return <IconTile icon={r.icon ?? Search} color={r.iconColor} />;
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (shown.length === 0) return null;
  return (
    <dl className="grid grid-cols-[104px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
      {shown.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-ink-faint">{k}</dt>
          <dd className="text-ink min-w-0 break-words">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

function Bubble({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-ink-faint pb-1.5 text-[10.5px] uppercase tracking-wider">{label}</p>
      <p className="border-line-strong bg-panel-high text-ink-soft line-clamp-5 whitespace-pre-line rounded-xl rounded-bl-[4px] border px-3 py-2.5 text-[12.5px] leading-relaxed">
        {text}
      </p>
    </div>
  );
}

/** Right-hand panel: the selected result's card and what to do with it. */
function Preview({ r, onOpen }: { r: Result | null; onOpen: (r: Result, path?: string) => void }) {
  if (!r) {
    return (
      <div className="text-ink-faint grid h-full place-items-center p-8 text-center text-sm">
        Muévete por los resultados con ↑ ↓ para ver aquí su ficha.
      </div>
    );
  }
  const header = (sub?: React.ReactNode) => (
    <div className="flex items-center gap-3.5">
      {r.initials ? (
        <Avatar initials={r.initials} hue={r.hue ?? 210} size="lg" />
      ) : (
        <IconTile icon={r.icon ?? Search} color={r.iconColor} size="lg" />
      )}
      <div className="min-w-0">
        <p className="text-ink-bright truncate text-base font-semibold">{r.title}</p>
        {sub ? <p className="text-ink-faint mt-0.5 text-xs">{sub}</p> : null}
      </div>
    </div>
  );
  const primary = (label: string, Icon: LucideIcon, path?: string) => (
    <button
      type="button"
      onClick={() => onOpen(r, path)}
      className="from-brand to-brand-violet inline-flex items-center gap-1.5 rounded-[9px] bg-gradient-to-r px-3 py-1.5 text-[12.5px] font-semibold text-white"
      data-testid="search-preview-open"
    >
      <Icon className="size-4" /> {label}
    </button>
  );
  const secondary = (label: string, Icon: LucideIcon, path: string) => (
    <button
      type="button"
      onClick={() => onOpen(r, path)}
      className="border-line-bright text-ink hover:bg-panel-high inline-flex items-center gap-1.5 rounded-[9px] border px-3 py-1.5 text-[12.5px]"
    >
      <Icon className="size-4" /> {label}
    </button>
  );

  let body: React.ReactNode = null;
  let actions: React.ReactNode = primary("Abrir", ExternalLink);

  if (r.kind === "contact" && r.data) {
    const c = r.data as Contact;
    body = (
      <>
        {header([c.stage, c.company].filter(Boolean).join(" · "))}
        <div className="flex flex-wrap gap-1.5">
          <Badge text={c.stage} tone={STAGE_TONE[c.stage]} />
          {c.optOutAt ? <Badge text="Pidió no recibir mensajes" tone="bad" /> : null}
          {c.tags.slice(0, 4).map((t) => (
            <Badge key={t} text={t} tone="neutral" />
          ))}
        </div>
        <Facts
          rows={[
            ["Teléfono", c.phone],
            ["Correo", c.email],
            ["Empresa", c.company],
            [
              "Llegó desde",
              c.attribution
                ? [c.attribution.source, c.attribution.campaign].filter(Boolean).join(" · ")
                : null,
            ],
            ["Último contacto", ago(c.lastContactAt)],
            ["Creado", ago(c.createdAt)],
          ]}
        />
      </>
    );
    actions = (
      <>
        {primary("Abrir contacto", UserRound)}
        {secondary(
          "Ver sus chats",
          MessageSquare,
          `inbox?q=${encodeURIComponent(c.phone || c.name)}`,
        )}
      </>
    );
  } else if (r.kind === "conversation" && r.data) {
    const c = r.data as Conversation;
    body = (
      <>
        {header(`${CHANNELS[c.channel]?.name ?? c.channel} · ${ago(c.lastMessageAt) ?? ""}`)}
        <div className="flex flex-wrap gap-1.5">
          {c.resolved ? (
            <Badge text="Resuelta" tone="neutral" />
          ) : (
            <Badge text="Abierta" tone="blue" />
          )}
          {c.unread > 0 ? <Badge text={`${c.unread} sin leer`} tone="warn" /> : null}
          {(c.labels ?? []).slice(0, 4).map((t) => (
            <Badge key={t} text={t} tone="neutral" />
          ))}
        </div>
        <Facts
          rows={[
            ["Canal", CHANNELS[c.channel]?.name],
            ["Número / chat", c.contactHandle],
            ["Asignada a", c.assignee],
          ]}
        />
        {c.preview ? (
          <Bubble label={`Último mensaje · ${ago(c.lastMessageAt) ?? ""}`} text={c.preview} />
        ) : null}
      </>
    );
    actions = primary("Responder", MessageSquare);
  } else if (r.kind === "campaign" && r.data) {
    const c = r.data as Campaign;
    const schedule =
      c.scheduleType === "once"
        ? when(c.scheduleAt) && `Una vez · ${when(c.scheduleAt)}`
        : c.scheduleType
          ? `${c.scheduleType === "daily" ? "Diaria" : "Semanal"}${c.scheduleTimes?.length ? ` · ${c.scheduleTimes.join(", ")}` : c.scheduleAt ? ` · ${c.scheduleAt}` : ""}`
          : null;
    body = (
      <>
        {header(c.category || "Campaña")}
        <div className="flex flex-wrap gap-1.5">
          <Badge text={CAMPAIGN_STATUS_SHORT[c.status]} tone={CAMPAIGN_TONE[c.status]} />
          {c.channels.map((ch) => (
            <Badge key={ch} text={CHANNELS[ch]?.name ?? ch} tone="neutral" />
          ))}
        </div>
        <Facts
          rows={[
            ["Horario", schedule],
            ["Próximo envío", when(c.nextRunAt)],
            [
              "Desde / hasta",
              c.startDate || c.endDate ? `${c.startDate ?? "…"} → ${c.endDate ?? "…"}` : null,
            ],
            ["Avance", c.progress ? `${Math.round(c.progress)} %` : null],
          ]}
        />
        {c.message ? <Bubble label="Mensaje" text={c.message.slice(0, 400)} /> : null}
      </>
    );
    actions = primary("Abrir campaña", Megaphone);
  } else if (r.kind === "group" && r.data) {
    const g = r.data as Group;
    body = (
      <>
        {header(
          `${CHANNELS[g.channel]?.name ?? g.channel} · ${g.kind === "channel" ? "Canal" : "Grupo"}`,
        )}
        <div className="flex flex-wrap gap-1.5">
          {g.excluded ? (
            <Badge text="Apartado" tone="warn" />
          ) : (
            <Badge text="Recibe campañas" tone="ok" />
          )}
          {g.forbidsAds ? <Badge text="No permite publicidad" tone="bad" /> : null}
          {g.requiresPrice ? <Badge text="Pide precio" tone="neutral" /> : null}
        </div>
        <Facts
          rows={[
            ["Miembros", g.members ? g.members.toLocaleString("es") : null],
            ["Categoría", categoryLabel(g.category)],
            ["País", g.country ?? g.detectedCountry],
            ["Actividad", ago(g.lastActivityAt)],
          ]}
        />
        {g.description ? <Bubble label="Descripción" text={g.description.slice(0, 300)} /> : null}
      </>
    );
    actions = primary("Abrir grupo", Users);
  } else if (r.kind === "product" && r.data) {
    const p = r.data as Product;
    const img = p.images.find(
      (i) => i.url && (i.kind === "image" || i.mime?.startsWith("image/")),
    )?.url;
    body = (
      <>
        {header(p.category || "Producto")}
        {img && /^https?:\/\//i.test(img) ? (
          <img
            src={img}
            alt=""
            className="border-line-strong h-36 w-full rounded-xl border object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {p.active ? <Badge text="Activo" tone="ok" /> : <Badge text="Pausado" tone="neutral" />}
          {p.stock !== null ? (
            <Badge
              text={p.stock > 0 ? `${p.stock} en stock` : "Agotado"}
              tone={p.stock > 0 ? "neutral" : "bad"}
            />
          ) : null}
        </div>
        <Facts
          rows={[
            [
              "Precios",
              Object.entries(p.prices)
                .map(([cur, v]) => `${cur} ${v}`)
                .join(" · "),
            ],
            ["SKU", p.sku],
          ]}
        />
        {p.description ? <Bubble label="Descripción" text={p.description.slice(0, 300)} /> : null}
      </>
    );
    actions = primary("Abrir en Tienda", ShoppingBag);
  } else {
    body = (
      <>
        {header("Página del panel")}
        {r.description ? <p className="text-ink-soft text-sm">{r.description}</p> : null}
      </>
    );
    actions = primary("Ir a la página", CornerDownLeft);
  }

  return (
    <div className="flex h-full flex-col gap-4 p-5" data-testid="search-preview">
      {body}
      <div className="mt-auto flex flex-wrap gap-2 pt-2">{actions}</div>
    </div>
  );
}

/** True on phone-width screens (below Tailwind's `sm`). */
function useIsPhone(): boolean {
  const query = "(max-width: 639px)";
  const [phone, setPhone] = React.useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(query).matches,
  );
  React.useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

export function CommandPalette() {
  const { open, setOpen, query, setQuery } = useCommandStore();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const svc = useServices();
  const openCompose = useUiStore((s) => s.openCompose);
  const locks = usePlanLocks(ws.slug);
  const openPalette = React.useCallback(() => setOpen(true), [setOpen]);
  const [filter, setFilter] = React.useState<"all" | Kind>("all");
  const [selected, setSelected] = React.useState("");
  const [queries, setQueries] = React.useState<string[]>([]);
  const [opened, setOpened] = React.useState<RecentItem[]>([]);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const phone = useIsPhone();
  const [dropWidth, setDropWidth] = React.useState({ wide: 1000, narrow: 720 });

  // Results open under the search box, as wide as the screen allows.
  React.useLayoutEffect(() => {
    if (!open || phone) return;
    const measure = () => {
      const left = rootRef.current?.getBoundingClientRect().left ?? 0;
      const room = Math.max(320, window.innerWidth - left - 16);
      setDropWidth({ wide: Math.min(1000, room), narrow: Math.min(720, room) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, phone]);

  // Focus the box on open; a click anywhere else closes the results.
  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    if (phone) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, phone]);

  useKeyboardShortcut("k", openPalette, { meta: true });

  React.useEffect(() => {
    if (!open) return;
    setQueries(recentQueries(ws.slug));
    setOpened(recentItems(ws.slug));
  }, [open, ws.slug]);

  // Records of this brand, searched once there are 2+ letters.
  const term = query.trim();
  const searching = open && term.length >= 2;
  const [debounced, setDebounced] = React.useState(term);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 200);
    return () => clearTimeout(t);
  }, [term]);
  const serverOn = searching && debounced.length >= 2;
  const contacts = useContacts({ q: debounced, pageSize: 6 }, { enabled: serverOn });
  const conversations = useQuery({
    queryKey: [ws.id, "inbox", "search", debounced],
    queryFn: () => svc.inbox.conversations(ws.id, { q: debounced, status: "all", limit: 5 }),
    enabled: serverOn,
    staleTime: 10_000,
  });
  const campaigns = useCampaigns({ enabled: open });
  const groups = useGroups({ enabled: open });
  const storeOn = !locks.includes("tienda");
  const products = useProducts({ enabled: open && storeOn });

  const pages = React.useMemo(
    () => [
      ...NAV_SECTIONS.flatMap((s) =>
        s.items.map((it) => ({
          module: it.module as string,
          label: it.label,
          icon: it.icon,
          description: MODULE_META[it.module].description,
        })),
      ),
      // Web-only destinations without a domain module (see EXTRA_NAV_ITEMS).
      {
        module: "tienda",
        label: "Tienda",
        icon: "ShoppingBag",
        description: "Catálogo de productos, descripciones y precios",
      },
      {
        module: "perfil",
        label: "Mi perfil",
        icon: "Settings",
        description: "Tu nombre, contraseña y preferencias",
      },
      {
        module: "cobros",
        label: "Cobros",
        icon: "BadgeDollarSign",
        description: "Métodos de cobro y pagos por verificar",
      },
      {
        module: "informes",
        label: "Informe semanal",
        icon: "FileBarChart",
        description: "Resumen de la semana y lo que necesita atención",
      },
      {
        module: "plan",
        label: "Mi plan",
        icon: "BadgeDollarSign",
        description: "Tu plan, días restantes y pagos",
      },
      {
        module: "ayuda",
        label: "Centro de ayuda",
        icon: "LifeBuoy",
        description: "Guías y respuestas",
      },
      {
        module: "novedades",
        label: "Novedades",
        icon: "Sparkles",
        description: "Registro de cambios del producto",
      },
      {
        module: "estado",
        label: "Estado del servicio",
        icon: "Activity",
        description: "Salud de la plataforma",
      },
    ],
    [],
  );

  const results = React.useMemo<Result[]>(() => {
    if (!searching) return [];
    const out: Result[] = [];
    for (const c of (contacts.data?.items ?? []).slice(0, 6)) {
      out.push({
        key: `contact-${c.id}`,
        kind: "contact",
        id: c.id,
        title: c.name,
        subtitle: [
          c.phone ?? c.email,
          c.company,
          c.tags.length ? `Etiquetas: ${c.tags.slice(0, 2).join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        badge: { text: c.stage, tone: STAGE_TONE[c.stage] },
        path: `contactos?q=${encodeURIComponent(c.name)}&contacto=${encodeURIComponent(c.id)}`,
        initials: initialsOf(c.name),
        hue: c.avatarHue ?? hueOf(c.id),
        value: `contacto ${c.id} ${term}`,
        data: c,
      });
    }
    for (const c of (conversations.data?.items ?? []).slice(0, 5)) {
      out.push({
        key: `conversation-${c.id}`,
        kind: "conversation",
        id: c.id,
        title: c.contactName,
        subtitle: [c.preview ? `“${c.preview.slice(0, 90)}”` : null, ago(c.lastMessageAt)]
          .filter(Boolean)
          .join(" · "),
        badge:
          c.unread > 0
            ? { text: "Por responder", tone: "warn" }
            : { text: CHANNELS[c.channel]?.name ?? c.channel, tone: "neutral" },
        path: `inbox?c=${encodeURIComponent(c.id)}`,
        icon: MessageSquare,
        iconColor: CHANNELS[c.channel]?.color,
        value: `conversacion ${c.id} ${term}`,
        data: c,
      });
    }
    for (const c of (campaigns.data?.items ?? [])
      .filter((x) => matches(`${x.name} ${x.category ?? ""}`, term))
      .slice(0, 5)) {
      out.push({
        key: `campaign-${c.id}`,
        kind: "campaign",
        id: c.id,
        title: c.name,
        subtitle: [
          c.category,
          c.nextRunAt ? `próximo envío ${when(c.nextRunAt)}` : null,
          c.channels.map((ch) => CHANNELS[ch]?.name ?? ch).join(", "),
        ]
          .filter(Boolean)
          .join(" · "),
        badge: { text: CAMPAIGN_STATUS_SHORT[c.status], tone: CAMPAIGN_TONE[c.status] },
        path: `campanas?q=${encodeURIComponent(c.name)}`,
        icon: Megaphone,
        iconColor: "#9DB9F7",
        value: `campana ${c.id} ${c.name} ${c.category ?? ""}`,
        data: c,
      });
    }
    for (const g of (groups.data?.items ?? []).filter((x) => matches(x.name, term)).slice(0, 5)) {
      out.push({
        key: `group-${g.id}`,
        kind: "group",
        id: g.id,
        title: g.name,
        subtitle: [`${g.members.toLocaleString("es")} miembros`, categoryLabel(g.category)]
          .filter(Boolean)
          .join(" · "),
        badge: g.excluded
          ? { text: "Apartado", tone: "warn" }
          : { text: CHANNELS[g.channel]?.name ?? g.channel, tone: "neutral" },
        path: `grupos?q=${encodeURIComponent(g.name)}`,
        icon: Users,
        value: `grupo ${g.id} ${g.name}`,
        data: g,
      });
    }
    if (storeOn) {
      for (const p of (products.data ?? [])
        .filter((x) => matches(`${x.name} ${x.category ?? ""} ${x.sku ?? ""}`, term))
        .slice(0, 5)) {
        const price = Object.entries(p.prices)[0];
        out.push({
          key: `product-${p.id}`,
          kind: "product",
          id: p.id,
          title: p.name,
          subtitle: [
            p.category,
            price ? `${price[0]} ${price[1]}` : null,
            p.stock !== null ? `${p.stock} en stock` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          badge: p.active ? undefined : { text: "Pausado", tone: "neutral" },
          path: `tienda?q=${encodeURIComponent(p.name)}`,
          icon: ShoppingBag,
          iconColor: "#F2B84B",
          value: `producto ${p.id} ${p.name} ${p.category ?? ""} ${p.sku ?? ""}`,
          data: p,
        });
      }
    }
    for (const p of pages.filter(
      (x) => !locks.includes(x.module as never) && matches(`${x.label} ${x.description}`, term),
    )) {
      out.push({
        key: `page-${p.module}`,
        kind: "page",
        id: p.module,
        title: p.label,
        subtitle: p.description,
        path: p.module,
        icon: getNavIcon(p.icon),
        value: `pagina ${p.module} ${p.label} ${p.description}`,
        description: p.description,
      });
    }
    return out;
  }, [
    searching,
    term,
    contacts.data,
    conversations.data,
    campaigns.data,
    groups.data,
    products.data,
    storeOn,
    pages,
    locks,
  ]);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: results.length };
    for (const r of results) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [results]);
  const chips = FILTERS.filter((f) => f.id === "all" || (counts[f.id] ?? 0) > 0);
  const effective = filter !== "all" && !(counts[filter] ?? 0) ? "all" : filter;
  const shown = effective === "all" ? results : results.filter((r) => r.kind === effective);
  const byKind = (Object.keys(GROUP_HEADING) as Kind[])
    .map((k) => ({ kind: k, items: shown.filter((r) => r.kind === k) }))
    .filter((g) => g.items.length > 0);
  const current = shown.find((r) => r.key === selected) ?? shown[0] ?? null;
  const loading =
    searching && (contacts.isFetching || conversations.isFetching || term !== debounced);

  React.useEffect(() => {
    if (!open) setFilter("all");
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function go(path: string) {
    navigate(`/w/${ws.slug}/${path}`);
    close();
  }

  function openResult(r: Result, path?: string) {
    if (term.length >= 2) pushRecentQuery(ws.slug, term);
    pushRecentItem(ws.slug, {
      kind: r.kind,
      id: r.id,
      title: r.title,
      subtitle: GROUP_HEADING[r.kind].replace(/s$/, ""),
      path: r.path,
    });
    go(path ?? r.path);
  }

  function cycleFilter(dir: 1 | -1) {
    const ids = chips.map((c) => c.id);
    const i = ids.indexOf(effective);
    setFilter(ids[(i + dir + ids.length) % ids.length] ?? "all");
    setSelected("");
    listRef.current?.scrollTo({ top: 0 });
  }

  const quickActions: {
    label: string;
    hint: string;
    icon: LucideIcon;
    color: string;
    run: () => void;
  }[] = [
    {
      label: "Nueva campaña",
      hint: "Programa un envío a tus grupos",
      icon: Megaphone,
      color: "#9DB9F7",
      run: () => {
        close();
        openCompose();
      },
    },
    {
      label: "Nuevo contacto",
      hint: "Agrégalo a tus contactos",
      icon: UserPlus,
      color: "#34C38F",
      run: () => go("contactos"),
    },
    {
      label: "Conectar WhatsApp",
      hint: "Escanea el código QR",
      icon: Plug,
      color: "#25D366",
      run: () => go("conexiones"),
    },
  ];

  // Desktop: the search box stays in the top bar and results open below it.
  // Phone: the whole screen (in a portal: the bar's blur would clip it).
  const panel = (
    <Command
      shouldFilter={false}
      value={current?.key ?? ""}
      onValueChange={setSelected}
      label="Buscar en el panel"
      className={cn(
        "min-w-0",
        phone ? "bg-panel-sunken fixed inset-0 z-50 flex flex-col" : "relative",
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
        if (e.key === "Tab" && searching) {
          e.preventDefault();
          cycleFilter(e.shiftKey ? -1 : 1);
        }
      }}
    >
      <div
        className={cn(
          "flex items-center gap-3",
          phone
            ? "border-line h-14 border-b px-4"
            : "border-brand/60 bg-panel-sunken ring-brand/15 h-9 rounded-lg border px-3 ring-4",
        )}
      >
        <button
          type="button"
          onClick={close}
          className="text-ink-muted sm:hidden"
          aria-label="Cerrar"
        >
          <ArrowLeft className="size-5" />
        </button>
        <Search
          className={cn(
            "size-4 flex-none max-sm:hidden",
            loading ? "text-brand animate-pulse" : "text-brand",
          )}
        />
        <Command.Input
          ref={inputRef}
          value={query}
          onValueChange={(v) => {
            setQuery(v);
            setSelected("");
          }}
          placeholder="Busca contactos, chats, campañas, productos…"
          className="text-ink-bright placeholder:text-ink-faint h-full min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
          aria-label="Buscar"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-ink-faint hover:text-ink"
            aria-label="Borrar búsqueda"
          >
            <X className="size-4" />
          </button>
        ) : null}
        <kbd className="border-line-strong bg-panel-raised text-ink-muted rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium max-sm:hidden">
          ESC
        </kbd>
      </div>
      <div
        data-testid="command-palette"
        className={cn(
          "flex min-h-0 min-w-0 flex-col",
          phone
            ? "flex-1"
            : "border-line-strong bg-panel-sunken shadow-panel animate-fadein absolute left-0 top-[calc(100%+8px)] z-30 max-h-[calc(100dvh-80px)] overflow-hidden rounded-2xl border",
        )}
        style={phone ? undefined : { width: searching ? dropWidth.wide : dropWidth.narrow }}
      >
        {searching ? (
          <div
            className="border-line flex gap-1.5 overflow-x-auto border-b px-3.5 py-2.5 [scrollbar-width:none]"
            role="tablist"
            aria-label="Filtrar resultados"
          >
            {chips.map((f) => {
              const on = effective === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-testid={`search-filter-${f.id}`}
                  onClick={() => {
                    setFilter(f.id);
                    setSelected("");
                  }}
                  className={cn(
                    "flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                    on
                      ? "border-brand/50 from-brand/20 to-brand-violet/15 text-ink-bright bg-gradient-to-r"
                      : "border-line-strong text-ink-soft hover:text-ink",
                  )}
                >
                  {f.label}
                  <b
                    className={cn(
                      "text-[11px] font-semibold",
                      on ? "text-sky-200" : "text-ink-faint",
                    )}
                  >
                    {counts[f.id] ?? 0}
                  </b>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className={cn("min-h-0 flex-1", searching && "lg:grid lg:grid-cols-[1fr_380px]")}>
          <Command.List
            ref={listRef}
            className="h-full max-h-[min(460px,calc(100dvh-14rem))] overflow-y-auto p-2 max-sm:max-h-none"
          >
            {searching ? (
              <>
                {!loading && shown.length === 0 ? (
                  <div className="px-3 py-10 text-center">
                    <p className="text-ink text-sm">Sin resultados para “{term}”.</p>
                    <p className="text-ink-faint mt-1 text-xs">
                      Prueba con parte del nombre, un teléfono o una palabra del mensaje.
                    </p>
                  </div>
                ) : null}
                {byKind.map((g) => (
                  <Command.Group
                    key={g.kind}
                    heading={
                      <span className="flex items-center justify-between">
                        {GROUP_HEADING[g.kind]}
                        {effective === "all" && g.items.length > 1 && g.kind !== "page" ? (
                          <button
                            type="button"
                            onClick={() => setFilter(g.kind)}
                            className="text-brand text-[11.5px] normal-case tracking-normal hover:underline"
                          >
                            Ver solo {GROUP_HEADING[g.kind].toLowerCase()} →
                          </button>
                        ) : null}
                      </span>
                    }
                    className={groupCls}
                  >
                    {g.items.map((r) => (
                      <Command.Item
                        key={r.key}
                        value={r.key}
                        onSelect={() => openResult(r)}
                        className={itemCls}
                        data-testid={`search-result-${r.kind}`}
                      >
                        <span className="from-brand to-brand-violet absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b group-data-[selected=true]:block" />
                        <Lead r={r} />
                        <span className="min-w-0 flex-1">
                          <span className="text-ink block truncate text-[13.5px]">
                            <Highlight text={r.title} term={term} />
                          </span>
                          {r.subtitle ? (
                            <span className="text-ink-faint mt-0.5 block truncate text-xs">
                              <Highlight text={r.subtitle} term={term} />
                            </span>
                          ) : null}
                        </span>
                        {r.badge ? (
                          <span className="max-sm:hidden">
                            <Badge {...r.badge} />
                          </span>
                        ) : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </>
            ) : (
              <>
                <p className="text-ink-faint px-2.5 pb-2 pt-3 text-[10.5px] uppercase tracking-wider">
                  Acciones rápidas
                </p>
                <div className="grid grid-cols-1 gap-2 px-1 pb-1 sm:grid-cols-3">
                  {quickActions.map((a) => (
                    <Command.Item
                      key={a.label}
                      value={`accion-${a.label}`}
                      onSelect={a.run}
                      className="border-line-strong bg-panel data-[selected=true]:border-brand/50 data-[selected=true]:bg-panel-high flex cursor-pointer items-center gap-3 rounded-xl border p-3 sm:flex-col sm:items-start"
                    >
                      <IconTile icon={a.icon} color={a.color} />
                      <span>
                        <span className="text-ink block text-[13px]">{a.label}</span>
                        <span className="text-ink-faint block text-xs">{a.hint}</span>
                      </span>
                    </Command.Item>
                  ))}
                </div>
                {queries.length > 0 ? (
                  <Command.Group
                    heading={
                      <span className="flex items-center justify-between">
                        Búsquedas recientes
                        <button
                          type="button"
                          className="text-brand text-[11.5px] normal-case tracking-normal hover:underline"
                          onClick={() => {
                            clearRecents(ws.slug);
                            setQueries([]);
                            setOpened([]);
                          }}
                        >
                          Borrar
                        </button>
                      </span>
                    }
                    className={groupCls}
                  >
                    {queries.map((q) => (
                      <Command.Item
                        key={q}
                        value={`reciente-${q}`}
                        onSelect={() => setQuery(q)}
                        className={itemCls}
                      >
                        <Clock className="text-ink-faint size-4" />
                        <span className="flex-1 truncate">{q}</span>
                        <button
                          type="button"
                          aria-label={`Quitar «${q}»`}
                          className="text-ink-faint hover:text-ink"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQueries(removeRecentQuery(ws.slug, q));
                          }}
                        >
                          <X className="size-4" />
                        </button>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}
                {opened.length > 0 ? (
                  <Command.Group heading="Abiertos hace poco" className={groupCls}>
                    {opened.map((i) => (
                      <Command.Item
                        key={`${i.kind}-${i.id}`}
                        value={`abierto-${i.kind}-${i.id}`}
                        onSelect={() => go(i.path)}
                        className={itemCls}
                      >
                        {i.kind === "contact" ? (
                          <Avatar initials={initialsOf(i.title)} hue={hueOf(i.id)} />
                        ) : (
                          <IconTile
                            icon={
                              {
                                conversation: MessageSquare,
                                campaign: Megaphone,
                                group: Users,
                                product: ShoppingBag,
                                page: CornerDownLeft,
                                contact: UserRound,
                              }[i.kind]
                            }
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="text-ink block truncate text-[13.5px]">{i.title}</span>
                          <span className="text-ink-faint block text-xs">
                            {[i.subtitle, ago(new Date(i.at).toISOString())]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}
                <Command.Group heading="Ir a" className={groupCls}>
                  {pages
                    .filter((p) => !locks.includes(p.module as never))
                    .slice(0, 6)
                    .map((p) => {
                      const Icon = getNavIcon(p.icon);
                      return (
                        <Command.Item
                          key={p.module}
                          value={`ir-${p.module}`}
                          onSelect={() => go(p.module)}
                          className={itemCls}
                        >
                          <IconTile icon={Icon} />
                          <span className="flex-1">{p.label}</span>
                          <span className="text-ink-faint truncate text-[11px] max-sm:hidden">
                            {p.description}
                          </span>
                        </Command.Item>
                      );
                    })}
                </Command.Group>
              </>
            )}
          </Command.List>
          {searching ? (
            <aside
              className="border-line bg-panel hidden border-l lg:block"
              aria-label="Vista previa"
            >
              <Preview r={current} onOpen={openResult} />
            </aside>
          ) : null}
        </div>

        <div className="border-line bg-panel text-ink-faint flex items-center gap-4 border-t px-4 py-2.5 text-[11.5px] max-sm:hidden">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> moverse
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> abrir
          </span>
          {searching ? (
            <span className="flex items-center gap-1.5">
              <Kbd>Tab</Kbd> cambiar filtro
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd> desde cualquier pantalla
          </span>
        </div>
      </div>
    </Command>
  );

  return (
    <div
      ref={rootRef}
      className="relative min-w-0 shrink-0 sm:w-full sm:max-w-md sm:shrink"
      data-testid="topbar-search"
    >
      {!open || phone ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Buscar"
          className="border-line-soft bg-panel text-ink-faint hover:border-line-bright group flex h-9 w-9 items-center justify-center gap-2.5 rounded-lg border text-left text-sm transition-colors sm:w-full sm:justify-start sm:px-3"
        >
          <Search className="size-4" />
          <span className="hidden flex-1 truncate sm:block">
            Buscar contactos, chats, campañas…
          </span>
          <kbd className="border-line-strong bg-panel-raised text-ink-muted hidden items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-medium sm:inline-flex">
            Ctrl K
          </kbd>
        </button>
      ) : null}
      {open ? (phone ? createPortal(panel, document.body) : panel) : null}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="border-line-bright bg-panel-raised text-ink-muted rounded-md border px-1.5 py-px font-sans text-[10.5px] font-medium">
      {children}
    </kbd>
  );
}
