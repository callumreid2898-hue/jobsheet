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
  engineerProfile: Profile;
  photos: Photo[];
  remedials: Remedial[];
  template: TemplateDef;
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
}: JobsheetPDFProps) {
  const jobRef = `JS-${job.id.slice(0, 8).toUpperCase()}`;

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
          {(jobsheet.time_on_site || jobsheet.time_off_site) && (
            <Text style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>
              {jobsheet.time_on_site && `On site: ${jobsheet.time_on_site}`}
              {jobsheet.time_on_site && jobsheet.time_off_site && '  '}
              {jobsheet.time_off_site && `Off site: ${jobsheet.time_off_site}`}
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

        {/* Photos grid (only if any have a storage path) */}
        <PDFPhotosSection photos={photos} />

        {/* Dual signature boxes with EMTEC-style labels */}
        <PDFSignatureBoxes
          engineerSignatureUrl={jobsheet.engineer_signature_url}
          customerSignatureUrl={jobsheet.customer_signature_url}
          engineerName={engineerProfile.full_name}
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
              ? `Submitted ${new Date(jobsheet.submitted_at).toLocaleDateString('en-GB')}`
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
