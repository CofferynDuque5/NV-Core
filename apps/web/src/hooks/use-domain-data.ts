"use client";

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

export function useCalendarEvents(month: string) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "calendar", month],
    queryFn: () => svc.calendar.events(ws.id, month),
  });
}

export function useContacts() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "contacts"], queryFn: () => svc.contacts.list(ws.id) });
}

export function useGroups() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "groups"], queryFn: () => svc.groups.list(ws.id) });
}

export function useSegments() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "segments"], queryFn: () => svc.segments.list(ws.id) });
}

export function useConversations() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "inbox"], queryFn: () => svc.inbox.conversations(ws.id) });
}

export function useMediaFolders() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "media", "folders"], queryFn: () => svc.media.folders(ws.id) });
}

export function useMediaAssets(folderId?: string) {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: [ws.id, "media", "assets", folderId ?? "all"],
    queryFn: () => svc.media.assets(ws.id, folderId),
  });
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

export function useAnalytics() {
  const svc = useServices();
  const ws = useWorkspace();
  return useQuery({ queryKey: [ws.id, "analytics"], queryFn: () => svc.analytics.snapshot(ws.id) });
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
