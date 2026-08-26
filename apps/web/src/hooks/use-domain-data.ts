
import { useQuery } from "@tanstack/react-query";

import { useServices } from "./use-services";
import { useWorkspace } from "./use-workspace";

/**
 * Typed data hooks — one per module. Each is a thin wrapper over the service
 * registry + TanStack Query, scoped by the active workspace. They currently
 * resolve empty (see empty adapters) which drives the skeleton → empty-state
 * flow in every screen. No data is fabricated.
 */

export function useCampaigns() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "campaigns"],
    queryFn: () => svc.campaigns.list(ws.id),
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

export function useContacts(query: { q?: string; stage?: string; page?: number; pageSize?: number } = {}) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "contacts", query.q ?? "", query.stage ?? "", query.page ?? 1, query.pageSize ?? 100],
    queryFn: () =>
      svc.contacts.list(ws.id, {
        q: query.q,
        stage: query.stage as never,
        page: query.page,
        pageSize: query.pageSize,
      }),
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

export function useGroups() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "groups"], queryFn: () => svc.groups.list(ws.id) });
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

export function useConversations() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "inbox"], queryFn: () => svc.inbox.conversations(ws.id) });
}

export function useMessages(conversationId: string | null) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "inbox", conversationId, "messages"],
    queryFn: () => svc.inbox.messages(ws.id, conversationId as string),
    enabled: Boolean(conversationId),
  });
}

export function useMediaFolders() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "media", "folders"], queryFn: () => svc.media.folders(ws.id) });
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

export function useWhatsappStatus() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "whatsapp", "status"],
    queryFn: () => svc.whatsapp.status(ws.id),
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

export function useTeam() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "team"], queryFn: () => svc.team.members(ws.id) });
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
