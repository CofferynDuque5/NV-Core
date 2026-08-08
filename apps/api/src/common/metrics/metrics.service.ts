import { Injectable, type OnModuleInit } from "@nestjs/common";

import { EventBus } from "../../core/events/event-bus.service";

/**
 * A tiny, dependency-free Prometheus registry.
 *
 * We hand-roll the text exposition format instead of pulling in `prom-client`
 * to keep the dependency surface small. It supports the two shapes we need:
 * labelled counters and a single request-duration histogram.
 */

const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

type Labels = Record<string, string>;

/** Deterministic series key so identical label sets collapse to one series. */
function seriesKey(labels: Labels): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(",");
}

function renderLabels(labels: Labels): string {
  const entries = Object.keys(labels)
    .sort()
    .map((k) => `${k}="${escapeLabel(labels[k]!)}"`);
  return entries.length ? `{${entries.join(",")}}` : "";
}

function escapeLabel(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

interface CounterSeries {
  labels: Labels;
  value: number;
}
interface Counter {
  help: string;
  series: Map<string, CounterSeries>;
}
interface HistogramSeries {
  labels: Labels;
  buckets: number[]; // cumulative counts aligned to DURATION_BUCKETS
  sum: number;
  count: number;
}

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly counters = new Map<string, Counter>();
  private readonly histogram = new Map<string, HistogramSeries>();

  constructor(private readonly bus: EventBus) {}

  /** Wire domain-event counters so the business signal is scrapeable too. */
  onModuleInit(): void {
    this.bus.on("message.received", () => this.event("message.received", "ok"));
    this.bus.on("message.sent", () => this.event("message.sent", "ok"));
    this.bus.on("provider.published", (p) => this.event("provider.published", p.ok ? "ok" : "error"));
    this.bus.on("campaign.completed", (p) => this.event("campaign.completed", p.ok ? "ok" : "error"));
    this.bus.on("post.published", () => this.event("post.published", "ok"));
    this.bus.on("job.failed", () => this.event("job.failed", "error"));
  }

  private event(event: string, status: "ok" | "error"): void {
    this.incCounter(
      "nv_domain_events_total",
      "Domain events emitted on the internal bus.",
      { event, status },
    );
  }

  /** Increment (or create) a labelled counter series. */
  incCounter(name: string, help: string, labels: Labels, by = 1): void {
    let counter = this.counters.get(name);
    if (!counter) {
      counter = { help, series: new Map() };
      this.counters.set(name, counter);
    }
    const key = seriesKey(labels);
    const existing = counter.series.get(key);
    if (existing) existing.value += by;
    else counter.series.set(key, { labels, value: by });
  }

  /** Record an HTTP request duration (seconds) into the histogram + the total counter. */
  observeHttp(method: string, route: string, status: number, seconds: number): void {
    this.incCounter("http_requests_total", "Total HTTP requests.", {
      method,
      route,
      status: String(status),
    });
    const labels: Labels = { method, route };
    const key = seriesKey(labels);
    let series = this.histogram.get(key);
    if (!series) {
      series = { labels, buckets: DURATION_BUCKETS.map(() => 0), sum: 0, count: 0 };
      this.histogram.set(key, series);
    }
    series.sum += seconds;
    series.count += 1;
    for (let i = 0; i < DURATION_BUCKETS.length; i++) {
      if (seconds <= DURATION_BUCKETS[i]!) series.buckets[i]! += 1;
    }
  }

  /**
   * Render the full registry in Prometheus text exposition format. `extra`
   * holds gauge lines computed at scrape time (build info, dependency up).
   */
  render(extra: string[] = []): string {
    const lines: string[] = [];

    for (const [name, counter] of this.counters) {
      lines.push(`# HELP ${name} ${counter.help}`);
      lines.push(`# TYPE ${name} counter`);
      for (const s of counter.series.values()) {
        lines.push(`${name}${renderLabels(s.labels)} ${s.value}`);
      }
    }

    if (this.histogram.size > 0) {
      const name = "http_request_duration_seconds";
      lines.push(`# HELP ${name} HTTP request duration in seconds.`);
      lines.push(`# TYPE ${name} histogram`);
      for (const s of this.histogram.values()) {
        for (let i = 0; i < DURATION_BUCKETS.length; i++) {
          const l = renderLabels({ ...s.labels, le: String(DURATION_BUCKETS[i]) });
          lines.push(`${name}_bucket${l} ${s.buckets[i]}`);
        }
        lines.push(`${name}_bucket${renderLabels({ ...s.labels, le: "+Inf" })} ${s.count}`);
        lines.push(`${name}_sum${renderLabels(s.labels)} ${s.sum}`);
        lines.push(`${name}_count${renderLabels(s.labels)} ${s.count}`);
      }
    }

    return [...lines, ...extra].join("\n") + "\n";
  }
}
