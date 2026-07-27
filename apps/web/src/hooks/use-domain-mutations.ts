"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AddMemberInput,
  CampaignAttachment,
  CreateWorkspaceInput,
  CreateAutomationInput,
  CreateCampaignInput,
  CreateContactInput,
  CreateConversationInput,
  CreateGroupInput,
  CreatePostInput,
  CreateSegmentInput,
  CreateTemplateInput,
  GenerateVariantsInput,
  SocialPublishInput,
  UpdateCampaignInput,
  UpdateContactInput,
  UpsertConnectionInput,
} from "@nv/domain";

import { useServices } from "./use-services";
import { useWorkspace } from "./use-workspace";
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
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sig.apiKey);
      form.append("timestamp", String(sig.timestamp));
      form.append("signature", sig.signature);
      form.append("folder", sig.folder);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Fallo al subir a Cloudinary.");
      }
      const uploaded = (await res.json()) as { secure_url: string; resource_type: string };
      return svc.media.createAsset(ws.id, {
        type: uploaded.resource_type === "video" ? "video" : "image",
        title: file.name,
        url: uploaded.secure_url,
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
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sig.apiKey);
      form.append("timestamp", String(sig.timestamp));
      form.append("signature", sig.signature);
      form.append("folder", sig.folder);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Fallo al subir a Cloudinary.");
      }
      const uploaded = (await res.json()) as { secure_url: string; resource_type: string };
      const kind = uploaded.resource_type === "video" ? "video" : uploaded.resource_type === "image" ? "image" : "document";
      // Keep it in the library too (best-effort; ignore failures).
      await svc.media
        .createAsset(ws.id, { type: kind === "video" ? "video" : "image", title: file.name, url: uploaded.secure_url })
        .catch(() => undefined);
      void qc.invalidateQueries({ queryKey: [ws.id, "media"] });
      return { url: uploaded.secure_url, kind, mime: file.type || null, filename: file.name };
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
