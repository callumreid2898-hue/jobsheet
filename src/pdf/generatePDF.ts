import { pdf } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { createElement } from 'react';
import type { ReactElement } from 'react';
import type { Company, Job, Site, Customer, Profile, Jobsheet, Photo, Remedial } from '../types';
import type { TemplateDef } from '../templates/types';
import { JobsheetPDF, type JobsheetPDFProps } from './JobsheetPDF';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';
import { MEDIA_BUCKET, getLocalBlob } from '../lib/media';

/** `status` follows HTTP: undefined = network (retried), 404/422 = permanent. */
export class PDFError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

type CachedTable = 'jobsheets' | 'jobs' | 'sites' | 'customers' | 'companies' | 'profiles';

/** Server copy first (it's what was submitted), the local cache if the fetch fails. */
async function fetchRow<T>(table: CachedTable, id: string): Promise<T> {
  const { data, error, status } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (!error && data) return data as T;
  const local = await db.table(table).get(id) as T | undefined;
  if (local) return local;
  throw new PDFError(error ? error.message : `${table} ${id} not found`, error ? status : 404);
}

async function fetchByJobsheet<T>(table: 'photos' | 'remedials', jobsheetId: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*').eq('jobsheet_id', jobsheetId);
  if (!error && data) return data as T[];
  return await db.table(table).where('jobsheet_id').equals(jobsheetId).toArray() as T[];
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// react-pdf can only embed JPEG and PNG.
const EMBEDDABLE = /^image\/(jpe?g|png)$/;

/** A data URI for a photos-bucket path, from this device if it's still here. Null if unavailable. */
async function loadImage(path: string): Promise<string | null> {
  if (path.startsWith('data:')) return path;
  try {
    let blob = await getLocalBlob(path);
    if (!blob) {
      const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(path);
      if (error || !data) return null;
      blob = data;
    }
    const type = blob.type || (path.endsWith('.png') ? 'image/png' : 'image/jpeg');
    if (!EMBEDDABLE.test(type)) return null;
    return await blobToDataURL(blob.type ? blob : new Blob([blob], { type }));
  } catch {
    return null;
  }
}

/** Everything the report shows, for one jobsheet. */
export async function loadReportData(jobsheetId: string): Promise<JobsheetPDFProps> {
  const jobsheet = await fetchRow<Jobsheet>('jobsheets', jobsheetId);
  const job = await fetchRow<Job>('jobs', jobsheet.job_id);
  const site = await fetchRow<Site>('sites', job.site_id);
  const [customer, company, photos, remedials] = await Promise.all([
    fetchRow<Customer>('customers', site.customer_id),
    fetchRow<Company>('companies', jobsheet.company_id),
    fetchByJobsheet<Photo>('photos', jobsheetId),
    fetchByJobsheet<Remedial>('remedials', jobsheetId),
  ]);
  const engineerProfile = job.assigned_engineer_id
    ? await fetchRow<Profile>('profiles', job.assigned_engineer_id).catch(() => null)
    : null;

  let template: TemplateDef;
  try {
    template = (await import(`../templates/${jobsheet.template_id}.json`)).default as TemplateDef;
  } catch {
    throw new PDFError(`Unknown template ${jobsheet.template_id}`, 422);
  }

  photos.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const paths = [
    ...photos.map(p => p.storage_path),
    jobsheet.engineer_signature_url,
    jobsheet.customer_signature_url,
  ].filter((p): p is string => !!p);
  const images: Record<string, string> = {};
  await Promise.all(paths.map(async path => {
    const src = await loadImage(path);
    if (src) images[path] = src;
  }));

  return { jobsheet, job, site, customer, company, engineerProfile, photos, remedials, template, images };
}

export async function renderReportPDF(data: JobsheetPDFProps): Promise<Blob> {
  const element = createElement(JobsheetPDF, data) as unknown as ReactElement<DocumentProps>;
  try {
    return await pdf(element).toBlob();
  } catch (err) {
    throw new PDFError(`Couldn't render the report: ${err instanceof Error ? err.message : String(err)}`, 422);
  }
}

export function reportPath(companyId: string, jobsheetId: string): string {
  return `${companyId}/${jobsheetId}/report.pdf`;
}

/**
 * Renders the jobsheet PDF, uploads it to the private `pdfs` bucket, stores the
 * path on the jobsheet (Supabase + Dexie) and returns it. Open it with
 * openStorageFile('pdfs', path). Throws PDFError so the sync queue can retry.
 */
export async function generateAndUploadPDF(jobsheetId: string): Promise<string> {
  const data = await loadReportData(jobsheetId);
  const blob = await renderReportPDF(data);
  const path = reportPath(data.jobsheet.company_id, jobsheetId);

  const { error: uploadError } = await supabase.storage
    .from('pdfs')
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (uploadError) {
    throw new PDFError(uploadError.message, (uploadError as { status?: number }).status);
  }

  const { error: dbError, status } = await supabase
    .from('jobsheets')
    .update({ pdf_path: path })
    .eq('id', jobsheetId);
  if (dbError) throw new PDFError(dbError.message, status);

  await db.jobsheets.update(jobsheetId, { pdf_path: path });
  // The photos and signatures are on the server and in the report now (unless an upload is still queued)
  const queuedUploads = new Set(
    (await db.sync_queue.where('entity_key').startsWith('storage:').toArray()).map(i => i.payload['blob_key']),
  );
  await db.blobs.where('jobsheet_id').equals(jobsheetId).filter(b => !queuedUploads.has(b.id)).delete();

  return path;
}
