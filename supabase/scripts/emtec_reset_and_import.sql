-- ============================================================
-- emtec_reset_and_import.sql — ONE-OFF, DESTRUCTIVE
-- Wipes one company's business data and loads Emtec's sites and job codes
-- (from EMTEC_Job_Codes.xlsx, 49 sites).
--
-- Kept: the company, its settings and price list, every login/profile and invite.
-- Deleted: customers, sites, systems, devices (+ tests), jobs, job lines,
--   jobsheets, photos rows, remedials, quotes, invoices, contracts and
--   visits, and the job history log. Files already in the photos/pdfs
--   storage buckets are NOT deleted (remove them in Storage if wanted).
--
-- Run in the Supabase dashboard SQL editor, AFTER migrations 00005–00016.
-- Set company_name below first. It all runs in one transaction: any error
-- and nothing is changed.
-- ============================================================

do $$
declare
  company_name constant text := 'Emtec Fire Systems';  -- ← your company's name in the app
  v_company uuid;
  n_customers int;
  n_sites int;
begin
  select id into v_company from companies where name = company_name;
  if v_company is null then
    raise exception 'No company named "%". Companies here: %',
      company_name, (select string_agg('"' || name || '"', ', ') from companies);
  end if;

  -- ── Wipe (children first) ────────────────────────────────────────────────
  delete from audit_log       where company_id = v_company;
  delete from invoice_lines   where company_id = v_company;
  delete from invoices        where company_id = v_company;
  delete from quote_lines     where company_id = v_company;
  delete from quotes          where company_id = v_company;
  delete from job_lines       where company_id = v_company;
  delete from device_tests    where company_id = v_company;
  delete from devices         where company_id = v_company;
  delete from contract_visits where company_id = v_company;
  delete from contracts       where company_id = v_company;
  delete from photos          where company_id = v_company;
  delete from remedials       where company_id = v_company;
  delete from jobsheets       where company_id = v_company;
  delete from jobs            where company_id = v_company;
  delete from systems         where company_id = v_company;
  delete from sites           where company_id = v_company;
  delete from customers       where company_id = v_company;

  -- ── Import ───────────────────────────────────────────────────────────────
  create temp table emtec_import (customer text, name text, address text, codes text[]) on commit drop;
  insert into emtec_import (customer, name, address, codes) values
    ('250 St Vincent St (250 SVS)', '250 St Vincent St (250 SVS)', '250 St Vincent Street, Glasgow', array['FS5104']::text[]),
    ('Aimbridge', 'Aimbridge', '', array['FS999/473']::text[]),
    ('Aitkenhead PS', 'Aitkenhead PS', 'Lincoln Avenue, Uddingston, G71 5QZ', array['FS5101']::text[]),
    ('AK Stoddart', 'AK Stoddart Ayr', 'Ayr', array['FS1167']::text[]),
    ('AK Stoddart', 'AK Stoddart Broxburn', 'Broxburn', array['FS1158', 'FS1158/63']::text[]),
    ('Brewhemia', 'Brewhemia', '1A Market Street, Edinburgh, EH1 1DE', array['FS1132/41', 'FS1132/42']::text[]),
    ('Brown Street', 'Brown Street', '', array['FS5088']::text[]),
    ('Clydebank High School', 'Clydebank High School', 'Janetta Street, Clydebank, G81 3EJ', array['FS1175']::text[]),
    ('CRM Murieston', 'CRM Murieston', 'Murieston, Livingston', array['FS1178', 'FS1178/4', 'FS1178/5', 'FS1178/6', 'FS1178/8', 'FS1178/9']::text[]),
    ('Curia', 'Curia', '', array['FS1149', 'FS1149/58', 'FS5110']::text[]),
    ('DPD Edinburgh', 'DPD Edinburgh', '', array['FS999/515']::text[]),
    ('Emtec Dundee', 'Emtec Dundee', 'Off Kingsway, Dundee', array['FS1164']::text[]),
    ('Emtec HO', 'Emtec HO', 'Ellismuir Way, Tannochside Business Park, Uddingston, G71 5PW', array['FS1001']::text[]),
    ('Energen Biogas Cumbernauld', 'Energen Biogas Cumbernauld', 'Dunns Wood Road, Wardpark South Ind. Est., Cumbernauld, G67 3EN', array['FS999/503', 'FS1190', 'FS1190/1', 'FS1190/3', 'FS1190/5']::text[]),
    ('Guala', 'Guala', 'Gartcosh', array['FS1185', 'FS1185/5', 'FS1185/6', 'FS1185/9', 'FS1185/TBC']::text[]),
    ('Interfaces – Clydebank / St Peters / Vale of Leven', 'Interfaces – Clydebank / St Peters / Vale of Leven', '', array['FS5100']::text[]),
    ('Irish Consulate', 'Irish Consulate', '16 Randolph Crescent, Edinburgh, EH3 7TT', array['FS1142/21']::text[]),
    ('La Belle Forme', 'La Belle Forme', '', array['FS1138']::text[]),
    ('Lindsay House', 'Lindsay House', '', array['FS999/514', 'FS5109']::text[]),
    ('Little Barras', 'Little Barras', '', array['FS1164']::text[]),
    ('Lookers Darnley', 'Lookers Darnley', 'Glasgow Audi, Darnley, Glasgow', array['FS999/522-1']::text[]),
    ('M&S Aberdeen', 'M&S Aberdeen', 'Aberdeen', array['FS999/516']::text[]),
    ('Mansfield CH', 'Mansfield CH', '', array['FS5107']::text[]),
    ('Merchant House Bridal Shop', 'Merchant House Bridal Shop', '', array['FS999/518']::text[]),
    ('Mercury House', 'Mercury House', '', array['FS5103']::text[]),
    ('Milngavie Manor', 'Milngavie Manor', 'Craigton Road, Milngavie, G62 7JG', array['FS1005']::text[]),
    ('Newcastle', 'Newcastle', 'Newcastle', array['FS5108']::text[]),
    ('Newton House', 'Newton House', '', array['FS1042', 'FS1042/185', 'FS1042/186', 'FS1042/190']::text[]),
    ('Riverside', 'Riverside', '', array['FS1037', 'FS1037/57', 'FS1037/58', 'FS1037/59']::text[]),
    ('Sabio', 'Sabio', '', array['FS1168']::text[]),
    ('SAICA', 'SAICA Croy', 'Croy', array['FS1139/26']::text[]),
    ('SAICA', 'SAICA Dundee', 'Dundee', array['FS1136/8']::text[]),
    ('SAICA', 'SAICA Natur Glasgow', 'Glasgow', array['FS1139']::text[]),
    ('Scallywags', 'Scallywags', '', array['FS999/519']::text[]),
    ('SQA', 'SQA Lowden', 'Lowden, 24 Wester Shawfair, Dalkeith, EH22 1FD', array['FS1182', 'FS1182/6', 'FS1182/10']::text[]),
    ('SQA', 'SQA Newtongrange', '', array['FS1184', 'FS1184/3']::text[]),
    ('SQA', 'SQA Optima', 'The Optima Building, 58 Robertson Street, Glasgow, G2 8DQ', array['FS1183']::text[]),
    ('St Andrews Square', 'St Andrews Square', 'St Andrew Square, Edinburgh', array['FS5105']::text[]),
    ('St Eunans PS', 'St Eunans PS', 'Gilmour Street, Clydebank, G81 2BW', array['FS1180', 'FS1180/5', 'FS1180/7']::text[]),
    ('St Kilda''s', 'St Kilda''s', '', array['FS1191']::text[]),
    ('St Peter the Apostle', 'St Peter the Apostle', 'Kirkoswald Drive, Clydebank, G81 2DB', array['FS1179', 'FS1179/13', 'FS1179/14', 'FS1179/19']::text[]),
    ('Strathberry', 'Strathberry – 3 Multrees Walk', '3 Multrees Walk, Edinburgh', array['FS1188', 'FS1188/1', 'FS1188/2']::text[]),
    ('Strathberry', 'Strathberry – India Buildings', 'India Buildings, Victoria Street, Edinburgh', array['FS1186']::text[]),
    ('Strathberry', 'Strathberry – Melville Street', '34 & 43 Melville Street, Edinburgh', array['FS1189', 'FS1189/3']::text[]),
    ('Subcoal', 'Subcoal', '', array['FS999/517']::text[]),
    ('Turkish Consulate', 'Turkish Consulate', '39 Drumsheugh Gardens, Edinburgh, EH3 7SW', array['FS1043']::text[]),
    ('Vale of Leven Academy', 'Vale of Leven Academy', 'Main Street, Alexandria, G83 0BH', array['FS1176', 'FS1176/15', 'FS1176/TBC']::text[]),
    ('Westerwood', 'Westerwood', '1 St Andrews Drive, Cumbernauld, G68 0EW', array['FS1010', 'FS1010/112', 'FS1010/116', 'FS1010/118']::text[]),
    ('Whitekirks', 'Whitekirks', '', array['FS1050', 'FS1050/130']::text[]);

  insert into customers (company_id, name)
  select distinct v_company, customer from emtec_import;
  get diagnostics n_customers = row_count;

  insert into sites (company_id, customer_id, name, address, job_codes)
  select v_company, c.id, i.name, i.address, i.codes
  from emtec_import i
  join customers c on c.company_id = v_company and c.name = i.customer;
  get diagnostics n_sites = row_count;

  raise notice 'Imported % customers and % sites for "%"', n_customers, n_sites, company_name;
end $$;
