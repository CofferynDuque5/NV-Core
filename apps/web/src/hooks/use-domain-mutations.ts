import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  ChangelogStatus,
  CreateProductInput,
  UpdateWorkspaceInput,
  AccessPaymentInput,
  BrandLinks,
  CreatePaymentRequestInput,
  PaymentMethodInput,
  UpdatePaymentRequestInput,
  WeeklyReportSettings,
  AddMemberInput,
  CreateInviteLinkInput,
  WhatsappLineAction,
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
  UpdateGroupInput,
  UpdateTemplateInput,
  CreatePostInput,
  UpdatePostInput,
  DuplicatePostInput,
  UpdateAssetInput,
  CreateSegmentInput,
  UpdateSegmentInput,
  Segment,
  SegmentPreview,
  CreateFormInput,
  UpdateFormInput,
  CreateFunnelInput,
  UpdateFunnelInput,
  CreateSequenceInput,
  UpdateSequenceInput,
  CreateAffiliateInput,
  UpdateAffiliateInput,
  CreateTemplateInput,
  GenerateVariantsInput,
  SocialPublishInput,
  UpdateCampaignInput,
  UpdateContactInput,
  UpsertConnectionInput,
  CreateTaskInput,
  Task,
  UpdateTaskInput,
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

/**
 * Distingue "el proveedor no está configurado" (falta la clave → probar el
 * siguiente) de "está configurado pero la subida falló" (clave inválida, sin
 * red, etc. → mostrar ese error real en vez del genérico).
 */
function isNotConfigured(err: unknown): boolean {
  return /no configurad/i.test(errText(err));
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
    // Clear the badge right away: the read-only demo can't save "seen", and the
    // counter shouldn't stay up while the page is open either way.
    onMutate: () => {
      qc.setQueryData<ChangelogStatus>(["changelog"], (prev) =>
        prev ? { ...prev, unseenCount: 0 } : prev,
      );
    },
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

export function useSetContactOptOut() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, optedOut }: { id: string; optedOut: boolean }) =>
      svc.contacts.setOptOut(ws.id, id, optedOut),
    onSuccess: (_c, v) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "contacts"] });
      toast.success(v.optedOut ? "Contacto dado de baja" : "Contacto reactivado");
    },
    onError: (err) => toast.error(errText(err)),
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
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: [ws.id, "contacts", contactId, "notes"] }),
    onError: (err) => toast.error(errText(err)),
  });
}

export function useDeleteContactNote(contactId: string) {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => svc.contacts.removeNote(ws.id, contactId, noteId),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: [ws.id, "contacts", contactId, "notes"] }),
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

export function useClearCampaignLogs() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => svc.campaigns.clearLogs(ws.id),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "campaigns", "logs"] });
      toast.success(r.deleted ? `Historial borrado (${r.deleted})` : "Historial vacío");
    },
    onError: (err) => toast.error(errText(err)),
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
      toast.success("Campaña en marcha: los envíos van saliendo con ritmo anti-ban. Míralos en Historial.");
    },
    onError: (err) => toast.error(errText(err)),
    // On the free trial the one send closes it: refresh the plan state.
    onSettled: () => qc.invalidateQueries({ queryKey: [ws.slug, "access"] }),
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

// ── Forms (lead capture) ──────────────────────────────────────────────────────
export function useCreateForm() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFormInput) => svc.forms.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "forms"] });
      toast.success("Formulario creado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useUpdateForm() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFormInput }) =>
      svc.forms.update(ws.id, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "forms"] });
      toast.success("Formulario actualizado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useDeleteForm() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.forms.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "forms"] });
      toast.success("Formulario eliminado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Affiliates ────────────────────────────────────────────────────────────────
export function useCreateAffiliate() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAffiliateInput) => svc.affiliates.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "affiliates"] });
      toast.success("Afiliado creado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useUpdateAffiliate() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAffiliateInput }) =>
      svc.affiliates.update(ws.id, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "affiliates"] });
      toast.success("Afiliado actualizado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useDeleteAffiliate() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.affiliates.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "affiliates"] });
      toast.success("Afiliado eliminado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useConvertAffiliate() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      svc.affiliates.convert(ws.id, id, amount),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "affiliates"] });
      toast.success("Conversión registrada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Sequences (autoresponders) ────────────────────────────────────────────────
export function useCreateSequence() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSequenceInput) => svc.sequences.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "sequences"] });
      toast.success("Secuencia creada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useUpdateSequence() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSequenceInput }) =>
      svc.sequences.update(ws.id, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "sequences"] });
      toast.success("Secuencia actualizada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useDeleteSequence() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.sequences.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "sequences"] });
      toast.success("Secuencia eliminada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useEnrollSequence() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { contactId?: string; tag?: string } }) =>
      svc.sequences.enroll(ws.id, id, input),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "sequences"] });
      toast.success(`${res.enrolled} inscrito(s), ${res.skipped} ya estaban`);
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Funnels ─────────────────────────────────────────────────────────────────
export function useCreateFunnel() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFunnelInput) => svc.funnels.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "funnels"] });
      toast.success("Embudo creado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useUpdateFunnel() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFunnelInput }) =>
      svc.funnels.update(ws.id, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "funnels"] });
      toast.success("Embudo actualizado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useDeleteFunnel() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.funnels.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "funnels"] });
      toast.success("Embudo eliminado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

/** Live rule-builder preview: evaluate ad-hoc rules without persisting. */
export function useSegmentPreview() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation<
    SegmentPreview,
    unknown,
    { match?: Segment["match"]; rules: Segment["rules"] }
  >({
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

export function useUpdateGroup() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateGroupInput }) =>
      svc.groups.update(ws.id, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "groups"] });
      toast.success("Grupo actualizado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useClearSyncedGroups() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (channel?: "wa" | "tg") => svc.groups.clearSynced(ws.id, channel),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "groups"] });
      toast.success(`${res.deleted} grupo(s) importado(s) eliminados`);
    },
    onError: (err) => toast.error(errText(err)),
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

export function useUpdateTemplate() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTemplateInput }) =>
      svc.templates.update(ws.id, id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "templates"] });
      toast.success("Plantilla actualizada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useDeleteTemplate() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.templates.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "templates"] });
      toast.success("Plantilla eliminada");
    },
    onError: (err) => toast.error(errText(err)),
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

export function useSaveCredential() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { provider: string; data: Record<string, string> }) =>
      svc.integrations.saveCredential(ws.id, input.provider, input.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "integrations"] });
      void qc.invalidateQueries({ queryKey: [ws.id, "credentials"] });
      toast.success("Credenciales guardadas");
    },
  });
}

export function useRemoveCredential() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) => svc.integrations.removeCredential(ws.id, provider),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "integrations"] });
      void qc.invalidateQueries({ queryKey: [ws.id, "credentials"] });
      toast.success("Credenciales eliminadas");
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

export function useDeleteConversation() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.inbox.deleteConversation(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "inbox"] });
      toast.success("Chat eliminado del panel");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── WhatsApp (Baileys) ────────────────────────────────────────────────────────
function useWhatsappAction(action: "connect" | "reconnect" | "disconnect" | "sync" | "relink") {
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
/** Runs the server-side WhatsApp checks and returns readable lines. */
export function useWhatsappDiagnose() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: () => svc.whatsapp.diagnose(ws.id),
    onError: (err) => toast.error(errText(err)),
  });
}
export const useWhatsappConnect = () => useWhatsappAction("connect");
export const useWhatsappReconnect = () => useWhatsappAction("reconnect");
export const useWhatsappDisconnect = () => useWhatsappAction("disconnect");
export const useWhatsappSync = () => useWhatsappAction("sync");
export const useWhatsappRelink = () => useWhatsappAction("relink");

function invalidateLines(qc: ReturnType<typeof useQueryClient>, wsId: string) {
  void qc.invalidateQueries({ queryKey: [wsId, "whatsapp", "lines"] });
  void qc.invalidateQueries({ queryKey: [wsId, "groups"] });
}

/** Link one more WhatsApp number to the brand. */
export function useAddWhatsappLine() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label?: string) => svc.whatsapp.addLine(ws.id, label),
    onSuccess: () => invalidateLines(qc, ws.id),
    onError: (err) => toast.error(errText(err)),
  });
}

export function useWhatsappLineAction() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ line, action }: { line: number; action: WhatsappLineAction }) =>
      svc.whatsapp.lineAction(ws.id, line, action),
    onSuccess: () => invalidateLines(qc, ws.id),
    onError: (err) => toast.error(errText(err)),
  });
}

export function useRenameWhatsappLine() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ line, label }: { line: number; label: string }) => svc.whatsapp.renameLine(ws.id, line, label),
    onSuccess: () => invalidateLines(qc, ws.id),
    onError: (err) => toast.error(errText(err)),
  });
}

export function useRemoveWhatsappLine() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (line: number) => svc.whatsapp.removeLine(ws.id, line),
    onSuccess: () => {
      invalidateLines(qc, ws.id);
      toast.success("Número quitado de esta marca");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

function useTelegramAction(action: "connect" | "reconnect" | "disconnect" | "sync") {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => svc.telegram[action](ws.id),
    onSuccess: (status) => {
      qc.setQueryData([ws.id, "telegram", "status"], status);
      void qc.invalidateQueries({ queryKey: [ws.id, "telegram", "status"] });
    },
    onError: (err) => toast.error(errText(err)),
  });
}
export const useTelegramConnect = () => useTelegramAction("connect");
export const useTelegramReconnect = () => useTelegramAction("reconnect");
export const useTelegramDisconnect = () => useTelegramAction("disconnect");
export const useTelegramSync = () => useTelegramAction("sync");

export function useTelegramSubmitPassword() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) => svc.telegram.submitPassword(ws.id, password),
    onSuccess: (status) => {
      qc.setQueryData([ws.id, "telegram", "status"], status);
      void qc.invalidateQueries({ queryKey: [ws.id, "telegram", "status"] });
    },
    onError: (err) => toast.error(errText(err)),
  });
}

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

// ── Facebook / Instagram (Meta) ───────────────────────────────────────────────
export function useMetaLogin() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: () => svc.integrations.metaAuthUrl(ws.id),
    onSuccess: (url) => {
      if (url) window.location.assign(url);
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useMetaPages() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: (input: { token?: string; pick?: string }) => svc.integrations.metaPages(ws.id, input),
  });
}

export function useMetaConnect() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { token?: string; pick?: string; pageId: string; instagram?: boolean }) =>
      svc.integrations.metaConnect(ws.id, input),
    onSuccess: (page) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "integrations", "meta"] });
      void qc.invalidateQueries({ queryKey: [ws.id, "connections"] });
      toast.success(page.instagram ? `${page.name} e Instagram conectados` : `${page.name} conectada`);
    },
  });
}

export function useMetaCheck() {
  const svc = useServices();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: () => svc.integrations.metaCheck(ws.id),
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Media (saved on the app's own server) ──────────────────────────
export function useCreateFolder() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) => svc.media.createFolder(ws.id, { label }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "media"] });
      toast.success("Carpeta creada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

/** Larger than this never reaches the server (MEDIA_MAX_MB defaults to 100). */
const MAX_UPLOAD_MB = 100;

function checkUploadSize(file: File): void {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`«${file.name}» pesa más de ${MAX_UPLOAD_MB} MB.`);
  }
}

/**
 * Old path, only when server storage is turned off (MEDIA_STORAGE=off):
 * images to ImgBB, then Cloudinary for anything else.
 */
async function uploadExternally(
  svc: ReturnType<typeof useServices>,
  wsId: string,
  file: File,
): Promise<{ url: string; kind: "image" | "video" | "document" }> {
  if (file.type.startsWith("image/")) {
    try {
      const { url } = await svc.media.uploadImage(wsId, await fileToBase64(file));
      return { url, kind: "image" };
    } catch (imgbbErr) {
      if (!isNotConfigured(imgbbErr)) throw imgbbErr;
    }
  }
  const sig = await svc.media.uploadSignature(wsId);
  if (!sig) {
    throw new Error(
      "La subida al servidor está desactivada (MEDIA_STORAGE=off) y no hay otro almacenamiento configurado.",
    );
  }
  const uploaded = await uploadToCloudinary(sig, file);
  const kind =
    uploaded.resourceType === "video" ? "video" : uploaded.resourceType === "image" ? "image" : "document";
  return { url: uploaded.secureUrl, kind };
}

/**
 * Biblioteca uploader. Files are saved on the app's own server (images, video
 * and documents), optionally straight into a folder.
 */
export function useUploadMedia() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (arg: File | { file: File; folderId?: string | null }) => {
      const file = arg instanceof File ? arg : arg.file;
      const folderId = arg instanceof File ? undefined : (arg.folderId ?? undefined);
      checkUploadSize(file);
      try {
        const { asset } = await svc.media.uploadFile(ws.id, file, { library: true, folderId });
        if (asset) return asset;
      } catch (err) {
        if (!isNotConfigured(err)) throw err;
      }
      const { url, kind } = await uploadExternally(svc, ws.id, file);
      return svc.media.createAsset(ws.id, { type: kind, title: file.name, url, folderId });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "media"] });
      toast.success("Archivo subido");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

/** Read a File as a base64 data URL (for the ImgBB fallback upload). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a file for campaigns / social publishing and return a
 * CampaignAttachment ({ url, kind, mime, filename }). It is saved on the app's
 * own server and also listed in Biblioteca.
 */
export function useUploadCampaignAttachment() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<CampaignAttachment> => {
      checkUploadSize(file);
      try {
        const { file: stored } = await svc.media.uploadFile(ws.id, file, { library: true });
        void qc.invalidateQueries({ queryKey: [ws.id, "media"] });
        return { url: stored.url, kind: stored.kind, mime: stored.mime, filename: stored.filename };
      } catch (err) {
        if (!isNotConfigured(err)) throw err;
      }
      const { url, kind } = await uploadExternally(svc, ws.id, file);
      await svc.media
        .createAsset(ws.id, { type: kind, title: file.name, url })
        .catch(() => undefined);
      void qc.invalidateQueries({ queryKey: [ws.id, "media"] });
      return { url, kind, mime: file.type || null, filename: file.name };
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

export function useGenerateFlyer() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { prompt: string; size?: string }) => svc.ai.generateImage(ws.id, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [ws.id, "ai", "usage"] }),
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

/** Sales-agent chat: sends the whole visible history, gets the next reply. */
export function useAgentChat() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      messages: { role: "user" | "assistant"; content: string }[];
      system?: string;
      mode?: "asistente" | "ventas";
    }) => svc.ai.chat(ws.id, input),
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
  void qc.invalidateQueries({ queryKey: [wsId, "invitations"] });
  void qc.invalidateQueries({ queryKey: [wsId, "invite-links"] });
}

export function useAddMember() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddMemberInput) => svc.team.addMember(ws.id, input),
    onSuccess: (result) => {
      invalidateTeam(qc, ws.id);
      toast.success(
        result?.status === "invited"
          ? "Invitación enviada. La persona entrará al registrarse con ese correo."
          : "Miembro actualizado",
      );
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useRevokeInvitation() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => svc.team.revokeInvitation(ws.id, invitationId),
    onSuccess: () => {
      invalidateTeam(qc, ws.id);
      toast.success("Invitación cancelada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useCreateInviteLink() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInviteLinkInput) => svc.team.createInviteLink(ws.id, input),
    onSuccess: () => invalidateTeam(qc, ws.id),
    onError: (err) => toast.error(errText(err)),
  });
}

export function useRevokeInviteLink() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => svc.team.revokeInviteLink(ws.id, linkId),
    onSuccess: () => {
      invalidateTeam(qc, ws.id);
      toast.success("Enlace desactivado");
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

export function useCreateTask() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => svc.tasks.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "tasks"] });
      toast.success("Tarea creada");
    },
  });
}

/** Updates a task, moving the card on screen right away and rolling back on error. */
export function useUpdateTask() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  const key = [ws.id, "tasks"];
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) => svc.tasks.update(ws.id, id, input),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Task[]>(key);
      if (previous) {
        qc.setQueryData<Task[]>(
          key,
          previous.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...(input.status ? { status: input.status } : {}),
                  ...(input.position !== undefined ? { position: input.position } : {}),
                }
              : t,
          ),
        );
      }
      return { previous };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error(errText(err));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteTask() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.tasks.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "tasks"] });
      toast.success("Tarea eliminada");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

// ── Cobros ──────────────────────────────────────────────────────────────────

export function useSavePaymentMethod() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PaymentMethodInput }) =>
      id ? svc.payments.updateMethod(ws.id, id, input) : svc.payments.createMethod(ws.id, input),
    onSuccess: (_m, { id }) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "payments", "methods"] });
      toast.success(id ? "Método actualizado" : "Método de cobro añadido");
    },
  });
}

export function useTogglePaymentMethod() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => svc.payments.updateMethod(ws.id, id, { active }),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "payments", "methods"] });
      toast.success(m.active ? "Método activado" : "Método pausado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useDeletePaymentMethod() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.payments.removeMethod(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "payments", "methods"] });
      toast.success("Método eliminado");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useCreatePayment() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePaymentRequestInput) => svc.payments.create(ws.id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "payments", "list"] });
      toast.success("Cobro creado");
    },
  });
}

export function useUpdatePayment() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePaymentRequestInput }) => svc.payments.update(ws.id, id, input),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "payments", "list"] });
      toast.success(p.status === "pagado" ? "Pago confirmado" : "Cobro actualizado");
    },
  });
}

/** Change the zone the weekly report cuts weeks in; the live week is recomputed. */
export function useUpdateWeeklyReportSettings() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WeeklyReportSettings) => svc.reports.updateSettings(ws.id, input),
    onSuccess: (settings) => {
      qc.setQueryData([ws.id, "reports", "settings"], settings);
      void qc.invalidateQueries({ queryKey: [ws.id, "reports", "weekly"] });
      toast.success("Zona horaria guardada");
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo guardar la zona horaria"),
  });
}

export function usePayAccess(slug: string) {
  const svc = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AccessPaymentInput) => svc.access.pay(slug, input),
    onSuccess: (overview) => {
      qc.setQueryData([slug, "access"], overview);
      toast.success("Pago enviado. Te avisamos al confirmarlo.");
    },
  });
}

export function useActivateAccess() {
  const svc = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, days }: { slug: string; days: number }) => svc.admin.activate(slug, days),
    onSuccess: (_s, { slug, days }) => {
      void qc.invalidateQueries({ queryKey: ["admin", "access"] });
      void qc.invalidateQueries({ queryKey: [slug, "access"] });
      toast.success(`Marca activada ${days} días más`);
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo activar la marca"),
  });
}

/** Owner/Admin: remove the example contacts, flows and automations. */
export function useRemoveSampleData(slug: string) {
  const svc = useServices();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => svc.sampleData.remove(slug),
    onSuccess: (summary) => {
      qc.setQueryData([slug, "sample-data"], summary);
      // Every list that may have held an example record.
      void qc.invalidateQueries({ queryKey: [slug] });
      toast.success("Datos de ejemplo eliminados. Tus propios registros siguen intactos.");
    },
  });
}

/** Copy a campaign as a new draft (same message, images, groups and prices). */
export function useDuplicateCampaign() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.campaigns.duplicate(ws.id, id),
    onSuccess: (c) => {
      invalidateCampaigns(qc, ws.id);
      toast.success(`Creada «${c.name}» como borrador.`);
    },
    onError: (err) => toast.error(errText(err)),
  });
}

/** Read the rules of one group (id) or of every group (no id). */
export function useCheckGroupRules() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id?: string) => svc.groups.checkRules(ws.id, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [ws.id, "groups"] }),
    onError: (err) => toast.error(errText(err)),
  });
}

/** Keep groups out of every campaign, or bring them back. */
export function useExcludeGroups() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, excluded }: { ids: string[]; excluded: boolean }) => svc.groups.exclude(ws.id, ids, excluded),
    onSuccess: (r, v) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "groups"] });
      toast.success(
        v.excluded
          ? `${r.updated === 1 ? "1 grupo apartado" : `${r.updated} grupos apartados`}: ninguna campaña publicará ahí.`
          : `${r.updated === 1 ? "1 grupo vuelve" : `${r.updated} grupos vuelven`} a estar disponibles.`,
      );
    },
    onError: (err) => toast.error(errText(err)),
  });
}

export function useSaveBrandLinks() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BrandLinks) => svc.brandLinks.set(ws.id, input),
    onSuccess: (links) => {
      qc.setQueryData([ws.id, "brand-links"], links);
      toast.success("Redes y web guardadas.");
    },
    onError: (err) => toast.error(errText(err)),
  });
}

/** Edit the open brand (name, color, tagline, type, goals); refreshes the brand list. */
export function useUpdateWorkspace() {
  const svc = useServices();
  const ws = useWorkspace();
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  return useMutation({
    mutationFn: (input: UpdateWorkspaceInput) => svc.workspaces.update(ws.slug, input),
    onSuccess: (updated) => {
      setWorkspaces(
        workspaces.some((w) => w.slug === updated.slug)
          ? workspaces.map((w) => (w.slug === updated.slug ? updated : w))
          : [...workspaces, updated],
      );
    },
    onError: (err) => toast.error(errText(err)),
  });
}

/** Delete a brand and all its data; refreshes the brand list and the session. */
export function useDeleteWorkspace() {
  const svc = useServices();
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces);
  const refreshSession = useAuthStore((s) => s.refreshSession);
  return useMutation({
    mutationFn: ({ slug, confirmName }: { slug: string; confirmName: string }) => svc.workspaces.remove(slug, confirmName),
    onSuccess: async () => {
      const list = await svc.workspaces.list().catch(() => null);
      if (list) setWorkspaces(list);
      await refreshSession().catch(() => undefined);
      toast.success("Marca eliminada con todos sus datos.");
    },
  });
}

export function useSaveProduct() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateProductInput }) =>
      id ? svc.products.update(ws.id, id, input) : svc.products.create(ws.id, input),
    onSuccess: (p, v) => {
      void qc.invalidateQueries({ queryKey: [ws.id, "products"] });
      toast.success(v.id ? `«${p.name}» actualizado.` : `«${p.name}» agregado a la Tienda.`);
    },
  });
}

export function useDeleteProduct() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.products.remove(ws.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ws.id, "products"] });
      toast.success("Producto eliminado.");
    },
    onError: (err) => toast.error(errText(err)),
  });
}
