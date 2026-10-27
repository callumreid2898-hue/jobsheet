// Parts of the app that are switched off for now. Their pages, data and tables
// stay in place; flip a flag to bring one back.
export const FEATURES = {
  quotes: false,
  invoices: false,
} as const;

export type Feature = keyof typeof FEATURES;
