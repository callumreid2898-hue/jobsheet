import { db } from './db';
import { supabase } from './supabaseClient';
import type { TemplateDef, FieldDef } from '../templates/types';
import type { AnswersMap, PhotoRef, SignatureRef } from '../types';

// Photos and signatures are saved to db.blobs as soon as they're taken, keyed by the
// photos-bucket path they'll be uploaded to. Submitting the jobsheet queues the uploads.

export const MEDIA_BUCKET = 'photos';

export type SignatureRole = 'engineer' | 'customer';

export function photoPath(companyId: string, jobsheetId: string, photoId: string): string {
  return `${companyId}/${jobsheetId}/${photoId}.jpg`;
}

export function signaturePath(companyId: string, jobsheetId: string, role: SignatureRole): string {
  return `${companyId}/${jobsheetId}/signatures/${role}.png`;
}

/** Templates name their signature fields engineer_signature / customer_signature. */
export function signatureRole(fieldId: string): SignatureRole {
  return fieldId.startsWith('customer') ? 'customer' : 'engineer';
}

export async function saveLocalBlob(path: string, jobsheetId: string, blob: Blob): Promise<void> {
  const data = await blob.arrayBuffer();
  await db.blobs.put({ id: path, jobsheet_id: jobsheetId, data, type: blob.type, created_at: new Date().toISOString() });
}

export async function getLocalBlob(path: string): Promise<Blob | undefined> {
  const row = await db.blobs.get(path);
  return row ? new Blob([row.data], { type: row.type }) : undefined;
}

export async function deleteLocalBlob(path: string): Promise<void> {
  await db.blobs.delete(path);
}

const MAX_EDGE = 1600;

/**
 * Downscales to at most 1600px and re-encodes as JPEG (also turns HEIC into
 * something the PDF can embed). Falls back to the original if it can't be decoded.
 */
export async function compressImage(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    return out ?? file;
  } catch {
    return file;
  }
}

export interface CollectedMedia {
  photos: { ref: PhotoRef; label: string }[];
  signatures: { ref: SignatureRef; role: SignatureRole }[];
}

/** Every photo and signature referenced by the answers, including repeat instances. */
export function collectMedia(template: TemplateDef, answers: AnswersMap): CollectedMedia {
  const out: CollectedMedia = { photos: [], signatures: [] };

  const visit = (field: FieldDef, value: unknown) => {
    if (!value) return;
    if (field.type === 'photo' && Array.isArray(value)) {
      for (const ref of value as PhotoRef[]) {
        if (ref?.storage_path) out.photos.push({ ref, label: field.label });
      }
    } else if (field.type === 'signature' && (value as SignatureRef).storage_path) {
      out.signatures.push({ ref: value as SignatureRef, role: signatureRole(field.id) });
    }
  };

  for (const section of template.sections) {
    const scopes = section.repeatable
      ? ((answers[section.id + '_instances'] as AnswersMap[] | undefined) ?? [])
      : [answers];
    for (const scope of scopes) {
      for (const field of section.fields) visit(field, scope?.[field.id]);
    }
  }
  return out;
}

/**
 * Opens a private storage file in a new tab. The tab is opened before the await
 * so mobile browsers don't treat it as a popup.
 */
export async function openStorageFile(bucket: string, path: string): Promise<void> {
  const tab = window.open('', '_blank');
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error || !data) {
    tab?.close();
    throw new Error(error?.message ?? 'Could not open the file');
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
}
