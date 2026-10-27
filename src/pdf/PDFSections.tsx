import { View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { Company, Job, Site, Customer, Profile, Remedial, Photo, PassFailNote, YesNoNa } from '../types';
import type { SectionDef, FieldDef } from '../templates/types';
import { formatUKDateTime } from '../lib/dates';

const colors = {
  primary: '#1e40af',
  textDark: '#111827',
  textGray: '#6b7280',
  border: '#e5e7eb',
  passGreen: '#16a34a',
  failRed: '#dc2626',
  urgentRed: '#fee2e2',
  recommendedOrange: '#fff7ed',
  advisoryYellow: '#fefce8',
};

export const pdfStyles = StyleSheet.create({
  page: { padding: 30, paddingBottom: 60, fontSize: 9, fontFamily: 'Helvetica', color: colors.textDark },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid ${colors.primary}` },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: 'flex-end', maxWidth: '55%' },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: colors.primary },
  companyAccred: { fontSize: 7.5, color: colors.textGray, marginTop: 2 },
  companyAddress: { fontSize: 7.5, color: colors.textGray },
  companyPhone: { fontSize: 7.5, color: colors.textGray, marginTop: 1 },
  docTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: colors.primary, textAlign: 'right' },
  infoBar: { backgroundColor: colors.primary, padding: '6 10', borderRadius: 4, marginBottom: 10 },
  infoBarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  infoBarItem: { flexDirection: 'column' },
  infoBarLabel: { fontSize: 7, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' },
  infoBarValue: { fontSize: 9, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  sectionHeader: { backgroundColor: colors.primary, padding: '4 8', marginBottom: 0 },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#ffffff', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBody: { border: `1px solid ${colors.border}`, marginBottom: 8, borderTop: 'none' },
  fieldRow: { flexDirection: 'row', borderBottom: `1px solid ${colors.border}`, padding: '4 8', alignItems: 'flex-start', minHeight: 20 },
  fieldLabel: { width: '40%', fontSize: 8, color: colors.textGray, paddingRight: 8 },
  fieldValue: { flex: 1, fontSize: 9 },
  passText: { color: colors.passGreen, fontFamily: 'Helvetica-Bold' },
  failText: { color: colors.failRed, fontFamily: 'Helvetica-Bold' },
  remedialTable: { border: `1px solid ${colors.border}`, marginBottom: 8 },
  remedialHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', borderBottom: `1px solid ${colors.border}`, padding: '4 8' },
  remedialHeaderCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: colors.textGray },
  remedialRow: { flexDirection: 'row', borderBottom: `1px solid ${colors.border}`, padding: '4 8' },
  remedialDesc: { flex: 3, fontSize: 8 },
  remedialPriority: { flex: 1, fontSize: 8 },
  remedialStatus: { flex: 1, fontSize: 8 },
  signatureSection: { flexDirection: 'row', gap: 12, marginTop: 8 },
  signatureBox: { flex: 1, border: `1px solid ${colors.border}`, borderRadius: 4, padding: 8 },
  signatureLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: colors.textGray, marginBottom: 4 },
  signatureImage: { width: '100%', height: 60, objectFit: 'contain', backgroundColor: '#fafafa' },
  signaturePlaceholder: { height: 60, backgroundColor: '#fafafa', border: `1px dashed ${colors.border}`, alignItems: 'center', justifyContent: 'center' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photoItem: { width: '48%', marginBottom: 6 },
  photoImage: { width: '100%', height: 120, objectFit: 'cover', borderRadius: 4 },
  photoCaption: { fontSize: 7, color: colors.textGray, marginTop: 2 },
  footer: { position: 'absolute', bottom: 30, left: 30, right: 30, flexDirection: 'row', justifyContent: 'space-between', borderTop: `1px solid ${colors.border}`, paddingTop: 6 },
  footerText: { fontSize: 7, color: colors.textGray },
  disclaimer: { position: 'absolute', bottom: 12, left: 30, right: 30 },
  disclaimerText: { fontSize: 6.5, color: colors.textGray, textAlign: 'center', fontStyle: 'italic' },
  logo: { width: 48, height: 48, objectFit: 'contain', marginRight: 8 },
});

// ─── Header ────────────────────────────────────────────────────────────────────

interface HeaderProps { company: Company; templateTitle: string; }
export function PDFHeader({ company, templateTitle }: HeaderProps) {
  return (
    <View style={pdfStyles.header}>
      <View style={[pdfStyles.headerLeft, { flexDirection: 'row', alignItems: 'flex-start' }]}>
        {company.logo_url && (
          <Image style={pdfStyles.logo} src={company.logo_url} />
        )}
        <View>
          <Text style={pdfStyles.companyName}>{company.name}</Text>
          {company.accreditation_number && (
            <Text style={pdfStyles.companyAccred}>Accreditation: {company.accreditation_number}</Text>
          )}
          {company.address && (
            <Text style={pdfStyles.companyAddress}>{company.address}</Text>
          )}
        </View>
      </View>
      <View style={pdfStyles.headerRight}>
        <Text style={pdfStyles.docTitle}>{templateTitle}</Text>
      </View>
    </View>
  );
}

// ─── Info bar ──────────────────────────────────────────────────────────────────

interface InfoBarProps { job: Job; site: Site; customer: Customer; engineer: Profile | null; }
export function PDFJobInfoBar({ job, site, customer, engineer }: InfoBarProps) {
  return (
    <View style={pdfStyles.infoBar}>
      <View style={pdfStyles.infoBarRow}>
        <View style={pdfStyles.infoBarItem}>
          <Text style={pdfStyles.infoBarLabel}>Site</Text>
          <Text style={pdfStyles.infoBarValue}>{[...new Set([site.name, site.address].filter(Boolean))].join(', ')}</Text>
        </View>
        <View style={pdfStyles.infoBarItem}>
          <Text style={pdfStyles.infoBarLabel}>Customer</Text>
          <Text style={pdfStyles.infoBarValue}>{customer.name}</Text>
        </View>
        <View style={pdfStyles.infoBarItem}>
          <Text style={pdfStyles.infoBarLabel}>Engineer</Text>
          <Text style={pdfStyles.infoBarValue}>{engineer?.full_name ?? '—'}</Text>
        </View>
        <View style={pdfStyles.infoBarItem}>
          <Text style={pdfStyles.infoBarLabel}>Date</Text>
          <Text style={pdfStyles.infoBarValue}>
            {job.scheduled_date.split('-').reverse().join('/')}
            {job.scheduled_time ? `  ${job.scheduled_time}` : ''}
          </Text>
        </View>
        <View style={pdfStyles.infoBarItem}>
          <Text style={pdfStyles.infoBarLabel}>Job type</Text>
          <Text style={pdfStyles.infoBarValue}>{job.type.replace(/_/g, ' ')}</Text>
        </View>
        <View style={pdfStyles.infoBarItem}>
          <Text style={pdfStyles.infoBarLabel}>Status</Text>
          <Text style={pdfStyles.infoBarValue}>{job.status.replace(/_/g, ' ').toUpperCase()}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Template section ──────────────────────────────────────────────────────────

/** How one answer is printed. Shared by normal and repeatable sections. */
export type AnswerDisplay =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'pass_fail'; result: 'pass' | 'fail' | null; note: string }
  | { kind: 'checklist'; items: [string, boolean][] };

const YES_NO_NA: Record<YesNoNa, string> = { yes: 'Yes', no: 'No', 'n/a': 'N/A' };

export function answerDisplay(field: FieldDef, value: unknown): AnswerDisplay {
  if (value === null || value === undefined || value === '') return { kind: 'empty' };
  switch (field.type) {
    case 'pass_fail_note': {
      const pfn = value as Partial<PassFailNote>;
      if (!pfn.result && !pfn.note) return { kind: 'empty' };
      return { kind: 'pass_fail', result: pfn.result ?? null, note: pfn.note ?? '' };
    }
    case 'checklist': {
      const checks = value as Record<string, boolean>;
      // Template order first, then anything else that was ticked
      const keys = [...(field.items ?? []), ...Object.keys(checks).filter(k => !field.items?.includes(k))];
      return { kind: 'checklist', items: keys.map(k => [k, !!checks[k]]) };
    }
    case 'yes_no_na':
      return { kind: 'text', text: YES_NO_NA[value as YesNoNa] ?? String(value) };
    default:
      if (typeof value === 'boolean') return { kind: 'text', text: value ? 'Yes' : 'No' };
      if (typeof value === 'object') return { kind: 'text', text: JSON.stringify(value) };
      return { kind: 'text', text: String(value) };
  }
}

function PDFFieldRow({ field, value }: { field: FieldDef; value: unknown }) {
  const d = answerDisplay(field, value);
  return (
    <View style={pdfStyles.fieldRow} wrap={false}>
      <Text style={pdfStyles.fieldLabel}>{field.label}</Text>
      {d.kind === 'empty' && (
        <Text style={[pdfStyles.fieldValue, { color: colors.textGray, fontStyle: 'italic' }]}>—</Text>
      )}
      {d.kind === 'text' && <Text style={pdfStyles.fieldValue}>{d.text}</Text>}
      {d.kind === 'pass_fail' && (
        <View style={[pdfStyles.fieldValue, { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }]}>
          {d.result && (
            <Text style={d.result === 'pass' ? pdfStyles.passText : pdfStyles.failText}>
              {d.result.toUpperCase()}
            </Text>
          )}
          {d.note && <Text style={{ color: colors.textDark }}>{d.result ? ' — ' : ''}{d.note}</Text>}
        </View>
      )}
      {d.kind === 'checklist' && (
        <View style={pdfStyles.fieldValue}>
          {/* Helvetica has no ballot-box glyphs */}
          {d.items.map(([item, checked]) => (
            <Text key={item}>[{checked ? 'x' : ' '}] {item}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

const printable = (section: SectionDef) => section.fields.filter(f => f.type !== 'photo' && f.type !== 'signature');

interface SectionProps { section: SectionDef; answers: Record<string, unknown>; }
export function PDFSection({ section, answers }: SectionProps) {
  const fields = printable(section);
  if (fields.length === 0) return null;

  // Repeatable section: render each instance as a sub-table
  if (section.repeatable) {
    const instances = (answers[section.id + '_instances'] ?? []) as Record<string, unknown>[];
    if (instances.length === 0) return null;
    return (
      <View>
        <View style={pdfStyles.sectionHeader}>
          <Text style={pdfStyles.sectionTitle}>{section.title}</Text>
        </View>
        <View style={pdfStyles.sectionBody}>
          {instances.map((instance, idx) => (
            <View key={idx}>
              {idx > 0 && <View style={{ height: 1, backgroundColor: colors.border }} />}
              <View style={{ padding: '2 8', backgroundColor: '#f9fafb' }}>
                <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: colors.textGray }}>
                  {section.repeat_label ?? 'Item'} {idx + 1}
                </Text>
              </View>
              {fields.map(field => <PDFFieldRow key={field.id} field={field} value={instance?.[field.id]} />)}
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={pdfStyles.sectionHeader}>
        <Text style={pdfStyles.sectionTitle}>{section.title}</Text>
      </View>
      <View style={pdfStyles.sectionBody}>
        {fields.map(field => <PDFFieldRow key={field.id} field={field} value={answers[field.id]} />)}
      </View>
    </View>
  );
}

// ─── Remedials table ───────────────────────────────────────────────────────────

interface RemedialsProps { remedials: Remedial[]; }
export function PDFRemedialTable({ remedials }: RemedialsProps) {
  if (remedials.length === 0) return null;
  return (
    <View>
      <View style={pdfStyles.sectionHeader}>
        <Text style={pdfStyles.sectionTitle}>Remedials / Recommendations</Text>
      </View>
      <View style={pdfStyles.remedialTable}>
        <View style={pdfStyles.remedialHeader}>
          <Text style={[pdfStyles.remedialHeaderCell, { flex: 3 }]}>Description</Text>
          <Text style={[pdfStyles.remedialHeaderCell, { flex: 1 }]}>Priority</Text>
          <Text style={[pdfStyles.remedialHeaderCell, { flex: 1 }]}>Status</Text>
        </View>
        {remedials.map(r => (
          <View key={r.id} style={pdfStyles.remedialRow}>
            <Text style={pdfStyles.remedialDesc}>{r.description}</Text>
            <Text style={[pdfStyles.remedialPriority, { color: r.priority === 'urgent' ? colors.failRed : r.priority === 'recommended' ? '#ea580c' : '#ca8a04' }]}>
              {r.priority.toUpperCase()}
            </Text>
            <Text style={pdfStyles.remedialStatus}>{r.status.toUpperCase()}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Photos ────────────────────────────────────────────────────────────────────

/** `images` maps storage paths to data URIs (see loadReportData). */
interface PhotosProps { photos: Photo[]; images: Record<string, string>; }
export function PDFPhotosSection({ photos, images }: PhotosProps) {
  if (photos.length === 0) return null;
  return (
    <View>
      <View style={pdfStyles.sectionHeader}>
        <Text style={pdfStyles.sectionTitle}>Photos</Text>
      </View>
      <View style={[pdfStyles.sectionBody, { padding: 8 }]}>
        <View style={pdfStyles.photoGrid}>
          {photos.map(photo => (
            <View key={photo.id} style={pdfStyles.photoItem} wrap={false}>
              {images[photo.storage_path] ? (
                <Image style={pdfStyles.photoImage} src={images[photo.storage_path]} />
              ) : (
                <View style={[pdfStyles.photoImage, pdfStyles.signaturePlaceholder]}>
                  <Text style={{ fontSize: 7, color: colors.textGray }}>Photo unavailable</Text>
                </View>
              )}
              {photo.caption && <Text style={pdfStyles.photoCaption}>{photo.caption}</Text>}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Sign-off boxes ────────────────────────────────────────────────────────────

export type SignatureState = 'signed' | 'unavailable' | 'unsigned';

export function signatureState(path: string | null, images: Record<string, string>): SignatureState {
  if (!path) return 'unsigned';
  return images[path] ? 'signed' : 'unavailable';
}

function SignatureImage({ path, images }: { path: string | null; images: Record<string, string> }) {
  const state = signatureState(path, images);
  if (state === 'signed') return <Image style={pdfStyles.signatureImage} src={images[path!]} />;
  return (
    <View style={pdfStyles.signaturePlaceholder}>
      <Text style={{ fontSize: 7, color: colors.textGray }}>
        {state === 'unsigned' ? 'Not signed' : 'Signature on file (image unavailable)'}
      </Text>
    </View>
  );
}

interface SignaturesProps {
  engineerSignaturePath: string | null;
  customerSignaturePath: string | null;
  images: Record<string, string>;
  engineerName: string;
  customerName: string | null;
  companyName: string;
  submittedAt: string | null;
}
export function PDFSignatureBoxes({
  engineerSignaturePath,
  customerSignaturePath,
  images,
  engineerName,
  customerName,
  companyName,
  submittedAt,
}: SignaturesProps) {
  return (
    <View style={pdfStyles.signatureSection} wrap={false}>
      <View style={pdfStyles.signatureBox}>
        <Text style={pdfStyles.signatureLabel}>Engineer ({companyName})</Text>
        <SignatureImage path={engineerSignaturePath} images={images} />
        <Text style={{ fontSize: 7, color: colors.textGray, marginTop: 4 }}>{engineerName}</Text>
        {submittedAt && (
          <Text style={{ fontSize: 7, color: colors.textGray }}>{formatUKDateTime(submittedAt)}</Text>
        )}
      </View>
      <View style={pdfStyles.signatureBox}>
        <Text style={pdfStyles.signatureLabel}>Responsible Person (Premises Management)</Text>
        <SignatureImage path={customerSignaturePath} images={images} />
        {customerName && (
          <Text style={{ fontSize: 7, color: colors.textGray, marginTop: 4 }}>{customerName}</Text>
        )}
      </View>
    </View>
  );
}
