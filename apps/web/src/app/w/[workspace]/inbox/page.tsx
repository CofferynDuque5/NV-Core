import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  CHANNELS,
  INBOX_CHANNEL_IDS,
  initialsOf,
  paymentInstructions,
  type ChannelId,
  type Conversation,
} from "@nv/domain";
import {
  CheckCircle2,
  Clock,
  IdCard,
  Package,
  Wallet,
  Zap,
  Hand,
  Inbox,
  Mail,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  Send,
  StickyNote,
  Tag,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { UNASSIGNED, fillReply, firstReplyLabel, waitInfo, withLabel, withoutLabel, type InboxStatus } from "@/lib/inbox";
import { productChatText } from "@/lib/products";
import { methodsFor } from "@/lib/payments";
import { useAuthStore } from "@/stores/auth-store";
import {
  useConversationContact,
  useConversations,
  useMessages,
  usePaymentMethods,
  useProducts,
  useQuickReplies,
  useTeam,
} from "@/hooks/use-domain-data";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  useAddNote,
  useDeleteConversation,
  useResolveConversation,
  useSendMessage,
  useUpdateConversation,
} from "@/hooks/use-domain-mutations";
import { useConfirm } from "@/providers/confirm-provider";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChannelChip } from "@/components/common/channel-badge";
import { ConversationCreateDialog } from "@/components/entities/conversation-create-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import { QuickRepliesDialog, matchReplies } from "@/components/inbox/quick-replies";
import { ChatContactCard } from "@/components/inbox/chat-contact-card";

const selectClass =
  "h-9 rounded-lg border border-line-soft bg-panel px-2 text-xs text-ink focus-visible:border-brand/60 focus-visible:outline-none";

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** "Hoy" / "Ayer" / "lun 3 sep" separators between message groups. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, today)) return "Hoy";
  if (same(d, yesterday)) return "Ayer";
  return d.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
}

const STATUSES: { v: InboxStatus; label: string }[] = [
  { v: "open", label: "Abiertas" },
  { v: "resolved", label: "Resueltas" },
  { v: "all", label: "Todas" },
];

export default function InboxPage() {
  const team = useTeam();
  // `?c=` (from the global search) opens that conversation.
  const [searchParams] = useSearchParams();
  const linked = searchParams.get("c");
  const [selected, setSelected] = React.useState<string | null>(linked);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [labelDraft, setLabelDraft] = React.useState("");

  // Filters
  const [q, setQ] = React.useState(() => searchParams.get("q") ?? "");
  const [channel, setChannel] = React.useState("");
  const [status, setStatus] = React.useState<InboxStatus>(
    linked || searchParams.get("q") ? "all" : "open",
  );
  const [assignee, setAssignee] = React.useState("");
  const [waiting, setWaiting] = React.useState(false);
  const me = useAuthStore((s) => s.user?.email) ?? "";
  // Composer mode: reply to the contact, or an internal note only the team sees.
  const [noteMode, setNoteMode] = React.useState(false);
  const [repliesOpen, setRepliesOpen] = React.useState(false);
  const [charging, setCharging] = React.useState(false);
  const [showCard, setShowCard] = React.useState(true);
  const workspace = useWorkspace();
  const replies = useQuickReplies();
  const products = useProducts();
  const payMethods = usePaymentMethods();
  const draftRef = React.useRef<HTMLTextAreaElement>(null);
  const [debouncedQ, setDebouncedQ] = React.useState(() => (searchParams.get("q") ?? "").trim());
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Search and filters run on the server; pages load as the list is scrolled.
  const conversations = useConversations({
    q: debouncedQ || undefined,
    channel: (channel || undefined) as ChannelId | undefined,
    status,
    assignee: assignee || undefined,
    waiting: waiting || undefined,
  });
  const pages = conversations.data?.pages ?? [];
  const filtered = React.useMemo(() => pages.flatMap((p) => p.items), [pages]);
  const total = pages[0]?.total ?? 0;
  const openTotal = pages[0]?.openCount ?? 0;
  const waitingTotal = pages[0]?.waitingCount ?? 0;
  // "Abiertas" is the default view: with nothing open the inbox reads as empty.
  const hasFilters = !!(debouncedQ || channel || assignee || waiting || status === "resolved");

  const messages = useMessages(selected);
  const send = useSendMessage(selected);
  const addNote = useAddNote(selected);
  const chatContact = useConversationContact(selected);
  const resolve = useResolveConversation();
  const updateConv = useUpdateConversation();
  const deleteConv = useDeleteConversation();
  const confirm = useConfirm();

  const members = team.data ?? [];
  const nameByEmail = React.useMemo(
    () => Object.fromEntries(members.map((m) => [m.email, m.name])),
    [members],
  );
  // Keep the open thread on screen even when a filter (e.g. "Abiertas" after
  // resolving it) drops it from the loaded list.
  const [pinned, setPinned] = React.useState<Conversation | null>(null);
  const listed = filtered.find((c) => c.id === selected) ?? null;
  React.useEffect(() => {
    if (listed) setPinned(listed);
  }, [listed]);
  const active = listed ?? (pinned?.id === selected ? pinned : null);

  // Chronological thread (oldest → newest) so it reads like a real chat.
  const thread = React.useMemo(
    () =>
      [...(messages.data ?? [])].sort(
        (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
      ),
    [messages.data],
  );
  // Follow new messages like a chat app: jump to the newest when a chat opens,
  // and keep following while the user is at the bottom (not while reading back).
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const atBottom = React.useRef(true);
  const lastId = thread[thread.length - 1]?.id;
  React.useEffect(() => {
    atBottom.current = true;
  }, [selected]);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [lastId, selected]);

  // Opening a chat marks it as read.
  const openChat = (c: Conversation) => {
    setSelected(c.id);
    if (c.unread > 0) updateConv.mutate({ id: c.id, input: { unread: false } });
  };

  async function removeChat(c: Conversation) {
    const ok = await confirm({
      title: "Eliminar chat",
      description: `Se borra la conversación con ${c.contactName} del panel (no de tu teléfono). Si te vuelve a escribir, aparecerá de nuevo.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    deleteConv.mutate(c.id, {
      onSuccess: () => {
        setSelected(null);
        setPinned(null);
      },
    });
  }

  function submitMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !selected) return;
    atBottom.current = true;
    if (noteMode) addNote.mutate(draft.trim(), { onSuccess: () => setDraft("") });
    else send.mutate(draft.trim(), { onSuccess: () => setDraft("") });
  }

  /** Put text in the reply box (replacing a «/atajo» being typed) and focus it. */
  function insert(text: string) {
    setNoteMode(false);
    setDraft((cur) => (cur.startsWith("/") || !cur.trim() ? text : `${cur.trimEnd()}\n${text}`));
    window.setTimeout(() => {
      const el = draftRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
  }

  const pickReply = (text: string) =>
    insert(fillReply(text, { contactName: active?.contactName, brandName: workspace.name }));

  // Typing «/pre» suggests saved replies whose name or text match.
  const slash = draft.startsWith("/") && !draft.includes("\n") ? draft.slice(1) : null;
  const suggestions = slash !== null ? matchReplies(replies.data ?? [], slash) : [];

  function addLabel() {
    if (!active || !labelDraft.trim()) return;
    updateConv.mutate(
      { id: active.id, input: { labels: withLabel(active.labels, labelDraft) } },
      { onSuccess: setPinned },
    );
    setLabelDraft("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Conversaciones unificadas"
        title="Inbox"
        description="Todas tus conversaciones de WhatsApp, Instagram, Telegram y más, con asignación y etiquetas."
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" /> Nueva conversación
          </Button>
        }
      />

      <div
        className={cn(
          "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_1fr]",
          active && showCard && "2xl:grid-cols-[minmax(0,340px)_1fr_280px]",
        )}
      >
        {/* Conversation list + filters */}
        <Panel className="flex max-h-[74vh] flex-col overflow-hidden">
          <div className="border-line space-y-2 border-b p-3">
            <div className="relative">
              <Search className="text-ink-faint pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre, etiqueta o mensaje…"
                className="pl-9"
                aria-label="Buscar conversaciones"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => (
                <button
                  key={s.v}
                  onClick={() => setStatus(s.v)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    status === s.v
                      ? "bg-brand/15 text-ink-bright"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {s.label}
                </button>
              ))}
              <span className="text-ink-faint ml-auto self-center text-[11px]">
                {openTotal} abiertas
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="inbox-quick-filters">
              {me ? (
                <button
                  type="button"
                  aria-pressed={assignee === me}
                  onClick={() => setAssignee(assignee === me ? "" : me)}
                  data-testid="inbox-filter-mine"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                    assignee === me ? "border-brand/60 bg-brand/10 text-ink" : "border-line-soft text-ink-muted hover:text-ink",
                  )}
                >
                  <UserRound className="size-3.5" /> Mías
                </button>
              ) : null}
              <button
                type="button"
                aria-pressed={assignee === UNASSIGNED}
                onClick={() => setAssignee(assignee === UNASSIGNED ? "" : UNASSIGNED)}
                data-testid="inbox-filter-unassigned"
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  assignee === UNASSIGNED ? "border-brand/60 bg-brand/10 text-ink" : "border-line-soft text-ink-muted hover:text-ink",
                )}
              >
                Sin asignar
              </button>
              <button
                type="button"
                aria-pressed={waiting}
                onClick={() => setWaiting((w) => !w)}
                data-testid="inbox-filter-waiting"
                title="Chats abiertos cuyo último mensaje es del cliente: nadie le ha respondido todavía."
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  waiting
                    ? "border-state-warning/60 bg-state-warning/10 text-ink"
                    : "border-line-soft text-ink-muted hover:text-ink",
                )}
              >
                <Clock className="size-3.5" /> Sin responder
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                    waitingTotal > 0 ? "bg-state-warning/20 text-state-warning" : "bg-panel-high text-ink-faint",
                  )}
                  data-testid="inbox-waiting-count"
                >
                  {waitingTotal}
                </span>
              </button>
            </div>
            <div className="flex gap-1.5">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className={cn(selectClass, "flex-1")}
                aria-label="Filtrar por canal"
              >
                <option value="">Todos los canales</option>
                {INBOX_CHANNEL_IDS.map((c) => (
                  <option key={c} value={c}>
                    {CHANNELS[c].name}
                  </option>
                ))}
              </select>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className={cn(selectClass, "flex-1")}
                aria-label="Filtrar por responsable"
              >
                <option value="">Cualquier responsable</option>
                <option value={UNASSIGNED}>Sin asignar</option>
                {members.map((m) => (
                  <option key={m.email} value={m.email}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {conversations.isLoading ? (
              <ListSkeleton rows={5} />
            ) : filtered.length === 0 && !hasFilters ? (
              <EmptyState
                icon={Inbox}
                title="Bandeja vacía"
                description="Crea una conversación o conecta un canal para recibir mensajes."
                compact
              />
            ) : filtered.length === 0 ? (
              <p className="text-ink-faint py-8 text-center text-xs">
                Ninguna conversación coincide con los filtros.
              </p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => openChat(c)}
                      data-testid="inbox-conversation"
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                        selected === c.id ? "bg-brand/12" : "hover:bg-panel-raised",
                      )}
                    >
                      <span className="relative shrink-0">
                        <span className="bg-panel-high text-ink-muted grid size-9 place-items-center rounded-full text-xs font-bold">
                          {c.contactInitials || initialsOf(c.contactName)}
                        </span>
                        <ChannelChip
                          id={c.channel}
                          className="ring-panel absolute -bottom-1 -right-1 size-4 ring-2"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "text-ink min-w-0 flex-1 truncate text-sm",
                              c.unread > 0 ? "font-bold" : "font-medium",
                            )}
                          >
                            {c.contactName}
                          </span>
                          {c.lastMessageAt ? (
                            <span className="text-ink-faint shrink-0 text-[10px] tabular-nums">
                              {timeOf(c.lastMessageAt)}
                            </span>
                          ) : null}
                          {c.resolved ? (
                            <CheckCircle2 className="text-state-success size-3.5 shrink-0" />
                          ) : null}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-ink-faint min-w-0 flex-1 truncate text-xs">
                            {c.preview}
                          </span>
                          {c.unread > 0 ? (
                            <span className="bg-brand grid min-w-[18px] shrink-0 place-items-center rounded-full px-1 text-[10px] font-bold text-white">
                              {c.unread}
                            </span>
                          ) : null}
                        </span>
                        {(() => {
                          const w = waitInfo(c.waitingSince);
                          return w ? (
                            <span
                              data-testid="inbox-wait"
                              title="Tiempo que el cliente lleva esperando respuesta"
                              className={cn(
                                "mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                                w.late ? "bg-state-danger/12 text-state-danger" : "bg-state-warning/12 text-state-warning",
                              )}
                            >
                              <Clock className="size-3" /> Espera {w.label}
                            </span>
                          ) : null;
                        })()}
                        {(c.labels ?? []).length > 0 ? (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {(c.labels ?? []).map((l) => (
                              <span
                                key={l}
                                className="bg-panel-high text-ink-muted rounded px-1.5 py-0.5 text-[10px]"
                              >
                                {l}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                      {c.assignee ? (
                        <span
                          title={nameByEmail[c.assignee] ?? c.assignee}
                          className="bg-brand/20 text-brand grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                        >
                          {initialsOf(nameByEmail[c.assignee] ?? c.assignee)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {conversations.hasNextPage ? (
              <div className="pt-2 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void conversations.fetchNextPage()}
                  disabled={conversations.isFetchingNextPage}
                >
                  {conversations.isFetchingNextPage
                    ? "Cargando…"
                    : `Cargar más (${filtered.length} de ${total})`}
                </Button>
              </div>
            ) : null}
          </div>
        </Panel>

        {/* Thread */}
        <Panel className="flex h-[74vh] flex-col overflow-hidden">
          {!active ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={MessageSquare}
                title="Selecciona una conversación"
                description="Aquí verás el hilo completo y podrás responder, asignar o etiquetar."
              />
            </div>
          ) : (
            <>
              <PanelHeader
                title={active.contactName}
                description={[
                  CHANNELS[active.channel].name,
                  active.contactHandle,
                  firstReplyLabel(active.firstReplyMins),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                action={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={showCard ? "Ocultar ficha del cliente" : "Ver ficha del cliente"}
                      aria-label="Ficha del cliente"
                      aria-pressed={showCard}
                      data-testid="inbox-card-toggle"
                      onClick={() => setShowCard((v) => !v)}
                    >
                      <IdCard className="size-4" />
                    </Button>
                    {me && active.assignee !== me && members.some((m) => m.email === me) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="inbox-take"
                        title="Asignarme este chat"
                        onClick={() =>
                          updateConv.mutate(
                            { id: active.id, input: { assignee: me } },
                            { onSuccess: setPinned },
                          )
                        }
                      >
                        <Hand className="size-4" /> Tomar
                      </Button>
                    ) : null}
                    <label className="text-ink-faint flex items-center gap-1 text-xs">
                      <UserRound className="size-3.5" />
                      <select
                        value={active.assignee ?? ""}
                        onChange={(e) =>
                          updateConv.mutate(
                            { id: active.id, input: { assignee: e.target.value } },
                            { onSuccess: setPinned },
                          )
                        }
                        className={selectClass}
                        aria-label="Asignar responsable"
                      >
                        <option value="">Sin asignar</option>
                        {members.map((m) => (
                          <option key={m.email} value={m.email}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Marcar como no leído"
                      aria-label="Marcar como no leído"
                      onClick={() =>
                        updateConv.mutate(
                          { id: active.id, input: { unread: true } },
                          {
                            onSuccess: () => {
                              setSelected(null);
                              setPinned(null);
                            },
                          },
                        )
                      }
                    >
                      <Mail className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Eliminar chat"
                      aria-label="Eliminar chat"
                      className="text-ink-faint hover:text-state-danger"
                      onClick={() => void removeChat(active)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                    <Button
                      variant={active.resolved ? "secondary" : "outline"}
                      size="sm"
                      onClick={() =>
                        resolve.mutate(
                          { id: active.id, resolved: !active.resolved },
                          { onSuccess: setPinned },
                        )
                      }
                    >
                      {active.resolved ? (
                        <>
                          <RotateCcw className="size-4" /> Reabrir
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="size-4" /> Resolver
                        </>
                      )}
                    </Button>
                  </div>
                }
              />

              {/* Labels bar */}
              <div className="border-line flex flex-wrap items-center gap-1.5 border-b px-4 py-2">
                <Tag className="text-ink-faint size-3.5" />
                {(active.labels ?? []).map((l) => (
                  <span
                    key={l}
                    className="bg-panel-high text-ink inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                  >
                    {l}
                    <button
                      onClick={() =>
                        updateConv.mutate(
                          { id: active.id, input: { labels: withoutLabel(active.labels, l) } },
                          { onSuccess: setPinned },
                        )
                      }
                      className="text-ink-faint hover:text-state-danger"
                      aria-label={`Quitar etiqueta ${l}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLabel();
                    }
                  }}
                  placeholder="Añadir etiqueta…"
                  className="border-line-soft text-ink placeholder:text-ink-faint h-6 w-28 rounded-md border border-dashed bg-transparent px-2 text-[11px] focus:outline-none"
                  aria-label="Añadir etiqueta"
                />
              </div>

              <div
                ref={scrollRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
                className="bg-panel-raised/40 min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4"
              >
                {messages.isLoading ? (
                  <ListSkeleton rows={3} />
                ) : thread.length === 0 ? (
                  <p className="text-ink-muted py-8 text-center text-sm">
                    No hay mensajes todavía. Escribe el primero.
                  </p>
                ) : (
                  thread.map((m, i) => {
                    const prev = thread[i - 1];
                    const newDay = !prev || dayLabel(prev.at) !== dayLabel(m.at);
                    const out = m.direction === "out";
                    const note = m.direction === "note";
                    return (
                      <React.Fragment key={m.id}>
                        {newDay ? (
                          <div className="flex items-center gap-3 py-2">
                            <span className="bg-line-soft h-px flex-1" />
                            <span className="bg-panel text-ink-faint rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                              {dayLabel(m.at)}
                            </span>
                            <span className="bg-line-soft h-px flex-1" />
                          </div>
                        ) : null}
                        {note ? (
                          <div className="flex justify-center" data-testid="inbox-note">
                            <div className="w-full max-w-[85%] rounded-lg border border-dashed border-amber-400/60 bg-amber-300/10 px-3 py-2 text-sm">
                              <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                                <StickyNote className="size-3" />
                                Nota interna
                                {m.author ? <span className="normal-case tracking-normal">· {nameByEmail[m.author] ?? m.author}</span> : null}
                                <span className="text-ink-faint ml-auto font-normal normal-case tracking-normal">
                                  el cliente no la ve · {timeOf(m.at)}
                                </span>
                              </div>
                              <span className="text-ink whitespace-pre-wrap break-words">{m.text}</span>
                            </div>
                          </div>
                        ) : (
                        <div className={cn("flex", out ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[75%] rounded-2xl px-3 py-1.5 text-sm shadow-sm",
                              out
                                ? "bg-brand rounded-br-md text-white"
                                : "border-line-soft bg-panel text-ink rounded-bl-md border",
                            )}
                          >
                            <span className="whitespace-pre-wrap break-words">{m.text}</span>
                            <span
                              className={cn(
                                "ml-2 inline-block translate-y-0.5 text-[10px] tabular-nums",
                                out ? "text-white/70" : "text-ink-faint",
                              )}
                            >
                              {timeOf(m.at)}
                            </span>
                          </div>
                        </div>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </div>

              <form
                onSubmit={submitMessage}
                className={cn("border-line space-y-2 border-t p-3", noteMode && "bg-amber-300/5")}
              >
                <div className="flex gap-1" role="tablist" aria-label="Tipo de mensaje">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!noteMode}
                    onClick={() => setNoteMode(false)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                      !noteMode ? "bg-brand/15 text-ink-bright" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    <Send className="size-3.5" /> Responder
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={noteMode}
                    onClick={() => setNoteMode(true)}
                    data-testid="inbox-note-mode"
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
                      noteMode ? "bg-amber-300/20 text-amber-500" : "text-ink-muted hover:text-ink",
                    )}
                  >
                    <StickyNote className="size-3.5" /> Nota interna
                  </button>
                  {noteMode ? (
                    <span className="text-ink-faint self-center text-[11px]">Solo la ve tu equipo. No se envía al cliente.</span>
                  ) : null}
                  <div className="ml-auto flex items-center gap-0.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="text-ink-muted hover:text-ink inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                          data-testid="inbox-replies-menu"
                        >
                          <Zap className="size-3.5" /> Respuestas
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
                        <DropdownMenuLabel className="text-ink-faint text-[11px]">
                          Tip: escribe «/» en el mensaje para buscarlas
                        </DropdownMenuLabel>
                        {(replies.data ?? []).map((r) => (
                          <DropdownMenuItem key={r.id} onSelect={() => pickReply(r.text)} className="flex-col items-start gap-0.5">
                            <span className="text-ink text-xs font-medium">{r.title}</span>
                            <span className="text-ink-faint line-clamp-1 text-[11px]">{r.text}</span>
                          </DropdownMenuItem>
                        ))}
                        {(replies.data ?? []).length === 0 ? (
                          <p className="text-ink-faint px-2.5 py-2 text-xs">Aún no tienes respuestas guardadas.</p>
                        ) : null}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setRepliesOpen(true)} data-testid="inbox-replies-edit">
                          Editar respuestas…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="text-ink-muted hover:text-ink inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                          data-testid="inbox-product-menu"
                        >
                          <Package className="size-3.5" /> Producto
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
                        <DropdownMenuLabel className="text-ink-faint text-[11px]">Inserta nombre, descripción y precios</DropdownMenuLabel>
                        {(products.data ?? [])
                          .filter((pr) => pr.active)
                          .map((pr) => (
                            <DropdownMenuItem key={pr.id} onSelect={() => insert(productChatText(pr))}>
                              <span className="truncate text-xs">{pr.name}</span>
                            </DropdownMenuItem>
                          ))}
                        {(products.data ?? []).filter((pr) => pr.active).length === 0 ? (
                          <p className="text-ink-faint px-2.5 py-2 text-xs">No hay productos activos en la Tienda.</p>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <button
                      type="button"
                      onClick={() => setCharging(true)}
                      className="text-ink-muted hover:text-ink inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                      data-testid="inbox-charge"
                    >
                      <Wallet className="size-3.5" /> Cobrar
                    </button>
                  </div>
                </div>
                {suggestions.length > 0 ? (
                  <ul className="border-line-soft bg-panel-high rounded-lg border p-1" data-testid="inbox-slash-suggestions">
                    {suggestions.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => pickReply(r.text)}
                          className="hover:bg-panel-raised w-full rounded-md px-2 py-1.5 text-left"
                        >
                          <span className="text-ink text-xs font-medium">/{r.title}</span>
                          <span className="text-ink-faint ml-2 line-clamp-1 text-[11px]">{r.text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={draftRef}
                    value={draft}
                    rows={1}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      if (suggestions[0]) pickReply(suggestions[0].text);
                      else e.currentTarget.form?.requestSubmit();
                    }}
                    placeholder={
                      noteMode
                        ? "Nota para el equipo (el cliente no la ve)…"
                        : `Responder a ${active.contactName}… (escribe / para tus respuestas guardadas)`
                    }
                    className={cn(
                      "max-h-40 min-h-9 flex-1 resize-none py-2 [field-sizing:content]",
                      noteMode && "border-dashed border-amber-400/60",
                    )}
                    aria-label={noteMode ? "Nota interna" : "Respuesta"}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={(noteMode ? addNote.isPending : send.isPending) || !draft.trim()}
                    aria-label={noteMode ? "Guardar nota" : "Enviar"}
                  >
                    {noteMode ? <StickyNote className="size-4" /> : <Send className="size-4" />}
                  </Button>
                </div>
              </form>
            </>
          )}
        </Panel>

        {active && showCard ? (
          <Panel className="h-fit overflow-hidden lg:col-span-2 2xl:col-span-1">
            <PanelHeader title="Ficha del cliente" description="Lo que sabes de esta persona" />
            <ChatContactCard conversation={active} onCharge={() => setCharging(true)} />
          </Panel>
        ) : null}
      </div>

      <QuickRepliesDialog open={repliesOpen} onOpenChange={setRepliesOpen} />
      {active ? (
        <PaymentDialog
          open={charging}
          onOpenChange={setCharging}
          defaultContactId={chatContact.data?.contact?.id}
          defaultContactName={chatContact.data?.contact?.name}
          onCreated={(_id, p) =>
            insert(
              paymentInstructions({
                contactName: fillReply("{{nombre}}", { contactName: active.contactName }),
                concept: p.concept,
                amount: p.amount,
                currency: p.currency,
                methods: methodsFor(payMethods.data ?? [], p.currency),
              }),
            )
          }
        />
      ) : null}

      <ConversationCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(id) => setSelected(id)}
      />
    </div>
  );
}
