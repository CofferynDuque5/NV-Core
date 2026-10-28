import { SAMPLE_RECORDS } from "../../common/sample-data.service";
import { phoneKey } from "../consent/consent.service";

/**
 * Rules for linking chats with CRM contacts. Pure — tested.
 */

/** A name that is really just the number (or empty): worth replacing with a real one. */
export function isBareName(name: string | null | undefined, handle?: string | null): boolean {
  const n = (name ?? "").trim();
  if (!n) return true;
  if (handle && n === handle.trim()) return true;
  return /^[+\d\s().-]+$/.test(n);
}

/**
 * The old example contacts (loaded by earlier versions) used phone numbers
 * that can belong to real people: never take a name from them or link a real
 * chat to them.
 */
export function isSampleContact(name: string | null | undefined, phone: string | null | undefined): boolean {
  const key = phoneKey(phone);
  return SAMPLE_RECORDS.contacts.some(([n, p]) => n === name && phoneKey(p) === key);
}

/** How a WhatsApp number is stored on a contact created from a chat. */
export function phoneFromHandle(handle: string): string | null {
  const digits = handle.replace(/\D/g, "");
  return digits.length >= 7 ? `+${digits}` : null;
}
