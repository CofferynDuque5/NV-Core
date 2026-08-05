import type { ConnectionStatus } from "@nv/domain";

import { cn } from "@/lib/utils";
import { CONNECTION_STATUS_COLOR } from "@/lib/connection-status";

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
      style={{ background: CONNECTION_STATUS_COLOR[status] }}
    />
  );
}
