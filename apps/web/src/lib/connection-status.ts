import type { ConnectionStatus } from "@nv/domain";

/** Single source of truth for connection-status labels + colors (was duplicated). */
export const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  ok: "Conectado",
  warn: "Con advertencias",
  down: "Caído",
};

export const CONNECTION_STATUS_COLOR: Record<ConnectionStatus, string> = {
  ok: "#3FB950",
  warn: "#E3B341",
  down: "#F85149",
};
