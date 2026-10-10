/**
 * Split UTM leads by profession.
 *
 * Reads every tab of the UTM lead spreadsheet, keeps only
 *   Name | Email | Phone Number | Profession | UTM Source
 * and writes them into a separate output spreadsheet:
 *   - "Business Profession", "Job Professional Profession", "Other Profession"
 *     group tabs (see PROFESSION_MAP), and
 *   - one tab per profession answer ("Business Owner", "Agency Owner",
 *     "Job Professional", "Student"...), when TAB_PER_PROFESSION is true.
 *
 * Columns are found by header name (first_name, email, phone, profession,
 * utm_source). Tabs without a utm_source column get the UTM source from the
 * ?utm_source= part of source_url.
 *
 * Every run rebuilds the output tabs from scratch, so they always match the
 * source. Each person appears once (matched by email, or phone when there
 * is no email); their first registration wins. Don't edit the output tabs
 * by hand: the next run overwrites them.
 *
 * One-time setup: run installProfessionSplitTrigger() once from the editor
 * and approve the permissions prompt. After that it runs every 10 minutes.
 * The Execution log shows the output spreadsheet link on every run.
 */

// The UTM lead spreadsheet (source). Leave blank if this script is bound
// to it (opened via Extensions > Apps Script in that spreadsheet).
const SOURCE_SPREADSHEET_ID = '1M-1GJ_W6xyTehUH_o_uikYy49rp-SP_WUsxmBNNR_Wo'; // August 2026 UTM

// The new spreadsheet the sorted leads go into. Leave blank and the first
// run creates one called "UTM Leads by Profession"; its link is written to
// the Execution log and kept for later runs.
const OUTPUT_SPREADSHEET_ID = '13CDaSxsHrCfDjaLfZCq9tVZGCLKzj0Z0gwHoIaV54xg'; // Data Profession

// Source tabs to skip (exact names). Empty means read every tab.
const SKIP_SOURCE_TABS = [];

const BUSINESS_TAB = 'Business Profession';
const JOB_TAB = 'Job Professional Profession';
const OTHER_TAB = 'Other Profession';

// Also give every profession answer its own tab ("Business Owner",
// "Agency Owner", "Job Professional", "Student"...). Leads with no answer
// go to NO_PROFESSION_TAB.
const TAB_PER_PROFESSION = true;
const NO_PROFESSION_TAB = 'Not Specified';

const OUTPUT_HEADERS = ['Name', 'Email', 'Phone Number', 'Profession', 'UTM Source'];

// Header names accepted for each field (lower case, spaces/_/- ignored).
const HEADER_ALIASES = {
  name: ['name', 'fullname', 'firstname', 'fname', 'yourname'],
  lastName: ['lastname', 'lname', 'surname'],
  email: ['email', 'emailaddress', 'emailid', 'mail'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'mobileno', 'phoneno',
          'contact', 'contactnumber', 'whatsapp', 'whatsappnumber'],
  profession: ['profession', 'occupation', 'designation', 'iama', 'youare', 'workprofile'],
  utmSource: ['utmsource'],
  sourceUrl: ['sourceurl', 'pageurl', 'url'],
};

// Leads with these email domains are internal tests and are skipped.
const SKIP_EMAIL_DOMAINS = ['flexifunnels.com'];

// Exact form answers (lower case) and the tab they go to. Anything not
// listed here falls back to the keyword lists below.
const PROFESSION_MAP = {
  'business owner': 'business',
  'local business owner': 'business',
  'agency owner': 'business',
  'e-commerce': 'business',
  'coach or trainer': 'business',
  'freelancer/service provider': 'business',
  'consultant': 'business',
  'job professional': 'job',
  'doctor': 'job',
  'student': 'other',
  'no job or business (fresher)': 'other',
  'other': 'other',
};

// Keywords for answers not in PROFESSION_MAP, matched against the
// profession text in lower case. Other is checked first (so "No job or
// business" is not Business), then Business (so "Self-employed" and
// "Business professional" are not Job), then Job.
const OTHER_KEYWORDS = ['no job', 'fresher', 'student', 'unemployed', 'homemaker', 'housewife', 'retired'];
const BUSINESS_KEYWORDS = [
  'business', 'owner', 'entrepreneur', 'founder', 'self employed', 'self-employed',
  'selfemployed', 'freelanc', 'agency', 'startup', 'start-up', 'shop', 'store',
  'trader', 'trading', 'merchant', 'coach', 'consultant', 'creator', 'influencer',
  'seller', 'ecommerce', 'e-commerce', 'proprietor', 'ceo', 'solopreneur',
];
const JOB_KEYWORDS = [
  'job', 'working professional', 'professional', 'employee', 'employed', 'salaried',
  'salary', 'service', 'corporate', 'private sector', 'government', 'govt',
  'manager', 'executive', 'engineer', 'developer', 'teacher', 'doctor', 'nurse',
  'analyst', 'officer', 'staff', 'worker', 'accountant', 'clerk',
];

function splitLeadsByProfession() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return;
  try {
    const source = SOURCE_SPREADSHEET_ID
      ? SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    if (!source) throw new Error('Set SOURCE_SPREADSHEET_ID: this script is not bound to a spreadsheet.');
    const output = openOutput_();

    // Collect every lead once (first registration wins), grouped two ways:
    // by group (Business / Job / Other) and by the exact profession answer.
    const seen = {};
    const groups = { business: [], job: [], other: [] };
    const byProfession = {}; // lower-case answer -> { name, rows }
    source.getSheets().forEach(function (sheet) {
      const tabName = sheet.getName();
      if (SKIP_SOURCE_TABS.indexOf(tabName) !== -1) return;
      if (sheet.getLastRow() < 2 || sheet.getLastColumn() === 0) return;

      const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getDisplayValues();
      const cols = findColumns_(values[0]);
      if (cols.email === -1 && cols.phone === -1) {
        console.log('Skipped tab "%s": no email or phone column', tabName);
        return;
      }
      if (isOutputHeader_(values[0])) return; // our own output tabs

      let added = 0;
      for (let r = 1; r < values.length; r++) {
        const row = values[r];
        const lead = [
          joinName_(cell_(row, cols.name), cell_(row, cols.lastName)),
          cell_(row, cols.email),
          cell_(row, cols.phone),
          cell_(row, cols.profession),
          cols.utmSource !== -1 ? cell_(row, cols.utmSource) : utmFromUrl_(cell_(row, cols.sourceUrl)),
        ];
        if (isSkippedEmail_(lead[1])) continue;
        const key = leadKey_(lead[1], lead[2]);
        if (!key || seen[key]) continue;
        seen[key] = true;
        added++;

        groups[classify_(lead[3])].push(lead);
        const answer = lead[3] || NO_PROFESSION_TAB;
        const pk = answer.toLowerCase();
        if (!byProfession[pk]) byProfession[pk] = { name: answer, rows: [] };
        byProfession[pk].rows.push(lead);
      }
      console.log('Tab "%s": %s rows, %s new leads', tabName, values.length - 1, added);
    });

    // Rewrite every output tab from scratch, so it always matches the source.
    const counts = [];
    writeTab_(output, BUSINESS_TAB, groups.business);
    writeTab_(output, JOB_TAB, groups.job);
    if (OTHER_TAB) writeTab_(output, OTHER_TAB, groups.other);
    counts.push(BUSINESS_TAB + '=' + groups.business.length, JOB_TAB + '=' + groups.job.length);
    if (OTHER_TAB) counts.push(OTHER_TAB + '=' + groups.other.length);

    if (TAB_PER_PROFESSION) {
      Object.keys(byProfession)
        .sort(function (a, b) { return byProfession[b].rows.length - byProfession[a].rows.length; })
        .forEach(function (pk) {
          const p = byProfession[pk];
          writeTab_(output, safeTabName_(p.name), p.rows);
          counts.push(p.name + '=' + p.rows.length);
        });
    }

    console.log('Output: %s', output.getUrl());
    console.log('Leads per tab: %s', counts.join(', '));
  } finally {
    lock.releaseLock();
  }
}

function classify_(profession) {
  const p = String(profession).toLowerCase().trim();
  if (!p) return 'other';
  if (PROFESSION_MAP[p]) return PROFESSION_MAP[p];
  if (OTHER_KEYWORDS.some(function (k) { return p.indexOf(k) !== -1; })) return 'other';
  if (BUSINESS_KEYWORDS.some(function (k) { return p.indexOf(k) !== -1; })) return 'business';
  if (JOB_KEYWORDS.some(function (k) { return p.indexOf(k) !== -1; })) return 'job';
  return 'other';
}

function findColumns_(headers) {
  const norm = headers.map(function (h) { return String(h).toLowerCase().replace(/[\s_\-:?.]/g, ''); });
  const cols = {};
  Object.keys(HEADER_ALIASES).forEach(function (field) {
    cols[field] = -1;
    const aliases = HEADER_ALIASES[field];
    // First alias in the list that is an exact header wins.
    for (let i = 0; i < aliases.length && cols[field] === -1; i++) {
      cols[field] = norm.indexOf(aliases[i]);
    }
  });
  return cols;
}

function utmFromUrl_(url) {
  const m = String(url).match(/[?&]utm_source=([^&#]*)/i);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
  } catch (e) {
    return m[1];
  }
}

function isSkippedEmail_(email) {
  const domain = String(email).toLowerCase().split('@')[1] || '';
  return SKIP_EMAIL_DOMAINS.indexOf(domain) !== -1;
}

function cell_(row, index) {
  return index === -1 ? '' : String(row[index]).trim();
}

function joinName_(first, last) {
  return last && first.toLowerCase().indexOf(last.toLowerCase()) === -1 ? first + ' ' + last : first;
}

function leadKey_(email, phone) {
  const e = String(email).toLowerCase().trim();
  if (e) return 'e:' + e;
  const p = String(phone).replace(/\D/g, '').slice(-10);
  return p ? 'p:' + p : '';
}

// Replaces everything under the header row of `name` with `rows`.
function writeTab_(spreadsheet, name, rows) {
  const tab = ensureTab_(spreadsheet, name);
  const last = tab.getLastRow();
  if (last > 1) tab.getRange(2, 1, last - 1, tab.getMaxColumns()).clearContent();
  if (!rows.length) return;
  const range = tab.getRange(2, 1, rows.length, OUTPUT_HEADERS.length);
  range.setNumberFormat('@'); // keep phone numbers like +91... as text
  range.setValues(rows);
}

function isOutputHeader_(headers) {
  return OUTPUT_HEADERS.every(function (h, i) { return String(headers[i]).trim() === h; });
}

// Sheet names can't contain some characters and are limited to 100.
function safeTabName_(name) {
  return String(name).replace(/[\[\]*?:\\]/g, ' ').trim().slice(0, 100) || NO_PROFESSION_TAB;
}

function ensureTab_(spreadsheet, name) {
  let tab = spreadsheet.getSheetByName(name);
  if (!tab) {
    tab = spreadsheet.insertSheet(name);
    tab.getRange(1, 1, 1, OUTPUT_HEADERS.length).setValues([OUTPUT_HEADERS]).setFontWeight('bold');
    tab.setFrozenRows(1);
  }
  return tab;
}

function openOutput_() {
  if (OUTPUT_SPREADSHEET_ID) return SpreadsheetApp.openById(OUTPUT_SPREADSHEET_ID);
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('OUTPUT_SPREADSHEET_ID');
  if (savedId) return SpreadsheetApp.openById(savedId);

  const created = SpreadsheetApp.create('UTM Leads by Profession');
  props.setProperty('OUTPUT_SPREADSHEET_ID', created.getId());
  ensureTab_(created, BUSINESS_TAB);
  created.deleteSheet(created.getSheetByName('Sheet1'));
  console.log('Created output spreadsheet: %s', created.getUrl());
  return created;
}

function installProfessionSplitTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'splitLeadsByProfession'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('splitLeadsByProfession').timeBased().everyMinutes(10).create();
  splitLeadsByProfession();
}
