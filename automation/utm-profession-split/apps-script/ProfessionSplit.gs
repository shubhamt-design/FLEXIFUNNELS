/**
 * Split UTM leads by profession.
 *
 * Reads every tab of the UTM lead spreadsheet (the one the registration
 * webhook writes into, with many columns per tab), keeps only
 *   Name | Email | Phone Number | Profession | UTM Source
 * and copies each new lead into a separate output spreadsheet, on the tab
 * that matches their profession:
 *   "Business Profession"          business owners, founders, freelancers...
 *   "Job Professional Profession"  salaried / working professionals
 *   "Other Profession"             anything that matches neither list
 *                                  (students, homemakers, blanks). Set
 *                                  OTHER_TAB to '' to skip these leads.
 *
 * Columns are found by their header text, not by position, so it works on
 * every UTM tab even if their column order differs.
 *
 * It only appends: a lead already in the output (same email, or same phone
 * when there is no email) is not copied again, and rows you edit or
 * re-colour in the output are left alone.
 *
 * One-time setup: fill in the two ids below, then run installTrigger() once
 * from the editor and approve the permissions prompt. After that it runs
 * every 10 minutes on its own. Run splitLeadsByProfession() by hand any
 * time to update immediately.
 */

// The UTM lead spreadsheet (source). Leave blank if this script is bound
// to it (opened via Extensions > Apps Script in that spreadsheet).
const SOURCE_SPREADSHEET_ID = '';

// The new spreadsheet the sorted leads go into. Leave blank and the first
// run creates one called "UTM Leads by Profession"; its link is written to
// the Execution log and kept for later runs.
const OUTPUT_SPREADSHEET_ID = '';

// Source tabs to skip (exact names). Empty means read every tab.
const SKIP_SOURCE_TABS = [];

const BUSINESS_TAB = 'Business Profession';
const JOB_TAB = 'Job Professional Profession';
const OTHER_TAB = 'Other Profession';

const OUTPUT_HEADERS = ['Name', 'Email', 'Phone Number', 'Profession', 'UTM Source'];

// Header names accepted for each field (lower case, spaces/_/- ignored).
const HEADER_ALIASES = {
  name: ['name', 'fullname', 'firstname', 'fname', 'yourname'],
  lastName: ['lastname', 'lname', 'surname'],
  email: ['email', 'emailaddress', 'emailid', 'mail'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'mobileno', 'phoneno',
          'contact', 'contactnumber', 'whatsapp', 'whatsappnumber'],
  profession: ['profession', 'occupation', 'designation', 'iama', 'youare', 'workprofile'],
  utmSource: ['utmsource', 'source'],
};

// Keywords that decide the tab, matched against the profession text in
// lower case. Business is checked first, so "Self-employed" and
// "Business professional" land in Business, not Job.
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

    const tabs = {
      business: ensureTab_(output, BUSINESS_TAB),
      job: ensureTab_(output, JOB_TAB),
      other: OTHER_TAB ? ensureTab_(output, OTHER_TAB) : null,
    };

    const seen = {};
    Object.keys(tabs).forEach(function (k) {
      if (tabs[k]) existingKeys_(tabs[k]).forEach(function (key) { seen[key] = true; });
    });

    const pending = { business: [], job: [], other: [] };
    source.getSheets().forEach(function (sheet) {
      if (SKIP_SOURCE_TABS.indexOf(sheet.getName()) !== -1) return;
      if (sheet.getLastRow() < 2 || sheet.getLastColumn() === 0) return;

      const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getDisplayValues();
      const cols = findColumns_(values[0]);
      if (cols.email === -1 && cols.phone === -1) return; // not a lead tab

      for (let r = 1; r < values.length; r++) {
        const row = values[r];
        const lead = [
          joinName_(cell_(row, cols.name), cell_(row, cols.lastName)),
          cell_(row, cols.email),
          cell_(row, cols.phone),
          cell_(row, cols.profession),
          cell_(row, cols.utmSource),
        ];
        const key = leadKey_(lead[1], lead[2]);
        if (!key || seen[key]) continue;
        seen[key] = true;

        const group = classify_(lead[3]);
        if (group === 'other' && !tabs.other) continue;
        pending[group].push(lead);
      }
    });

    Object.keys(pending).forEach(function (k) {
      if (pending[k].length) append_(tabs[k], pending[k]);
    });
    console.log('Added: business=%s job=%s other=%s',
      pending.business.length, pending.job.length, pending.other.length);
  } finally {
    lock.releaseLock();
  }
}

function classify_(profession) {
  const p = String(profession).toLowerCase().trim();
  if (!p) return 'other';
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

function existingKeys_(tab) {
  if (tab.getLastRow() < 2) return [];
  return tab.getRange(2, 2, tab.getLastRow() - 1, 2).getDisplayValues()
    .map(function (r) { return leadKey_(r[0], r[1]); })
    .filter(String);
}

function append_(tab, rows) {
  const start = tab.getLastRow() + 1;
  const range = tab.getRange(start, 1, rows.length, OUTPUT_HEADERS.length);
  range.setNumberFormat('@'); // keep phone numbers like +91... as text
  range.setValues(rows);
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

function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'splitLeadsByProfession'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('splitLeadsByProfession').timeBased().everyMinutes(10).create();
  splitLeadsByProfession();
}
