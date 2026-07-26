"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AddMemberInput,
  CreateAutomationInput,
  CreateCampaignInput,
  CreateContactInput,
  CreateConversationInput,
  CreateGroupInput,
  CreatePostInput,
  CreateSegmentInput,
  CreateTemplateInput,
  GenerateVariantsInput,
  UpdateCampaignInput,
  UpdateContactInput,
  UpsertConnectionInput,
} from "@nv/domain";

import { useServices } from "./use-services";
import { useWorkspace } from "./use-workspace";

/**
 * Mutation hooks — write through the service registry (HTTP adapter → NestJS)
 * and invalidate the matching list query so the UI refreshes.
 *
 * Toast policy: every mutation shows a success toast. Operations without an
 * inline form (deletes, member role change/remove) also show an error toast;
 * create/update surface their error inside the dialog instead.
 */

function errText(err: unknown): string {
  return err instanceof Error ? err.message : "Ocurrió un error.";
}

// ── Contacts ────────────────────────────────────────────────────────────────
export function useCreateContact() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactInput) => svc.contacts.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "contacts"] });
      toast.success("Contacto creado");
    },
  });
}

export function useUpdateContact() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateContactInput }) =>
      svc.contacts.update(ws.id, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "contacts"] });
      toast.success("Contacto actualizado");
    },
  });
}

export function useDeleteContact() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.contacts.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "contacts"] });
      toast.success("Contacto eliminado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Campaigns ───────────────────────────────────────────────────────────────
export function useCreateCampaign() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignInput) => svc.campaigns.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "campaigns"] });
      toast.success("Campaña creada");
    },
  });
}

export function useUpdateCampaign() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCampaignInput }) =>
      svc.campaigns.update(ws.id, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "campaigns"] });
      toast.success("Campaña actualizada");
    },
  });
}

export function useDeleteCampaign() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.campaigns.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "campaigns"] });
      toast.success("Campaña eliminada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Posts ─────────────────────────────────────────────────────────────────────
export function useCreatePost() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostInput) => svc.posts.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "posts"] });
      toast.success("Publicación programada");
    },
  });
}

// ── Segments / Groups / Templates ─────────────────────────────────────────────
export function useCreateSegment() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSegmentInput) => svc.segments.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "segments"] });
      toast.success("Segmento creado");
    },
  });
}

export function useCreateGroup() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupInput) => svc.groups.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "groups"] });
      toast.success("Grupo creado");
    },
  });
}

export function useCreateTemplate() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) => svc.templates.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "templates"] });
      toast.success("Plantilla creada");
    },
  });
}

// ── Connections ───────────────────────────────────────────────────────────────
export function useUpsertConnection() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertConnectionInput) => svc.connections.upsert(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "connections"] });
      toast.success("Conexión guardada");
    },
  });
}

export function useDeleteConnection() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.connections.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "connections"] });
      toast.success("Conexión eliminada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Automations ───────────────────────────────────────────────────────────────
export function useCreateAutomation() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAutomationInput) => svc.automations.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "automations"] });
      toast.success("Automatización creada");
    },
  });
}

export function useDeleteAutomation() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.automations.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "automations"] });
      toast.success("Automatización eliminada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Inbox ─────────────────────────────────────────────────────────────────────
export function useCreateConversation() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConversationInput) => svc.inbox.createConversation(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "inbox"] });
      toast.success("Conversación creada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useSendMessage(conversationId: string | null) {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => svc.inbox.sendMessage(ws.id, conversationId as string, { text }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "inbox", conversationId, "messages"] });
      void qc.invalidateQueries({ queryKey: [ws.id, "inbox"] });
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useResolveConversation() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      svc.inbox.setResolved(ws.id, id, resolved),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "inbox"] });
      toast.success("Conversación actualizada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── AI Studio ─────────────────────────────────────────────────────────────────
export function useGenerateVariants() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: (input: GenerateVariantsInput) => svc.ai.generateVariants(ws.id, input),
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Team / members ────────────────────────────────────────────────────────────
function invalidateTeam(qc: ReturnType<typeof useQueryClient>, wsId: string) {
  void qc.invalidateQueries({ queryKey: [wsId, "team"] });
  void qc.invalidateQueries({ queryKey: [wsId, "roles"] });
}

export function useAddMember() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMemberInput) => svc.team.addMember(ws.id, input),
    onSuccess: () => {
      invalidateTeam(qc, ws.id);
      toast.success("Miembro actualizado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useRemoveMember() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => svc.team.removeMember(ws.id, userId),
    onSuccess: () => {
      invalidateTeam(qc, ws.id);
      toast.success("Miembro eliminado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}
