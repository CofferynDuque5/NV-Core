
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AddMemberInput,
  CampaignAttachment,
  ChannelId,
  Contact,
  ContactStage,
  ListResult,
  Post,
  CreateWorkspaceInput,
  CreateAutomationInput,
  UpdateAutomationInput,
  AutomationTestResult,
  CreateDesignInput,
  UpdateDesignInput,
  CreateCampaignInput,
  CreateContactInput,
  CreateConversationInput,
  CreateFeedbackInput,
  UpdateConversationInput,
  CreateGroupInput,
  CreatePostInput,
  UpdatePostInput,
  DuplicatePostInput,
  UpdateAssetInput,
  CreateSegmentInput,
  UpdateSegmentInput,
  Segment,
  SegmentPreview,
  CreateTemplateInput,
  GenerateVariantsInput,
  SocialPublishInput,
  UpdateCampaignInput,
  UpdateContactInput,
  UpsertConnectionInput,
} from "@nv/domain";

import { useServices } from "./use-services";
import { useWorkspace } from "./use-workspace";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAuthStore } from "@/stores/auth-store";

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

// ── Workspaces ──────────────────────────────────────────────────────────────
export function useCreateWorkspace() {
  const svc = useServices();
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);
  const refreshSession = useAuthStore((s) => s.refreshSession);
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => svc.workspaces.create(input),
    onSuccess: async () => {
      // Refresh the merged list and the session's memberships so the new
      // workspace is visible and accessible immediately.
      const list = await svc.workspaces.list().catch(() => null);
      if (list) setWorkspaces(list);
      await refreshSession().catch(() => undefined);
      toast.success("Workspace creado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useDismissOnboarding() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => svc.onboarding.dismiss(ws.id),
    onSuccess: (status) => {
      qc.setQueryData([ws.id, "onboarding"], status);
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useMarkChangelogSeen() {
  const svc = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => svc.changelog.markSeen(),
    onSuccess: (status) => {
      qc.setQueryData(["changelog"], status);
    },
    // Silent: this fires automatically when the user opens Novedades.
  });
}

export function useSubmitFeedback() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: (input: CreateFeedbackInput) => svc.feedback.submit(ws.id, input),
    onSuccess: () => toast.success("¡Gracias por tu comentario!"),
    onError: (err) => toast.error(errText(err)),
  });
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

export function useExportContacts() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: async () => {
      const csv = await svc.contacts.exportCsv(ws.id);
      // Trigger a browser download of the CSV.
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contactos-${ws.slug}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return csv;
    },
    onSuccess: () => toast.success("Contactos exportados"),
    onError: (err) => toast.error(errText(err)),
  });
}

export function useImportContacts() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) => svc.contacts.importCsv(ws.id, csv),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "contacts"] });
      const parts = [`${res.created} creados`];
      if (res.skipped) parts.push(`${res.skipped} omitidos`);
      if (res.errors.length) parts.push(`${res.errors.length} con error`);
      toast.success(`Importación: ${parts.join(", ")}`);
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useExportCampaigns() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: async () => {
      const csv = await svc.campaigns.exportCsv(ws.id);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campanas-${ws.slug}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return csv;
    },
    onSuccess: () => toast.success("Campañas exportadas"),
    onError: (err) => toast.error(errText(err)),
  });
}

export function useImportCampaigns() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) => svc.campaigns.importCsv(ws.id, csv),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "campaigns"] });
      const parts = [`${res.created} creadas`];
      if (res.skipped) parts.push(`${res.skipped} omitidas`);
      if (res.errors.length) parts.push(`${res.errors.length} con avisos`);
      toast.success(`Importación: ${parts.join(", ")}`);
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useExportTemplates() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: async () => {
      const csv = await svc.templates.exportCsv(ws.id);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plantillas-${ws.slug}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return csv;
    },
    onSuccess: () => toast.success("Plantillas exportadas"),
    onError: (err) => toast.error(errText(err)),
  });
}

export function useImportTemplates() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) => svc.templates.importCsv(ws.id, csv),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "templates"] });
      const parts = [`${res.created} creadas`];
      if (res.skipped) parts.push(`${res.skipped} omitidas`);
      if (res.errors.length) parts.push(`${res.errors.length} con error`);
      toast.success(`Importación: ${parts.join(", ")}`);
    },
    onError: (err) => toast.error(errText(err)),
  });
}

/** Optimistic, silent stage change for the CRM pipeline (drag between columns). */
export function useMoveContactStage() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  const key = [ws.id, "contacts"];
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: ContactStage }) =>
      svc.contacts.update(ws.id, id, { stage }),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ListResult<Contact>>(key);
      if (prev) {
        qc.setQueryData<ListResult<Contact>>(key, {
          ...prev,
          items: prev.items.map((c) => (c.id === id ? { ...c, stage } : c)),
        });
      }
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(errText(err));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

export function useAddContactNote(contactId: string) {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => svc.contacts.addNote(ws.id, contactId, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [ws.id, "contacts", contactId, "notes"] }),
    onError: (err) => toast.error(errText(err)),
  });
}

export function useDeleteContactNote(contactId: string) {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => svc.contacts.removeNote(ws.id, contactId, noteId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [ws.id, "contacts", contactId, "notes"] }),
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

function invalidateCampaigns(qc: ReturnType<typeof useQueryClient>, wsId: string) {
  void qc.invalidateQueries({ queryKey: [wsId, "campaigns"] });
}

export function useRunCampaign() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.campaigns.run(ws.id, id),
    onSuccess: () => {
      invalidateCampaigns(qc, ws.id);
      toast.success("Campaña enviada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function usePauseCampaign() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.campaigns.pause(ws.id, id),
    onSuccess: () => {
      invalidateCampaigns(qc, ws.id);
      toast.success("Campaña pausada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useResumeCampaign() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.campaigns.resume(ws.id, id),
    onSuccess: () => {
      invalidateCampaigns(qc, ws.id);
      toast.success("Campaña reanudada");
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

/** Edit / move (reschedule) a post. Used by calendar drag & drop. */
export function useUpdatePost() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePostInput }) =>
      svc.posts.update(ws.id, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "posts"] });
    },
  });
}

export function useDuplicatePost() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DuplicatePostInput }) =>
      svc.posts.duplicate(ws.id, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "posts"] });
      toast.success("Publicación duplicada");
    },
  });
}

export function useDeletePost() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.posts.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "posts"] });
      toast.success("Publicación eliminada");
    },
  });
}

interface MoveInput {
  id: string;
  scheduledAt: string;
  channel?: ChannelId;
}

/**
 * Move (reschedule) a post — the calendar drag & drop primitive. Optimistic:
 * the chip jumps to the new slot instantly and rolls back if the server
 * rejects it. The "undo" toast is wired at the call site (it knows the previous
 * slot). Backing store is the same S1 PATCH endpoint.
 */
export function useMovePost() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  const key = [ws.id, "posts"];

  return useMutation({
    mutationFn: ({ id, scheduledAt, channel }: MoveInput) =>
      svc.posts.update(ws.id, id, { scheduledAt, channel, status: "scheduled" }),
    onMutate: async ({ id, scheduledAt, channel }: MoveInput) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ListResult<Post>>(key);
      if (prev) {
        qc.setQueryData<ListResult<Post>>(key, {
          ...prev,
          items: prev.items.map((p) =>
            p.id === id
              ? {
                  ...p,
                  scheduledAt,
                  channel: channel ?? p.channel,
                  status: p.status === "draft" ? "scheduled" : p.status,
                }
              : p,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error("No se pudo mover la publicación");
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
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
    onError: (err) => toast.error(errText(err)),
  });
}

export function useUpdateSegment() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSegmentInput }) =>
      svc.segments.update(ws.id, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "segments"] });
      toast.success("Segmento actualizado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useDeleteSegment() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.segments.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "segments"] });
      toast.success("Segmento eliminado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

/** Live rule-builder preview: evaluate ad-hoc rules without persisting. */
export function useSegmentPreview() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation<SegmentPreview, unknown, { match?: Segment["match"]; rules: Segment["rules"] }>({
    mutationFn: (input) => svc.segments.preview(ws.id, input),
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

export function useSetGroupVars(groupId: string) {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: Record<string, string>) => svc.groups.setVars(ws.id, groupId, vars),
    onSuccess: (data) => {
      qc.setQueryData([ws.id, "groups", groupId, "vars"], data);
      void qc.invalidateQueries({ queryKey: [ws.id, "groups", groupId, "vars"] });
      toast.success("Variables guardadas");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Social (Facebook / Instagram) ─────────────────────────────────────────────
export function useSocialPublish() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SocialPublishInput) => svc.social.publish(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "campaigns", "logs"] });
      toast.success("Publicación enviada");
    },
    onError: (err) => toast.error(errText(err)),
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

export function useUpdateAutomation() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: UpdateAutomationInput }) =>
      svc.automations.update(ws.id, args.id, args.input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "automations"] });
      toast.success("Flujo guardado");
    },
    onError: (err) => toast.error(errText(err)),
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

export function useRunAutomation() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.automations.run(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "automations"] });
      toast.success("Automatización ejecutada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

/** Dry-run a workflow against a sample context; returns the execution trace. */
export function useTestAutomation() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation<
    AutomationTestResult,
    unknown,
    { id: string; context?: Record<string, string> }
  >({
    mutationFn: ({ id, context }) => svc.automations.test(ws.id, id, { context }),
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Designs (Campaign Builder) ──────────────────────────────────────────────────
export function useCreateDesign() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDesignInput) => svc.designs.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "designs"] });
      toast.success("Diseño creado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useUpdateDesign() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: UpdateDesignInput }) =>
      svc.designs.update(ws.id, args.id, args.input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "designs"] });
      toast.success("Diseño guardado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useDeleteDesign() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.designs.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "designs"] });
      toast.success("Diseño eliminado");
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

export function useUpdateConversation() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; input: UpdateConversationInput }) =>
      svc.inbox.updateConversation(ws.id, args.id, args.input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "inbox"] });
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── WhatsApp (Baileys) ────────────────────────────────────────────────────────
function useWhatsappAction(action: "connect" | "reconnect" | "disconnect" | "sync") {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => svc.whatsapp[action](ws.id),
    onSuccess: (status) => {
      qc.setQueryData([ws.id, "whatsapp", "status"], status);
      void qc.invalidateQueries({ queryKey: [ws.id, "whatsapp", "status"] });
    },
    onError: (err) => toast.error(errText(err)),
  });
}
export const useWhatsappConnect = () => useWhatsappAction("connect");
export const useWhatsappReconnect = () => useWhatsappAction("reconnect");
export const useWhatsappDisconnect = () => useWhatsappAction("disconnect");
export const useWhatsappSync = () => useWhatsappAction("sync");

// ── Google OAuth ──────────────────────────────────────────────────────────────
export function useGoogleConnect() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: () => svc.integrations.googleAuthUrl(ws.id),
    onSuccess: (url) => {
      if (url) window.location.assign(url);
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useGoogleDisconnect() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => svc.integrations.googleDisconnect(ws.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "integrations", "google"] });
      toast.success("Google desconectado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Media (Cloudinary uploads) ───────────────────────────────────────────────
export function useUploadMedia() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const sig = await svc.media.uploadSignature(ws.id);
      if (!sig) {
        throw new Error("Cloudinary no está configurado. Define CLOUDINARY_URL en el backend.");
      }
      const uploaded = await uploadToCloudinary(sig, file);
      return svc.media.createAsset(ws.id, {
        type: uploaded.resourceType === "video" ? "video" : "image",
        title: file.name,
        url: uploaded.secureUrl,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "media"] });
      toast.success("Archivo subido");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

/**
 * Upload a file to Cloudinary and return a CampaignAttachment descriptor
 * ({ url, kind, mime, filename }) for use in campaigns / social publishing.
 * Also registers it in the media library so it shows up in Biblioteca.
 */
export function useUploadCampaignAttachment() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<CampaignAttachment> => {
      const sig = await svc.media.uploadSignature(ws.id);
      if (!sig) {
        throw new Error("Cloudinary no está configurado. Define CLOUDINARY_URL en el backend.");
      }
      const uploaded = await uploadToCloudinary(sig, file);
      const kind =
        uploaded.resourceType === "video"
          ? "video"
          : uploaded.resourceType === "image"
            ? "image"
            : "document";
      // Keep it in the library too (best-effort; ignore failures).
      await svc.media
        .createAsset(ws.id, { type: kind === "video" ? "video" : "image", title: file.name, url: uploaded.secureUrl })
        .catch(() => undefined);
      void qc.invalidateQueries({ queryKey: [ws.id, "media"] });
      return { url: uploaded.secureUrl, kind, mime: file.type || null, filename: file.name };
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useUpdateAsset() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAssetInput }) =>
      svc.media.updateAsset(ws.id, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "media"] });
      toast.success("Archivo actualizado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useDeleteAsset() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.media.removeAsset(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "media"] });
      toast.success("Archivo eliminado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Billing (Stripe) ────────────────────────────────────────────────────────
export function useCheckout() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: (priceId?: string) => {
      const origin = window.location.origin;
      const back = window.location.href;
      return svc.billing.checkout(ws.id, {
        priceId,
        successUrl: `${back}${back.includes("?") ? "&" : "?"}billing=success`,
        cancelUrl: `${origin}${window.location.pathname}?billing=cancel`,
      });
    },
    onSuccess: ({ url }) => {
      if (url) window.location.assign(url);
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useBillingPortal() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: () => svc.billing.portalUrl(ws.id, window.location.href),
    onSuccess: (url) => {
      if (url) window.location.assign(url);
      else toast.error("Aún no tienes una suscripción. Suscríbete primero.");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── AI Studio ─────────────────────────────────────────────────────────────────
export function useGenerateVariants() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateVariantsInput) => svc.ai.generateVariants(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "ai", "usage"] });
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Notifications ────────────────────────────────────────────────────────────
export function useMarkNotificationsRead() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => svc.notifications.markAllRead(ws.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "notifications"] });
      void qc.invalidateQueries({ queryKey: [ws.id, "notifications", "unread"] });
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useSuggestHashtags() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prompt: string) => svc.ai.suggestHashtags(ws.id, { prompt }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [ws.id, "ai", "usage"] }),
    onError: (err) => toast.error(errText(err)),
  });
}

export function useImproveMessage() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => svc.ai.improve(ws.id, { message }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "ai", "usage"] });
    },
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
