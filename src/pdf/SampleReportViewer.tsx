/**
 * Lazy-loaded sample report viewer — only imported via dynamic import.
 * Uses @react-pdf/renderer (large bundle) and BlobProvider to stream
 * the PDF into an iframe for inline preview.
 */
import { BlobProvider } from '@react-pdf/renderer';
import { JobsheetPDF } from './JobsheetPDF';
import type { Company, Job, Site, Customer, Profile, Jobsheet, Remedial, TemplateId } from '../types';
import type { TemplateDef } from '../templates/types';
import correctiveMaintenance from '../templates/corrective_maintenance.json';
import fireAlarmInspection from '../templates/fire_alarm_inspection.json';
import cctvHandover from '../templates/cctv_handover.json';

// ─── Static template imports (already inside a lazily-loaded chunk) ───────────
const TEMPLATES: Record<string, TemplateDef> = {
  corrective_maintenance: correctiveMaintenance as TemplateDef,
  fire_alarm_inspection:  fireAlarmInspection as TemplateDef,
  cctv_handover:         cctvHandover as TemplateDef,
};

// ─── Shared demo company ──────────────────────────────────────────────────────

const COMPANY: Company = {
  id:                   'demo',
  name:                 'EMTEC Fire Systems',
  logo_url:             null,
  address:              'Ellismuir Way, Tannochside Business Park, Uddingston, G71 5PW',
  accreditation_number: 'BAFE SP203',
  created_at:           '2024-01-01T00:00:00Z',
};

const SITE: Site = {
  id:            'demo-site',
  company_id:    'demo',
  customer_id:   'demo-customer',
  address:       '24 Wester Shawfair, Danderhall, Dalkeith, EH22 1FD',
  contact_name:  'Simon Parsins',
  contact_phone: '0131 561 0200',
  access_notes:  null,
  arc_name:      null,
  arc_account:   null,
  police_urn:    null,
  hazards:       null,
  keyholders:    [],
  created_at:    '2024-01-01T00:00:00Z',
};

const CUSTOMER: Customer = {
  id:              'demo-customer',
  company_id:      'demo',
  name:            'Qualifications Scotland',
  contact_name:    'Simon Parsins',
  contact_email:   'simon.parsins@qualificationsscotland.gov.scot',
  contact_phone:   '0131 561 0200',
  billing_address: null,
  notes:           null,
  created_at:      '2024-01-01T00:00:00Z',
  updated_at:      '2024-01-01T00:00:00Z',
};

const ENGINEER: Profile = {
  id:         'demo-engineer',
  user_id:    'demo-user',
  company_id: 'demo',
  role:       'engineer',
  full_name:  'Callum Reid',
  email:      'callum.reid@emtec.co.uk',
  created_at: '2024-01-01T00:00:00Z',
};

// ─── Per-template demo data ───────────────────────────────────────────────────

type DemoData = {
  job: Job;
  jobsheet: Jobsheet;
  remedials: Remedial[];
};

function makeJob(templateId: TemplateId, type: Job['type']): Job {
  return {
    id:                   `demo-job-${templateId}`,
    company_id:           'demo',
    site_id:              'demo-site',
    system_id:            null,
    type,
    template_id:          templateId,
    assigned_engineer_id: 'demo-engineer',
    scheduled_date:       '2026-10-17',
    scheduled_time:       '09:00',
    status:               'completed',
    notes:                null,
    travelling_at:        null,
    on_site_at:           '2026-10-17T09:00:00Z',
    completed_at:         '2026-10-17T10:30:00Z',
    created_at:           '2026-10-17T08:00:00Z',
  };
}

function makeJobsheet(templateId: TemplateId, answers: Record<string, unknown>): Jobsheet {
  return {
    id:                      `demo-js-${templateId}`,
    job_id:                  `demo-job-${templateId}`,
    company_id:              'demo',
    template_id:             templateId,
    answers:                 answers as Jobsheet['answers'],
    time_on_site:            '09:00',
    time_off_site:           '10:30',
    engineer_signature_url:  null,
    customer_signature_url:  null,
    submitted_at:            '2026-10-17T10:30:00Z',
    pdf_url:                 null,
    created_at:              '2026-10-17T09:00:00Z',
    updated_at:              '2026-10-17T10:30:00Z',
  };
}

// ── Corrective Maintenance (Daywork) ─────────────────────────────────────────

const CORRECTIVE: DemoData = {
  job: makeJob('corrective_maintenance', 'reactive_callout'),
  jobsheet: makeJobsheet('corrective_maintenance', {
    date:                   '17/10/2026',
    call_no:                'FS1182/11',
    client_no:              'QS-001',
    job_type_radio:         'Call out',
    reported_fault:         'Fire alarm panel showing zone 3 fault. Zone 3 covers the main hall area. Panel displaying "Fault — Detector Open Circuit — Zone 3, Address 7".',
    device_no:              'DET-3-07',
    device_location:        'Main Hall — Ceiling, Zone 3',
    device_type:            'Optical Smoke Detector',
    signalling_type:        'Digital Com',
    cause:                  'Company related',
    action_taken:           'Attended site and isolated zone 3. Carried out full investigation — found detector DET-3-07 with contaminated detector head (dust ingress from recent partition works). Cleaned detector using compressed air and sensor cleaning agent. Carried out full zone walk test; all 9 detectors responding correctly. Reset panel, confirmed no further faults. System left fully operational.',
    equipment_removed_instances: [],
    materials_used_instances: [
      { material_description: 'Detector cleaning spray (aerosol)', material_qty: 1 },
      { material_description: 'Compressed air canister',           material_qty: 1 },
    ],
    further_action_required: 'Recommend customer installs temporary dust caps / guards on smoke detectors during any future building or partition works in Zone 3.',
    travel_time:             '0.5',
    time_on_site:            '1.5',
    system_operational:      'yes',
    engineer_name:           'Callum Reid',
    customer_name:           'Simon Parsins',
    sign_date:               '17/10/2026',
  }),
  remedials: [
    {
      id:           'demo-rem-001',
      jobsheet_id:  'demo-js-corrective_maintenance',
      site_id:      'demo-site',
      company_id:   'demo',
      description:  'Install temporary dust guards on Zone 3 smoke detectors during building works to prevent repeat contamination.',
      priority:     'recommended',
      status:       'open',
      created_at:   '2026-10-17T10:30:00Z',
      updated_at:   '2026-10-17T10:30:00Z',
    },
  ],
};

// ── Fire Alarm Inspection ────────────────────────────────────────────────────

const INSPECTION: DemoData = {
  job: makeJob('fire_alarm_inspection', 'ppm_service'),
  jobsheet: makeJobsheet('fire_alarm_inspection', {
    panel_make_model:          'Notifier ID3000 — Addressable',
    sp203_cert_no:             'SP203-2024-0891',
    lps1014_cert_no:           '',
    category:                  'L2',
    loops_circuits:            2,
    zones:                     12,
    qty_smoke_detectors:       47,
    qty_heat_detectors:        8,
    qty_sounders:              14,
    qty_call_points:           9,
    aspirating_system:         'n/a',
    inspection_number:         '2',
    inspection_total:          '4',
    inspection_type:           'Periodic (Section A)',
    extent_of_system:          'Ground floor and first floor, zones 1–6 tested this visit.',
    devices_tested_this_visit: 'Zones 1–6: optical smoke detectors, heat detectors, break-glass call points and sounders. All devices recorded in site log book.',
    all_faults_attended:       'yes',
    false_alarms_12m:          1,
    false_alarm_rate:          '2.1',
    as_installed_drawings:     'yes',
    zone_chart_displayed:      'yes',
    battery_capacity_ah:       7.2,
    charging_voltage:          '27.4V',
    battery_installation_date: 'Jan 2024',
    log_book_updated:          'yes',
    section_a_fire_tests_instances: [
      { device_ref: 'SD-01-01', device_type: 'smoke detector', circuit: 'Zone 1', result: { result: 'pass', note: '' } },
      { device_ref: 'SD-01-07', device_type: 'smoke detector', circuit: 'Zone 1', result: { result: 'pass', note: '' } },
      { device_ref: 'CP-02-01', device_type: 'call point',     circuit: 'Zone 2', result: { result: 'pass', note: '' } },
      { device_ref: 'HD-03-02', device_type: 'heat detector',  circuit: 'Zone 3', result: { result: 'fail', note: 'No response — requires replacement' } },
      { device_ref: 'SND-04-1', device_type: 'sounder',        circuit: 'Zone 4', result: { result: 'pass', note: '' } },
    ],
    open_circuit_detector:   { result: 'pass', note: '' },
    short_circuit_detector:  { result: 'pass', note: '' },
    open_circuit_sounder:    { result: 'pass', note: '' },
    remote_signalling:       'yes',
    building_changes:        'no',
    use_changes:             'no',
    detector_spacing:        'yes',
    mcp_unobstructed:        'yes',
    storage_300mm:           'yes',
    system_design_compliant: 'yes',
    variations_defects:      'Heat detector HD-03-02 (Zone 3 — Kitchen) failed to respond to test. Requires replacement — see remedial raised. All other devices passed satisfactorily.',
    next_inspection_due:     'April 2027',
    sounder_testing_allowed:         'yes',
    cause_effect_testing_allowed:    'n/a',
    engineer_name:  'Callum Reid',
    customer_name:  'Simon Parsins',
    sign_date:      '17/10/2026',
  }),
  remedials: [
    {
      id:           'demo-rem-002',
      jobsheet_id:  'demo-js-fire_alarm_inspection',
      site_id:      'demo-site',
      company_id:   'demo',
      description:  'Replace heat detector HD-03-02 in Zone 3 (Kitchen) — failed response test.',
      priority:     'urgent',
      status:       'open',
      created_at:   '2026-10-17T10:30:00Z',
      updated_at:   '2026-10-17T10:30:00Z',
    },
  ],
};

// ── CCTV Handover ─────────────────────────────────────────────────────────────

const CCTV: DemoData = {
  job: makeJob('cctv_handover', 'install'),
  jobsheet: makeJobsheet('cctv_handover', {
    site_name:              'Qualifications Scotland - Lowden',
    contract_no:            'FS1182/10',
    date:                   '30/09/2026',
    commissioning_engineer: 'Callum Reid',
    dec_01: 'yes', dec_02: 'yes', dec_03: 'yes', dec_04: 'yes', dec_05: 'yes',
    dec_06: 'yes', dec_07: 'n/a', dec_08: 'n/a', dec_09: 'n/a', dec_10: 'n/a',
    dec_11: 'yes', dec_12: 'yes', dec_13: 'yes', dec_14: 'n/a', dec_15: 'yes',
    dec_16: 'n/a', dec_17: 'n/a', dec_18: 'n/a', dec_19: 'n/a', dec_20: 'n/a',
    dec_21: 'n/a', dec_22: 'n/a', dec_23: 'yes', dec_24: 'yes', dec_25: 'yes',
    dec_26: 'n/a', dec_27: 'n/a', dec_28: 'yes', dec_29: 'yes', dec_30: 'yes',
    dec_31: 'n/a', dec_32: 'yes', dec_33: 'yes', dec_34: 'yes', dec_35: 'yes',
    dec_36: 'yes', dec_37: 'yes', dec_38: 'yes', dec_39: 'yes',
    incomplete_details:           'None — installation complete.',
    incomplete_reasons:           'N/A',
    subsequent_visit_required:    'no',
    engineer_name:  'Callum Reid',
    customer_name:  'Simon Parsins',
    sign_date:      '30/09/2026',
  }),
  remedials: [],
};

// ─── Viewer component ─────────────────────────────────────────────────────────

export type SampleTemplateId = 'corrective_maintenance' | 'fire_alarm_inspection' | 'cctv_handover';

const DEMO_MAP: Record<SampleTemplateId, DemoData> = {
  corrective_maintenance: CORRECTIVE,
  fire_alarm_inspection:  INSPECTION,
  cctv_handover:          CCTV,
};

interface Props {
  templateId: SampleTemplateId;
}

export function SampleReportViewer({ templateId }: Props) {
  const { job, jobsheet, remedials } = DEMO_MAP[templateId];
  const template = TEMPLATES[templateId];
  const filename = `${template.name.replace(/\s+/g, '_')}_Sample.pdf`;

  const doc = (
    <JobsheetPDF
      jobsheet={jobsheet}
      job={job}
      site={SITE}
      customer={CUSTOMER}
      company={COMPANY}
      engineerProfile={ENGINEER}
      photos={[]}
      remedials={remedials}
      template={template}
    />
  );

  return (
    <BlobProvider document={doc}>
      {({ url, loading, error }) => {
        if (loading) {
          return (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
              <div className="animate-spin w-8 h-8 border-4 border-[#0D3349] border-t-transparent rounded-full" />
              <p className="text-sm">Generating PDF…</p>
            </div>
          );
        }
        if (error || !url) {
          return (
            <div className="flex items-center justify-center h-full text-sm text-red-500 px-6 text-center">
              Could not generate PDF preview. Try "Open in tab" instead.
            </div>
          );
        }
        return (
          <div className="flex flex-col h-full">
            {/* Action buttons */}
            <div className="flex gap-2 px-4 py-2 bg-slate-50 border-b shrink-0">
              <a
                href={url}
                download={filename}
                className="flex-1 text-center py-2.5 bg-[#0D3349] text-white text-sm font-semibold rounded-lg"
              >
                Download PDF
              </a>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg"
              >
                Open in tab
              </a>
            </div>
            {/* Inline PDF preview */}
            <iframe
              src={url}
              title="Sample EMTEC Report"
              className="flex-1 w-full"
              style={{ border: 'none', minHeight: '600px' }}
            />
          </div>
        );
      }}
    </BlobProvider>
  );
}
