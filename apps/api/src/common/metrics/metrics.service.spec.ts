import { describe, expect, it, vi } from "vitest";

import { MetricsService } from "./metrics.service";
import type { EventBus } from "../../core/events/event-bus.service";

function make() {
  const handlers: Record<string, (p: unknown) => void> = {};
  const bus = {
    on: vi.fn((event: string, h: (p: unknown) => void) => {
      handlers[event] = h;
      return () => undefined;
    }),
  } as unknown as EventBus;
  const svc = new MetricsService(bus);
  svc.onModuleInit();
  return { svc, handlers };
}

describe("MetricsService", () => {
  it("renders counters in Prometheus format", () => {
    const { svc } = make();
    svc.incCounter("http_requests_total", "Total HTTP requests.", { method: "GET", route: "/x", status: "200" });
    svc.incCounter("http_requests_total", "Total HTTP requests.", { method: "GET", route: "/x", status: "200" });
    const out = svc.render();
    expect(out).toContain("# TYPE http_requests_total counter");
    expect(out).toContain('http_requests_total{method="GET",route="/x",status="200"} 2');
  });

  it("renders a histogram with cumulative buckets, sum and count", () => {
    const { svc } = make();
    svc.observeHttp("GET", "/x", 200, 0.03); // between 0.025 and 0.05
    svc.observeHttp("GET", "/x", 200, 0.2); // between 0.1 and 0.25
    const out = svc.render();
    expect(out).toContain("# TYPE http_request_duration_seconds histogram");
    // le=0.05 should have counted only the 0.03 observation (labels render sorted: le first)
    expect(out).toMatch(/http_request_duration_seconds_bucket\{le="0.05"[^}]*\} 1/);
    expect(out).toMatch(/http_request_duration_seconds_bucket\{le="\+Inf"[^}]*\} 2/);
    expect(out).toMatch(/http_request_duration_seconds_count\{method="GET",route="\/x"\} 2/);
    expect(out).toMatch(/http_request_duration_seconds_sum\{method="GET",route="\/x"\} 0\.23/);
  });

  it("counts domain events from the bus with ok/error status", () => {
    const { svc, handlers } = make();
    handlers["message.sent"]!({});
    handlers["provider.published"]!({ ok: false });
    handlers["provider.published"]!({ ok: true });
    const out = svc.render();
    expect(out).toContain('nv_domain_events_total{event="message.sent",status="ok"} 1');
    expect(out).toContain('nv_domain_events_total{event="provider.published",status="error"} 1');
    expect(out).toContain('nv_domain_events_total{event="provider.published",status="ok"} 1');
  });

  it("appends extra gauge lines passed at scrape time", () => {
    const { svc } = make();
    const out = svc.render(['nv_dependency_up{dependency="database"} 1']);
    expect(out).toContain('nv_dependency_up{dependency="database"} 1');
  });
});
