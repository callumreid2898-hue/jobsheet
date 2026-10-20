import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { Company, Job, Site, Customer, Profile, Jobsheet, Photo, Remedial } from '../types';
import type { TemplateDef } from '../templates/types';
import {
  pdfStyles,
  PDFHeader,
  PDFJobInfoBar,
  PDFSection,
  PDFRemedialTable,
  PDFPhotosSection,
  PDFSignatureBoxes,
} from './PDFSections';
import { formatUKDate, formatUKTime } from '../lib/dates';

const footerStyles = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTop: '1px solid #e5e7eb',
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: '#6b7280' },
  disclaimer: {
    position: 'absolute',
    bottom: 10,
    left: 30,
    right: 30,
  },
  disclaimerText: {
    fontSize: 6.5,
    color: '#9ca3af',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export interface JobsheetPDFProps {
  jobsheet: Jobsheet;
  job: Job;
  site: Site;
  customer: Customer;
  company: Company;
  engineerProfile: Profile | null; // job.assigned_engineer_id
  photos: Photo[];
  remedials: Remedial[];
  template: TemplateDef;
  images: Record<string, string>;  // storage path -> data URI, for photos and signatures
}

export function JobsheetPDF({
  jobsheet,
  job,
  site,
  customer,
  company,
  engineerProfile,
  photos,
  remedials,
  template,
  images,
}: JobsheetPDFProps) {
  const jobRef = `JS-${job.id.slice(0, 8).toUpperCase()}`;
  // Arrival is when the engineer tapped "Arrived"; older jobsheets only have the form-open time
  const onSite = job.on_site_at ?? jobsheet.time_on_site;
  const offSite = jobsheet.time_off_site;
  const customerName = typeof jobsheet.answers['customer_name'] === 'string' ? jobsheet.answers['customer_name'] : null;

  return (
    <Document
      title={`${template.name} — ${jobRef}`}
      author={company.name}
      subject={template.name}
      creator={company.name}
    >
      <Page size="A4" style={pdfStyles.page}>
        {/* Header: company logo + name left, template title right */}
        <PDFHeader company={company} templateTitle={template.name.toUpperCase()} />

        {/* Blue info bar: site, customer, engineer, date, type, status */}
        <PDFJobInfoBar
          job={job}
          site={site}
          customer={customer}
          engineer={engineerProfile}
        />

        {/* Job reference + time on site */}
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 9, color: '#6b7280' }}>
            Ref: {jobRef}
          </Text>
          {(onSite || offSite) && (
            <Text style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>
              {onSite && `On site: ${formatUKDate(onSite)} ${formatUKTime(onSite)}`}
              {onSite && offSite && '   '}
              {offSite && `Off site: ${formatUKTime(offSite)}`}
            </Text>
          )}
        </View>

        {/* One PDFSection per template section */}
        {template.sections.map(section => (
          <PDFSection
            key={section.id}
            section={section}
            answers={jobsheet.answers}
          />
        ))}

        {/* Remedials table (only if any exist) */}
        <PDFRemedialTable remedials={remedials} />

        {/* Photos grid (only if any were uploaded) */}
        <PDFPhotosSection photos={photos} images={images} />

        {/* Dual signature boxes with EMTEC-style labels */}
        <PDFSignatureBoxes
          engineerSignaturePath={jobsheet.engineer_signature_url}
          customerSignaturePath={jobsheet.customer_signature_url}
          images={images}
          engineerName={engineerProfile?.full_name ?? '—'}
          customerName={customerName}
          companyName={company.name}
          submittedAt={jobsheet.submitted_at}
        />

        {/* Footer: ref + page count + submitted */}
        <View style={footerStyles.footer} fixed>
          <Text style={footerStyles.footerText}>
            {company.name} · {jobRef}
          </Text>
          <Text
            style={footerStyles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
          <Text style={footerStyles.footerText}>
            {jobsheet.submitted_at
              ? `Submitted ${formatUKDate(jobsheet.submitted_at)}`
              : 'Draft'}
          </Text>
        </View>

        {/* EMTEC-style disclaimer */}
        <View style={footerStyles.disclaimer} fixed>
          <Text style={footerStyles.disclaimerText}>
            THIS CERTIFICATE IS VALID ONLY IF ISSUED BY AN ENGINEER WORKING FOR AND UNDER THE MANAGEMENT OF {company.name.toUpperCase()}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
