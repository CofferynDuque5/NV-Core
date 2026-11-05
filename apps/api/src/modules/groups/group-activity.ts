import type { PrismaService } from "../../prisma/prisma.service";

/** At most one write per group in this window (busy groups send many messages). */
export const GROUP_ACTIVITY_THROTTLE_MS = 10 * 60_000;
/** A group with no messages for this many days shows as «sin actividad». */
export const DEAD_GROUP_DAYS = 30;

const lastWrite = new Map<string, number>();

/**
 * Remember that someone wrote in a group/channel (WhatsApp or Telegram). Only
 * the time is stored, never the message. Throttled per group.
 */
export async function recordGroupActivity(
  prisma: PrismaService,
  workspaceSlug: string,
  channel: "wa" | "tg",
  remoteJid: string,
  at: Date = new Date(),
  now = Date.now(),
): Promise<boolean> {
  if (!prisma.enabled || !remoteJid) return false;
  const key = `${workspaceSlug}|${channel}|${remoteJid}`;
  const prev = lastWrite.get(key);
  if (prev !== undefined && now - prev < GROUP_ACTIVITY_THROTTLE_MS) return false;
  lastWrite.set(key, now);
  if (lastWrite.size > 20_000) lastWrite.clear();
  await prisma.group.updateMany({
    where: { workspaceSlug, channel, remoteJid, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: at } }] },
    data: { lastMessageAt: at },
  });
  return true;
}

/** Test helper: forget the throttle. */
export function resetGroupActivityThrottle(): void {
  lastWrite.clear();
}

/** «Sin actividad»: nobody wrote in DEAD_GROUP_DAYS days (counted from when it is watched). */
export function isDeadGroup(
  g: { lastMessageAt: Date | null; watchedSince: Date },
  now = Date.now(),
): boolean {
  const ref = (g.lastMessageAt ?? g.watchedSince).getTime();
  return now - ref > DEAD_GROUP_DAYS * 86_400_000;
}
