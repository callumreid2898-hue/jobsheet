import { createContext, useContext } from 'react';

/** Which jobsheet the fields belong to, so photo and signature fields can build storage paths. */
export interface FormMediaContextValue {
  jobsheetId: string;
  companyId: string;
}

export const FormMediaContext = createContext<FormMediaContextValue>({ jobsheetId: '', companyId: '' });

export function useFormMedia(): FormMediaContextValue {
  return useContext(FormMediaContext);
}
