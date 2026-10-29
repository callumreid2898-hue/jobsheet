import { createContext, useContext } from 'react';

/**
 * Which jobsheet the fields belong to, so photo and signature fields can build storage paths,
 * and the job's site and system, so the device tests field can list the devices.
 */
export interface FormMediaContextValue {
  jobsheetId: string;
  companyId: string;
  siteId?: string;
  systemId?: string | null;
}

export const FormMediaContext = createContext<FormMediaContextValue>({ jobsheetId: '', companyId: '' });

export function useFormMedia(): FormMediaContextValue {
  return useContext(FormMediaContext);
}
