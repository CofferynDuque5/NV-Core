import type { MediaUploadSignature } from "@nv/domain";

export interface CloudinaryUpload {
  secureUrl: string;
  resourceType: string;
}

/**
 * Upload a file to Cloudinary with a backend-issued signed signature.
 * Single source of truth for the direct-to-Cloudinary request (was duplicated
 * across the media and campaign-attachment mutations).
 */
export async function uploadToCloudinary(
  sig: MediaUploadSignature,
  file: File,
): Promise<CloudinaryUpload> {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("folder", sig.folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Fallo al subir a Cloudinary.");
  }
  const uploaded = (await res.json()) as { secure_url: string; resource_type: string };
  return { secureUrl: uploaded.secure_url, resourceType: uploaded.resource_type };
}
