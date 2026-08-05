/**
 * Internal domain events. Modules publish these to the EventBus and never call
 * each other directly — this is how the platform stays decoupled.
 *
 * These same events are forwarded to n8n (the orchestrator), so a workflow can
 * react to them and call back into the backend action endpoints.
 */
export interface DomainEventMap {
  "message.received": {
    workspaceSlug: string;
    channel: string;
    contactHandle: string;
    contactName: string;
    text: string;
  };
  "message.sent": {
    workspaceSlug: string;
    provider: string;
    to: string;
    id: string;
  };
  "campaign.completed": {
    workspaceSlug: string;
    campaignId: string;
    campaignName: string;
    ok: boolean;
  };
  "post.published": {
    workspaceSlug: string;
    postId: string;
  };
  "provider.published": {
    workspaceSlug: string;
    provider: string;
    ok: boolean;
    id?: string;
  };
  "job.failed": {
    workspaceSlug: string;
    jobId: string;
    type: string;
    error: string;
  };
}

export type DomainEventName = keyof DomainEventMap;
