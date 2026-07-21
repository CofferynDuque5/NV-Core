"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateCampaignInput,
  CreateContactInput,
  CreateGroupInput,
  CreateSegmentInput,
  CreateTemplateInput,
} from "@nv/domain";

import { useServices } from "./use-services";
import { useWorkspace } from "./use-workspace";

/**
 * Mutation hooks — write through the service registry (HTTP adapter → NestJS)
 * and invalidate the matching list query so the UI refreshes. In demo mode the
 * empty adapter throws a clear "backend required" error surfaced by the form.
 */

export function useCreateContact() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactInput) => svc.contacts.create(ws.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ws.id, "contacts"] }),
  });
}

export function useDeleteContact() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svc.contacts.remove(ws.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ws.id, "contacts"] }),
  });
}

export function useCreateCampaign() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignInput) => svc.campaigns.create(ws.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ws.id, "campaigns"] }),
  });
}

export function useCreateSegment() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSegmentInput) => svc.segments.create(ws.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ws.id, "segments"] }),
  });
}

export function useCreateGroup() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupInput) => svc.groups.create(ws.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ws.id, "groups"] }),
  });
}

export function useCreateTemplate() {
  const svc = useServices();
  const ws = useWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) => svc.templates.create(ws.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ws.id, "templates"] }),
  });
}
