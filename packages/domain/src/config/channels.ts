import type { Channel, ChannelId } from "..";

/**
 * Supported communication channels and their brand colors.
 * Structural configuration (not user data).
 */
export const CHANNELS: Record<ChannelId, Channel> = {
  wa: { id: "wa", name: "WhatsApp", color: "#25D366", softColor: "rgba(37,211,102,.14)" },
  ig: { id: "ig", name: "Instagram", color: "#E1306C", softColor: "rgba(225,48,108,.14)" },
  fb: { id: "fb", name: "Facebook", color: "#1877F2", softColor: "rgba(24,119,242,.14)" },
  tk: { id: "tk", name: "TikTok", color: "#FE2C55", softColor: "rgba(254,44,85,.14)" },
  tg: { id: "tg", name: "Telegram", color: "#229ED9", softColor: "rgba(34,158,217,.14)" },
  x: { id: "x", name: "X", color: "#C9CDD3", softColor: "rgba(201,205,211,.12)" },
  th: { id: "th", name: "Threads", color: "#E6E9EE", softColor: "rgba(230,233,238,.1)" },
  email: { id: "email", name: "Email", color: "#8B5CF6", softColor: "rgba(139,92,246,.14)" },
};

export const CHANNEL_LIST: Channel[] = Object.values(CHANNELS);

export function getChannel(id: ChannelId): Channel {
  return CHANNELS[id];
}
