/**
 * Hard caps for list queries. Every request-path `findMany` bounds its result so
 * a large tenant can never make an endpoint return its entire table (memory /
 * latency blow-up). These are generous ceilings, not page sizes — true
 * cursor pagination is layered on top where the UI needs it (e.g. contacts).
 */

/** Max rows returned by a workspace list endpoint in a single response. */
export const LIST_CAP = 500;

/** Max messages returned for a single conversation thread (most recent). */
export const THREAD_CAP = 500;
