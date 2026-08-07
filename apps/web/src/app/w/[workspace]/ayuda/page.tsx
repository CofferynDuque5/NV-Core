import * as React from "react";
import {
  ArrowRight,
  LifeBuoy,
  Lightbulb,
  Megaphone,
  Plug,
  Rocket,
  Search,
  Settings,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  type HelpArticle,
  type HelpCategoryId,
} from "@nv/domain";

import { useWorkspace } from "@/hooks/use-workspace";
import { useUiStore } from "@/stores/ui-store";
import { countInCategory, filterArticles } from "@/lib/help";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Rocket,
  Plug,
  Users,
  Megaphone,
  Workflow,
  Settings,
};

const CATEGORY_LABEL: Record<HelpCategoryId, string> = Object.fromEntries(
  HELP_CATEGORIES.map((c) => [c.id, c.label]),
) as Record<HelpCategoryId, string>;

export default function AyudaPage() {
  const ws = useWorkspace();
  const openFeedback = useUiStore((s) => s.openFeedback);
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState<HelpCategoryId | "">("");
  const [detail, setDetail] = React.useState<HelpArticle | null>(null);

  const filtered = React.useMemo(
    () => filterArticles(HELP_ARTICLES, { q: query, category: category || undefined }),
    [query, category],
  );
  const searching = query.trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Soporte"
        title="Centro de ayuda"
        description="Guías y respuestas para sacar el máximo partido a NV Core."
      />

      {/* Search + category filter */}
      <div className="flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            placeholder="Busca por tema, canal o palabra clave…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar en el centro de ayuda"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <CategoryChip label="Todas" active={category === ""} onClick={() => setCategory("")} />
          {HELP_CATEGORIES.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.label}
              active={category === c.id}
              onClick={() => setCategory(category === c.id ? "" : c.id)}
            />
          ))}
        </div>
      </div>

      {/* Category overview — only on the default view (no search, no category) */}
      {!searching && category === "" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HELP_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c.icon] ?? LifeBuoy;
            const count = countInCategory(HELP_ARTICLES, c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className="group flex flex-col gap-3 rounded-xl border border-line-soft bg-panel p-4 text-left transition-colors hover:border-line-bright"
              >
                <span
                  className="grid size-10 place-items-center rounded-lg"
                  style={{ background: `${ws.accent}22`, color: ws.accent }}
                >
                  <Icon className="size-5" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-ink-bright group-hover:text-brand">
                    {c.label}
                  </div>
                  <p className="text-xs leading-relaxed text-ink-muted">{c.description}</p>
                </div>
                <span className="mt-auto text-[11px] font-medium text-ink-faint">
                  {count} {count === 1 ? "artículo" : "artículos"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Article list — shown when searching or a category is active */}
      {searching || category !== "" ? (
        filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Sin resultados"
            description={`No encontramos artículos para «${query || CATEGORY_LABEL[category as HelpCategoryId]}».`}
            compact
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filtered.map((a) => (
              <ArticleCard key={a.slug} article={a} onOpen={() => setDetail(a)} />
            ))}
          </div>
        )
      ) : null}

      {/* Contact fallback */}
      <div className="flex flex-col items-start gap-2 rounded-xl border border-line-soft bg-panel-raised p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-panel-high text-ink-muted">
            <LifeBuoy className="size-4" />
          </span>
          <div>
            <div className="text-sm font-medium text-ink">¿No encuentras lo que buscas?</div>
            <div className="text-xs text-ink-muted">Envíanos tu pregunta y te ayudamos.</div>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={openFeedback}>
          Enviar comentarios
        </Button>
      </div>

      {/* Article detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {detail ? <ArticleDetail article={detail} workspaceSlug={ws.slug} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
          : "rounded-full border border-line-soft bg-panel px-3 py-1 text-xs font-medium text-ink-muted transition-colors hover:border-line-bright hover:text-ink"
      }
    >
      {label}
    </button>
  );
}

function ArticleCard({ article, onOpen }: { article: HelpArticle; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col gap-2 rounded-xl border border-line-soft bg-panel p-4 text-left transition-colors hover:border-line-bright"
    >
      <div className="text-[11px] uppercase tracking-wide text-ink-faint">
        {CATEGORY_LABEL[article.category]}
      </div>
      <div className="text-sm font-semibold text-ink-bright group-hover:text-brand">
        {article.title}
      </div>
      <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted">{article.summary}</p>
      <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
        Leer <ArrowRight className="size-3.5" />
      </span>
    </button>
  );
}

function ArticleDetail({ article, workspaceSlug }: { article: HelpArticle; workspaceSlug: string }) {
  return (
    <>
      <DialogHeader>
        <div className="text-[11px] uppercase tracking-wide text-ink-faint">
          {CATEGORY_LABEL[article.category]}
        </div>
        <DialogTitle>{article.title}</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        {article.body.map((block, i) => {
          if (block.type === "steps") {
            return (
              <ol key={i} className="space-y-2">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2.5 text-sm text-ink">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand/12 text-[11px] font-semibold text-brand">
                      {j + 1}
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ol>
            );
          }
          if (block.type === "tip") {
            return (
              <div
                key={i}
                className="flex gap-2.5 rounded-lg border border-line-soft bg-panel-raised p-3"
              >
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-state-warning" />
                <p className="text-xs leading-relaxed text-ink-muted">{block.text}</p>
              </div>
            );
          }
          return (
            <p key={i} className="text-sm leading-relaxed text-ink-soft">
              {block.text}
            </p>
          );
        })}
      </div>

      {article.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {article.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-panel-high px-2 py-0.5 text-[11px] text-ink-faint"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      {article.moduleHref ? (
        <div className="border-t border-line-soft pt-4">
          <Button size="sm" asChild>
            <a href={`/w/${workspaceSlug}/${article.moduleHref}`}>
              Ir al módulo <ArrowRight className="size-3.5" />
            </a>
          </Button>
        </div>
      ) : null}
    </>
  );
}
