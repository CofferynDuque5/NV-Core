import * as React from "react";
import { Sparkles, Wrench, Bug, ArrowUpRight } from "lucide-react";
import { CHANGELOG_ENTRIES, type ChangelogType } from "@nv/domain";

import { useChangelog } from "@/hooks/use-domain-data";
import { useMarkChangelogSeen } from "@/hooks/use-domain-mutations";
import { PageHeader } from "@/components/common/page-header";

const TYPE_META: Record<
  ChangelogType,
  { label: string; icon: typeof Sparkles; color: string }
> = {
  feature: { label: "Novedad", icon: Sparkles, color: "#5B8DEF" },
  improvement: { label: "Mejora", icon: ArrowUpRight, color: "#3FB950" },
  fix: { label: "Corrección", icon: Bug, color: "#E3B341" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function NovedadesPage() {
  const { data } = useChangelog();
  const markSeen = useMarkChangelogSeen();

  // Mark everything seen once, when the user opens the page (only if there is
  // something unseen — avoids a needless write on every visit).
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (fired.current) return;
    if (data && data.unseenCount > 0) {
      fired.current = true;
      markSeen.mutate();
    }
  }, [data, markSeen]);

  const lastSeenMs = data?.lastSeenAt ? new Date(data.lastSeenAt).getTime() : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Producto"
        title="Novedades"
        description="Todo lo que hemos lanzado y mejorado en NV Core."
      />

      <ol className="relative space-y-4 border-l border-line pl-6">
        {CHANGELOG_ENTRIES.map((entry) => {
          const meta = TYPE_META[entry.type];
          const Icon = meta.icon;
          const isNew =
            lastSeenMs === null || new Date(entry.date).getTime() > lastSeenMs;
          return (
            <li key={entry.id} className="relative">
              {/* Timeline node */}
              <span
                className="absolute -left-[31px] top-1 grid size-6 place-items-center rounded-full ring-4 ring-canvas"
                style={{ background: `${meta.color}22`, color: meta.color }}
                aria-hidden
              >
                <Icon className="size-3.5" />
              </span>

              <div className="rounded-xl border border-line-soft bg-panel p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: `${meta.color}1f`, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-xs text-ink-faint">{formatDate(entry.date)}</span>
                  {isNew ? (
                    <span className="rounded-full bg-brand/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                      Nuevo
                    </span>
                  ) : null}
                </div>

                <h3 className="text-sm font-semibold text-ink-bright">{entry.title}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{entry.summary}</p>

                <ul className="mt-3 space-y-1.5">
                  {entry.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-ink-soft">
                      <span
                        className="mt-1.5 size-1.5 shrink-0 rounded-full"
                        style={{ background: meta.color }}
                        aria-hidden
                      />
                      <span className="leading-relaxed">{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="flex items-center gap-1.5 pl-6 text-xs text-ink-faint">
        <Wrench className="size-3.5" /> Seguimos mejorando NV Core cada semana.
      </p>
    </div>
  );
}
