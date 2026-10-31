import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ConversationQuery } from "@nv/domain";

import { useServices } from "./use-services";
import { useWorkspace } from "./use-workspace";

/**
 * Typed data hooks — one per module. Each is a thin wrapper over the service
 * registry + TanStack Query, scoped by the active workspace. They currently
 * resolve empty (see empty adapters) which drives the skeleton → empty-state
 * flow in every screen. No data is fabricated.
 */

export function useCampaigns(opts: { enabled?: boolean } = {}) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "campaigns"],
    queryFn: () => svc.campaigns.list(ws.id),
    enabled: opts.enabled ?? true,
  });
}

/** «Lo que pasó hoy»: campaign runs and Inbox movement since local midnight. */
export function useDayActivity() {
  const svc = useServices();
  const ws = useWorkspace();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const since = start.toISOString();
  return useQuery({
    queryKey: [ws.id, "campaigns", "activity", since],
    queryFn: () => svc.campaigns.activity(ws.id, since),
    refetchInterval: 30_000,
  });
}

export function useTodayPosts() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "posts", "today"],
    queryFn: () => svc.posts.today(ws.id),
  });
}

export function usePosts() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "posts"], queryFn: () => svc.posts.list(ws.id) });
}

export function useOnboarding() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "onboarding"],
    queryFn: () => svc.onboarding.status(ws.id),
  });
}

/** Changelog state is product-wide (per user), so it is not workspace-keyed. */
export function useChangelog() {
  const svc = useServices();
  return useQuery({
    queryKey: ["changelog"],
    queryFn: () => svc.changelog.status(),
  });
}

/** Live platform status (product-wide); polls periodically while the page is open. */
export function useSystemStatus() {
  const svc = useServices();
  return useQuery({
    queryKey: ["system-status"],
    queryFn: () => svc.system.status(),
    refetchInterval: 30_000,
  });
}

export function useCalendarEvents(month: string) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "calendar", month],
    queryFn: () => svc.calendar.events(ws.id, month),
  });
}

export function useContacts(
  query: { q?: string; stage?: string; page?: number; pageSize?: number } = {},
  opts: { enabled?: boolean } = {},
) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [
      ws.id,
      "contacts",
      query.q ?? "",
      query.stage ?? "",
      query.page ?? 1,
      query.pageSize ?? 100,
    ],
    queryFn: () =>
      svc.contacts.list(ws.id, {
        q: query.q,
        stage: query.stage as never,
        page: query.page,
        pageSize: query.pageSize,
      }),
    enabled: opts.enabled ?? true,
    placeholderData: (prev) => prev, // keep previous page visible while refetching (no flicker)
  });
}

export function useContactNotes(contactId: string | null) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "contacts", contactId, "notes"],
    queryFn: () => svc.contacts.notes(ws.id, contactId as string),
    enabled: !!contactId,
  });
}

export function useGroups(opts: { enabled?: boolean } = {}) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "groups"], queryFn: () => svc.groups.list(ws.id), enabled: opts.enabled ?? true });
}

export function useGroupVars(groupId: string | null) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "groups", groupId, "vars"],
    queryFn: () => svc.groups.getVars(ws.id, groupId as string),
    enabled: Boolean(groupId),
  });
}

export function useCampaignLogs() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "campaigns", "logs"],
    queryFn: () => svc.campaigns.logs(ws.id),
    // Historial en vivo: refresca solo cada 10s y al volver a la pestaña.
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

export function useSocialStatus() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "social", "status"],
    queryFn: () => svc.social.status(ws.id),
  });
}

export function useSegments() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "segments"], queryFn: () => svc.segments.list(ws.id) });
}

export function useForms() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "forms"], queryFn: () => svc.forms.list(ws.id) });
}

export function useFunnels() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "funnels"], queryFn: () => svc.funnels.list(ws.id) });
}

export function useSequences() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "sequences"], queryFn: () => svc.sequences.list(ws.id) });
}

export function useAffiliates() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "affiliates"], queryFn: () => svc.affiliates.list(ws.id) });
}

export function useSequenceEnrollments(sequenceId: string | null) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "sequences", sequenceId, "enrollments"],
    queryFn: () => svc.sequences.enrollments(ws.id, sequenceId!),
    enabled: !!sequenceId,
  });
}

/** Inbox list, searched and filtered on the server, one page at a time. */
export function useConversations(filters: Omit<ConversationQuery, "cursor"> = {}) {
  const svc = useServices();
  const ws = useWorkspace();
  return useInfiniteQuery({
    queryKey: [ws.id, "inbox", "list", filters],
    queryFn: ({ pageParam }) => svc.inbox.conversations(ws.id, { ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    // Inbox en vivo: nuevos chats entrantes aparecen solos (también en segundo plano).
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
}

export function useMessages(conversationId: string | null) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "inbox", conversationId, "messages"],
    queryFn: () => svc.inbox.messages(ws.id, conversationId as string),
    enabled: Boolean(conversationId),
    refetchInterval: 4_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
}

export function useMediaFolders() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "media", "folders"],
    queryFn: () => svc.media.folders(ws.id),
  });
}

export function useMediaAssets(query: { folderId?: string; q?: string; tag?: string } = {}) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "media", "assets", query.folderId ?? "all", query.q ?? "", query.tag ?? ""],
    queryFn: () => svc.media.assets(ws.id, query),
  });
}

export function useMediaTags() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "media", "tags"], queryFn: () => svc.media.tags(ws.id) });
}

export function useTemplates() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "templates"], queryFn: () => svc.templates.list(ws.id) });
}

export function useAutomations() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "automations"], queryFn: () => svc.automations.list(ws.id) });
}

/** Real executions of one flow (newest first); refreshes while the panel is open. */
export function useAutomationRuns(automationId: string | null) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "automations", automationId, "runs"],
    queryFn: () => svc.automations.runs(ws.id, automationId!),
    enabled: !!automationId,
    refetchInterval: 15_000,
  });
}

export function useDesigns() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "designs"], queryFn: () => svc.designs.list(ws.id) });
}

export function useAnalytics(days = 30) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "analytics", days],
    queryFn: () => svc.analytics.snapshot(ws.id, days),
  });
}

export function useConnections() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "connections"], queryFn: () => svc.connections.list(ws.id) });
}

export function useIntegrations() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "integrations"],
    queryFn: () => svc.integrations.catalog(ws.id),
  });
}

export function useIntegrationCredentials() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "credentials"],
    queryFn: () => svc.integrations.credentials(ws.id),
  });
}

export function useWhatsappStatus() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "whatsapp", "status"],
    queryFn: () => svc.whatsapp.status(ws.id),
    // Mientras no está conectado (esperando QR / conectando), refresca cada 3 s
    // para que el QR aparezca por HTTP aunque el WebSocket no funcione (cPanel).
    refetchInterval: (q) => (q.state.data?.status === "connected" ? false : 3000),
  });
}

/** Health of the PC companion that publishes to Facebook/Instagram (polls every 10 s). */
export function usePcAgentStatus() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "pc-agent", "status"],
    queryFn: () => svc.pcAgent.status(ws.id),
    refetchInterval: 10_000,
  });
}

export function useTelegramStatus() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "telegram", "status"],
    queryFn: () => svc.telegram.status(ws.id),
  });
}

export function useAiUsage() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "ai", "usage"], queryFn: () => svc.ai.usage(ws.id) });
}

export function useAiRecommendations(enabled = false) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "ai", "recommendations"],
    queryFn: () => svc.ai.recommendations(ws.id),
    enabled,
  });
}

export function useGoogleStatus() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "integrations", "google"],
    queryFn: () => svc.integrations.googleStatus(ws.id),
  });
}

export function useMetaStatus() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "integrations", "meta"],
    queryFn: () => svc.integrations.metaStatus(ws.id),
  });
}

export function useBilling() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "billing"], queryFn: () => svc.billing.status(ws.id) });
}

export function useNotifications() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "notifications"],
    queryFn: () => svc.notifications.list(ws.id),
  });
}

export function usePaymentMethods() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "payments", "methods"], queryFn: () => svc.payments.methods(ws.id) });
}

/** Payment requests, optionally only one contact's. */
export function usePayments(contactId?: string) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "payments", "list", contactId ?? "all"],
    queryFn: () => svc.payments.list(ws.id, contactId ? { contactId } : undefined),
  });
}

export function useWeeklyReports() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "reports", "weekly"], queryFn: () => svc.reports.weekly(ws.id) });
}

export function useWeeklyReportSettings() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "reports", "settings"], queryFn: () => svc.reports.settings(ws.id) });
}

/** A stored week, or the current week so far when `week` is "actual". */
export function useWeeklyReport(week: string | null) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "reports", "weekly", week],
    queryFn: () => (week === "actual" ? svc.reports.currentWeek(ws.id) : svc.reports.weeklyReport(ws.id, week!)),
    enabled: !!week,
  });
}

export function useTasks() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "tasks"],
    queryFn: () => svc.tasks.list(ws.id),
    // Teammates move cards too; keep the board fresh without a socket.
    refetchInterval: 20_000,
  });
}

export function useTeam() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "team"], queryFn: () => svc.team.members(ws.id) });
}

export function useTeamInvitations() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "invitations"],
    queryFn: () => svc.team.invitations(ws.id),
  });
}

export function useInviteLinks(enabled = true) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "invite-links"],
    queryFn: () => svc.team.inviteLinks(ws.id),
    enabled,
  });
}

export function useRoles() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "roles"], queryFn: () => svc.team.roles(ws.id) });
}

export function useAuditLogs() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "audit"], queryFn: () => svc.audit.logs(ws.id) });
}

/**
 * Free trial / plan of a brand. Keyed by slug (not the active workspace) so
 * the shell can ask before the page loads; rechecked every minute so the lock
 * appears when the trial ends and lifts once the payment is confirmed.
 */
export function useAccess(slug: string | undefined, enabled = true) {
  const svc = useServices();
  return useQuery({
    queryKey: [slug, "access"],
    queryFn: () => svc.access.overview(slug!),
    enabled: !!slug && enabled,
    refetchInterval: 60_000,
    retry: false,
  });
}

export function useAdminAccess(enabled = true) {
  const svc = useServices();
  return useQuery({ queryKey: ["admin", "access"], queryFn: () => svc.admin.access(), enabled });
}

/** Example records still loaded in the brand (from older versions). */
export function useSampleData(slug: string | undefined) {
  const svc = useServices();
  return useQuery({
    queryKey: [slug, "sample-data"],
    queryFn: () => svc.sampleData.summary(slug!),
    enabled: !!slug,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** The brand's social links and website (footer of group messages). */
export function useBrandLinks() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "brand-links"], queryFn: () => svc.brandLinks.get(ws.id) });
}

/** The brand's Tienda (catalog). */
export function useProducts(opts: { enabled?: boolean } = {}) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "products"],
    queryFn: () => svc.products.list(ws.id),
    enabled: opts.enabled ?? true,
  });
}
