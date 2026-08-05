import { EventEmitter } from "node:events";

import { Injectable, Logger } from "@nestjs/common";

import type { DomainEventMap, DomainEventName } from "./domain-events";

type Handler<E extends DomainEventName> = (payload: DomainEventMap[E]) => void | Promise<void>;

/**
 * Internal Event Bus — a thin, typed wrapper over Node's EventEmitter.
 *
 * Modules communicate by publishing/subscribing to domain events instead of
 * importing each other's services, which keeps them decoupled. Handlers are
 * isolated: a throwing/ rejecting handler is logged and never breaks the
 * publisher or the other subscribers.
 */
@Injectable()
export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(EventBus.name);

  constructor() {
    // Many modules may subscribe to the same event.
    this.emitter.setMaxListeners(50);
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<E extends DomainEventName>(event: E, handler: Handler<E>): () => void {
    const wrapped = (payload: DomainEventMap[E]) => {
      void Promise.resolve()
        .then(() => handler(payload))
        .catch((err) =>
          this.logger.warn(`Handler de "${event}" falló: ${(err as Error).message}`),
        );
    };
    this.emitter.on(event, wrapped as (...args: unknown[]) => void);
    return () => this.emitter.off(event, wrapped as (...args: unknown[]) => void);
  }

  /** Publish an event to all subscribers (fire-and-forget). */
  emit<E extends DomainEventName>(event: E, payload: DomainEventMap[E]): void {
    this.logger.debug?.(`evento → ${event}`);
    this.emitter.emit(event, payload);
  }
}
