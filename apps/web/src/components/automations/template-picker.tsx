import * as React from "react";
import type { Automation } from "@nv/domain";
import { Loader2, Sparkles } from "lucide-react";

import { useCreateAutomation } from "@/hooks/use-domain-mutations";
import { AUTOMATION_TEMPLATES, templateToInput, type AutomationTemplate } from "@/lib/automation-templates";
import { nodeKind } from "@/lib/workflow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Pick a ready-made flow; it is created paused and opened in the editor. */
export function TemplatePicker({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (automation: Automation) => void;
}) {
  const create = useCreateAutomation();
  const [pending, setPending] = React.useState<string | null>(null);

  function use(t: AutomationTemplate) {
    setPending(t.id);
    create.mutate(templateToInput(t), {
      onSuccess: (a) => {
        onOpenChange(false);
        onCreated(a);
      },
      onSettled: () => setPending(null),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plantillas de automatización</DialogTitle>
          <DialogDescription>
            Se crean en pausa: revisa los textos, ajústalos a tu marca y actívalas cuando quieras.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1" data-testid="automation-templates">
          {AUTOMATION_TEMPLATES.map((t) => (
            <li key={t.id} className="rounded-xl border border-line-soft bg-panel-raised p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-sm font-semibold text-ink-bright">{t.name}</p>
                  <p className="text-xs text-ink-muted">{t.summary}</p>
                  <ol className="flex flex-wrap items-center gap-1 text-[11px] text-ink-muted">
                    {t.nodes.map((node, i) => (
                      <li key={node.id} className="flex items-center gap-1">
                        {i > 0 ? <span className="text-ink-faint">→</span> : null}
                        <span
                          className="rounded-md px-1.5 py-0.5"
                          style={{ background: `${nodeKind(node.type).accent}1f` }}
                        >
                          {node.label}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-wrap gap-1">
                    {t.needs.map((need) => (
                      <Badge key={need} variant="outline">
                        Necesita: {need}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button size="sm" disabled={pending !== null} onClick={() => use(t)} aria-label={`Usar ${t.name}`}>
                  {pending === t.id ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Usar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
