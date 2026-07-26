import { createHash } from "node:crypto";

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Parse a `CLOUDINARY_URL` (`cloudinary://<api_key>:<api_secret>@<cloud_name>`).
 * Returns null when unset or malformed (→ upload signing is unavailable).
 */
export function parseCloudinaryUrl(url: string | undefined): CloudinaryCredentials | null {
  if (!url) return null;
  const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url.trim());
  if (!match) return null;
  const [, apiKey, apiSecret, cloudName] = match;
  if (!apiKey || !apiSecret || !cloudName) return null;
  return { apiKey, apiSecret, cloudName };
}

/**
 * Build a Cloudinary upload signature: SHA-1 of the params (sorted, `key=value`
 * joined by `&`) with the api secret appended. Pure — unit tested.
 */
export function buildUploadSignature(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
}
