import { pdf } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { createElement } from 'react';
import type { ReactElement } from 'react';
import type { Company, Job, Site, Customer, Profile, Jobsheet, Photo, Remedial } from '../types';
import type { TemplateDef } from '../templates/types';
import { JobsheetPDF } from './JobsheetPDF';
import { supabase } from '../lib/supabaseClient';
import { db } from '../lib/db';

/**
 * Renders the jobsheet PDF to a Blob, uploads it to Supabase Storage,
 * updates both Supabase and local Dexie with the public URL, and returns that URL.
 *
 * Throws on upload/DB error so the caller (sync engine) can log and retry.
 */
export async function generateAndUploadPDF(
  jobsheet: Jobsheet,
  job: Job,
  site: Site,
  customer: Customer,
  company: Company,
  engineerProfile: Profile,
  photos: Photo[],
  remedials: Remedial[],
  template: TemplateDef,
): Promise<string> {
  // 1. Render PDF to Blob
  const element = createElement(JobsheetPDF, {
    jobsheet,
    job,
    site,
    customer,
    company,
    engineerProfile,
    photos,
    remedials,
    template,
  }) as unknown as ReactElement<DocumentProps>;

  const blob = await pdf(element).toBlob();

  // 2. Build the storage path
  const storagePath = `${company.id}/${jobsheet.id}/report.pdf`;

  // 3. Upload to Supabase Storage (pdfs bucket)
  const { error: uploadError } = await supabase.storage
    .from('pdfs')
    .upload(storagePath, blob, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) throw new Error(uploadError.message);

  // 4. Get the public URL
  const { data: urlData } = supabase.storage.from('pdfs').getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  // 5. Update Supabase jobsheets row
  const { error: dbError } = await supabase
    .from('jobsheets')
    .update({ pdf_url: publicUrl })
    .eq('id', jobsheet.id);

  if (dbError) throw new Error(dbError.message);

  // 6. Update local Dexie cache
  await db.jobsheets.update(jobsheet.id, { pdf_url: publicUrl });

  return publicUrl;
}
