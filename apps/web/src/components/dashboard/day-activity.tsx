import { CheckCircle2, History, Inbox, MessageCircleReply, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import type { ActivityRun } from "@nv/domain";

import { useDayActivity } from "@/hooks/use-domain-data";
import { useWorkspace } from "@/hooks/use-workspace";
import { Panel, PanelHeader } from "@/components/common/panel";
import { EmptyState } from "@/components/common/empty-state";
import { ListSkeleton } from "@/components/common/skeletons";
import { Button } from "@/components/ui/button";

const TARGET_LABEL: Record<string, string> = {
  wa: "WhatsApp",
  telegram: "Telegram",
  tg: "Telegram",
  facebook: "Facebook",
  instagram: "Instagram",
  status: "Estado de WhatsApp",
};

const hour = (iso: string) => new Date(iso).toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" });

/** «Se envió X de 9:05 p. m. a 9:40 p. m. · 46 enviados · 13 no salieron». */
export function runSentence(r: ActivityRun): string {
  const span = r.startedAt.slice(0, 16) === r.endedAt.slice(0, 16) ? `a las ${hour(r.startedAt)}` : `de ${hour(r.startedAt)} a ${hour(r.endedAt)}`;
  return `Se envió ${span}`;
}

/** Dashboard panel: what the brand did today, campaign by campaign. */
export function DayActivity() {
  const ws = useWorkspace();
  const activity = useDayActivity();
  const data = activity.data;
  return (
    <Panel data-testid="day-activity">
      <PanelHeader
        title="Lo que pasó hoy"
        description="Cada campaña enviada hoy, de qué hora a qué hora, y cómo se movió el Inbox"
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/w/${ws.slug}/historial`}>Ver historial →</Link>
          </Button>
        }
      />
      <div className="space-y-4 p-4">
        {activity.isLoading ? (
          <ListSkeleton rows={3} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat icon={Inbox} label="Mensajes recibidos" value={data?.inbox.received ?? 0} />
              <Stat icon={MessageCircleReply} label="Respuestas enviadas" value={data?.inbox.replied ?? 0} />
              <Stat icon={UserPlus} label="Chats nuevos" value={data?.inbox.newChats ?? 0} />
            </div>
            {(data?.runs.length ?? 0) === 0 ? (
              <EmptyState
                icon={History}
                title="Hoy no se ha enviado ninguna campaña"
                description="Cuando se envíe una, verás aquí desde qué hora hasta qué hora salió y a cuántos grupos llegó."
                compact
              />
            ) : (
              <ol className="relative space-y-3 border-l border-line-soft pl-4">
                {data!.runs.map((r) => (
                  <li key={`${r.campaignId}-${r.startedAt}`} data-testid="day-activity-run" className="relative">
                    <span className="absolute -left-[21px] top-1 grid size-2.5 place-items-center rounded-full bg-brand ring-4 ring-panel" />
                    <div className="text-sm font-medium text-ink-bright">{r.campaignName}</div>
                    <div className="text-xs text-ink-muted">
                      {runSentence(r)} · {r.targets.map((t) => TARGET_LABEL[t] ?? t).join(", ")}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-state-success">
                        <CheckCircle2 className="size-3.5" /> {r.sent} {r.sent === 1 ? "enviado" : "enviados"}
                      </span>
                      {r.failed > 0 ? (
                        <span className="text-state-danger">
                          {r.failed} no {r.failed === 1 ? "salió" : "salieron"}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Inbox; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-panel-raised px-2 py-3">
      <Icon className="mx-auto size-4 text-ink-faint" />
      <div className="mt-1 text-lg font-semibold tabular-nums text-ink-bright">{value}</div>
      <div className="text-[11px] text-ink-faint">{label}</div>
    </div>
  );
}
