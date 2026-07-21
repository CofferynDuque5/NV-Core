import type { ConnectionStatus } from "@nv/domain";

import { cn } from "@/lib/utils";

const COLORS: Record<ConnectionStatus, string> = {
  ok: "#3FB950",
  warn: "#E3B341",
  down: "#F85149",
};

export function StatusDot({
  status,
  pulse = false,
}: {
  status: ConnectionStatus;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn("inline-block size-2 rounded-full", pulse && "animate-pulse-dot")}
      style={{ background: COLORS[status] }}
    />
  );
}
