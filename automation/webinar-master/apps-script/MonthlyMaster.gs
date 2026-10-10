/**
 * Webinar / workshop leads: monthly master sheet.
 *
 * Every session gets 5 tabs in the "Active Campaign List Upload" sheets, e.g.
 *   08 OCT 2026 10 Mins Workshop attendee(with buyers)   <- skipped
 *   08 OCT 2026 10 Mins Workshop attendee (w/o buyers)   <- skipped
 *   08 OCT 2026 10 Mins Workshop pitch                   -> October Pitch
 *   08 OCT 2026 10 Mins Workshop non-pitch               -> October Non-pitch
 *   08 OCT 2026 10 Mins Workshop missed                  -> October Missed
 *
 * This script copies every dated pitch / non-pitch / missed tab (all
 * campaigns: 10 Mins Workshop, Flexi Genie, Yearly Promo, Q&A ...) into one
 * master spreadsheet with three tabs per month:
 *
 *   October Pitch       October Non-pitch       October Missed
 *
 * Each row keeps Name, Email, Phone and Time, plus the Campaign, Session date
 * and Session tab it came from.
 *
 * How it syncs:
 *   - The first run pulls ALL rows from every matching tab.
 *   - After that, each run appends only what is new: rows added to a tab
 *     since the last run, and every row of a tab created since the last run.
 *   - The month comes from the date in the tab name ("08 OCT 2026",
 *     "30 Sep2026", "20 AUG", "13sep"). Tabs with no date in the name are
 *     skipped; a name with only a day ("25 Encore ...") takes the month of
 *     the tab next to it.
 *
 * Source spreadsheets: EXTRA_SOURCE_IDS (Upload 9, 10, 11), plus any newer
 * spreadsheet whose name contains SOURCE_FILE_NAME, so Upload 12, 13 ... are
 * picked up on their own.
 *
 * Triggers (installTriggers): a 15-minute timer, plus an on-change trigger on
 * each source spreadsheet that has matching tabs, so edits there sync within
 * seconds.
 *
 * One-time setup: create the master spreadsheet, open Extensions > Apps
 * Script inside it, paste this file, run installTriggers() once and approve
 * the permissions prompt. That first run also does the full backfill.
 */

// The master spreadsheet. Leave blank if this script is bound to it
// (opened via Extensions > Apps Script inside the master spreadsheet).
const MASTER_SPREADSHEET_ID = '';

// Source spreadsheets, always read:
const EXTRA_SOURCE_IDS = [
  '18C_t6zeLlL34uXq1HFEw9SsVM8STcwjyVCkrsg0PCJc', // Active Campaign List Upload 9 - 2026
  '1T-seqAy2j6WrU-c2zv6GZHKSwaf9YVtHsNcNpckjXR4', // Active Campaign List Upload 10 - 2026
  '1xQEivSCmMv4WBpN8fqlLrisj8EXJBy0YLXzWAX58NhI', // Active Campaign List Upload 11 - 2026
];
// Plus any newer file whose name contains this text (Upload 12, 13 ...)...
const SOURCE_FILE_NAME = 'Active Campaign List Upload';
// ...created on or after this date.
const SOURCE_FILES_SINCE = '2026-09-01';

// Which tabs are pulled: every tab whose name says pitch / non-pitch / missed
// AND has a session date in it. Attendee and buyer tabs never say any of
// these, so they're skipped. The Campaign column is filled in from CAMPAIGNS.

// Tab type by keyword. First match wins, so Non-pitch must come before Pitch.
// Covers "non-pitch", "Non Pitch", "No Pitch", "nopitch", "NO-PITCH".
const TYPES = [
  { type: 'Non-pitch', pattern: /\bno(?:n)?[\s\-_]*pitch/i },
  { type: 'Pitch',     pattern: /pitch/i },
  { type: 'Missed',    pattern: /missed/i },
];

// Tabs to skip even though they say pitch / missed (copies and subsets that
// would count the same people twice).
const SKIP_TABS = [
  /^copy of/i,
  /\b90\s*min/i,       // "pitch above 90 Min", "pitch (90 min)"
];

// Campaign column, from the tab name. First match wins, so put the more
// specific name first. Tabs that name no campaign (e.g. "13 sep pitch",
// older tabs) get "Other".
const CAMPAIGNS = [
  { name: '10 Mins Workshop', pattern: /10\s*mins?\b/i },
  { name: 'Flexi Genie Q&A',  pattern: /flexi\s*genie.*q\s*&\s*a/i },
  { name: 'Flexi Genie',      pattern: /flexi\s*genie/i },
  { name: 'Yearly Promo',     pattern: /yearly\s*promo/i },
  { name: 'Monthly Promo',    pattern: /monthly\s*promo/i },
  { name: 'Q&A',              pattern: /q\s*&\s*a/i },
  { name: 'Flexi Agentic',    pattern: /flexi\s*agent/i },
  { name: 'Faceless',         pattern: /faces?l?ess|facelss/i },
  { name: 'TFP',              pattern: /\btfp\b/i },
  { name: 'PSP',              pattern: /\bpsp\b/i },
  { name: 'MCP Implement',    pattern: /\bmcp\b/i },
  { name: '2 Day AI',         pattern: /2\s*day\s*ai/i },
];
const OTHER_CAMPAIGN = 'Other';

// Campaigns to leave out of the master entirely, e.g. ['TFP', 'PSP'].
const SKIP_CAMPAIGNS = [];

// Columns copied from each source tab, found by header name (any of the
// listed spellings, case-insensitive). If a tab has no recognisable headers,
// columns A-D are used in this order.
const COLUMNS = [
  { name: 'Name',  headers: ['name', 'full name', 'first_name', 'first name'] },
  { name: 'Email', headers: ['email', 'email id', 'email address', 'e-mail'] },
  { name: 'Phone', headers: ['phone', 'phonw', 'phone number', 'mobile', 'whatsapp', 'contact'] },
  { name: 'Time',  headers: ['time', 'duration', 'minutes', 'time (min)'] },
];
const EXTRA_COLUMNS = ['Campaign', 'Session date', 'Session tab'];

// Row in each source tab that holds the column headers (data starts below it).
const SOURCE_HEADER_ROW = 1;

// Master tab name. Use 'MMMM yyyy' to get "October 2026 Pitch" if you keep
// more than one year in the same spreadsheet.
const MONTH_FORMAT = 'MMMM';
const TIMEZONE = 'Asia/Kolkata';

const LOG_SHEET = 'Sync log';

/** Main entry point: called by both triggers. Safe to run any time. */
function syncAll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60 * 1000)) return;
  try {
    const master = openMaster_();
    const state = loadState_();
    const log = [];

    sourceIds_().forEach(function (id) {
      if (id === master.getId()) return;
      try {
        syncSource_(master, id, state, log);
      } catch (e) {
        log.push([new Date(), '', id, 0, 'ERROR: ' + e.message]);
      }
    });

    saveState_(state);
    writeLog_(master, log);
  } finally {
    lock.releaseLock();
  }
}

/** Ids of all source spreadsheets: matching file names plus EXTRA_SOURCE_IDS. */
function sourceIds_() {
  const ids = EXTRA_SOURCE_IDS.slice();
  const q = 'title contains "' + SOURCE_FILE_NAME.replace(/"/g, '\\"') + '"' +
    ' and mimeType = "application/vnd.google-apps.spreadsheet"' +
    ' and createdDate >= "' + SOURCE_FILES_SINCE + 'T00:00:00"' +
    ' and trashed = false';
  const it = DriveApp.searchFiles(q);
  while (it.hasNext()) {
    const id = it.next().getId();
    if (ids.indexOf(id) === -1) ids.push(id);
  }
  return ids;
}

function syncSource_(master, spreadsheetId, state, log) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const now = new Date();
  let triggerChecked = false;
  const sheets = ss.getSheets();
  const dates = tabDates_(sheets.map(function (sh) { return sh.getName(); }), now);

  sheets.forEach(function (sheet, idx) {
    const name = sheet.getName();
    const match = matchTab_(name);
    const sessionDate = dates[idx];
    if (!match || !sessionDate) return;
    if (!triggerChecked) {
      ensureChangeTrigger_(spreadsheetId);
      triggerChecked = true;
    }

    const key = spreadsheetId + ':' + sheet.getSheetId();
    const tabState = state[key] || { copied: 0, month: null };
    if (!tabState.month) tabState.month = Utilities.formatDate(sessionDate, TIMEZONE, 'yyyy-MM');

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= SOURCE_HEADER_ROW || lastCol === 0) {
      state[key] = tabState;
      return;
    }

    const values = sheet.getRange(SOURCE_HEADER_ROW, 1, lastRow - SOURCE_HEADER_ROW + 1, lastCol).getValues();
    const cols = columnPositions_(values[0]);
    const dataRows = values.slice(1);

    // If rows were deleted from the source, don't re-copy; just catch up.
    if (tabState.copied > dataRows.length) tabState.copied = dataRows.length;

    const dateText = Utilities.formatDate(sessionDate, TIMEZONE, 'dd MMM yyyy');
    const fresh = [];
    dataRows.slice(tabState.copied).forEach(function (r) {
      const out = cols.map(function (c) { return c === -1 ? '' : r[c]; });
      if (out.every(function (v) { return v === '' || v === null; })) return;
      fresh.push(out.concat([match.campaign, dateText, name]));
    });

    if (fresh.length) {
      const monthDate = Utilities.parseDate(tabState.month + '-01', TIMEZONE, 'yyyy-MM-dd');
      const tabName = Utilities.formatDate(monthDate, TIMEZONE, MONTH_FORMAT) + ' ' + match.type;
      appendRows_(master, tabName, fresh);
      log.push([now, match.campaign + ' / ' + match.type, name, fresh.length, 'Appended to "' + tabName + '"']);
    }

    tabState.copied = dataRows.length;
    state[key] = tabState;
  });
}

/** Returns {campaign, type} for a tab to pull, or null to skip it. */
function matchTab_(name) {
  if (SKIP_TABS.some(function (re) { return re.test(name); })) return null;
  let type = null;
  for (let j = 0; j < TYPES.length && !type; j++) {
    if (TYPES[j].pattern.test(name)) type = TYPES[j].type;
  }
  if (!type) return null;
  let campaign = OTHER_CAMPAIGN;
  for (let i = 0; i < CAMPAIGNS.length; i++) {
    if (CAMPAIGNS[i].pattern.test(name)) { campaign = CAMPAIGNS[i].name; break; }
  }
  if (SKIP_CAMPAIGNS.indexOf(campaign) !== -1) return null;
  return { campaign: campaign, type: type };
}

/**
 * Session date of each tab (null if none). A name with only a day number,
 * like "25 Encore flexigenie(Pitch)", takes its month from the nearest tab
 * that has a full date.
 */
function tabDates_(names, now) {
  const full = names.map(function (n) { return dateFromTabName_(n, now); });
  return names.map(function (n, i) {
    if (full[i]) return full[i];
    const m = String(n).match(/^\s*(\d{1,2})(?!\d)(?:st|nd|rd|th)?\b/i);
    if (!m) return null;
    for (let d = 1; d < names.length; d++) {
      const near = full[i - d] || full[i + d];
      if (near) return makeDate_(near.getFullYear(), near.getMonth() + 1, +m[1]);
    }
    return null;
  });
}

/**
 * Index of each COLUMNS entry in a header row. A column whose header isn't
 * found falls back to its usual position (A Name, B Email, C Phone, D Time)
 * if no other column took that position, e.g. a blank Time header, or an
 * Email column mistakenly headed "Name".
 */
function columnPositions_(headerRow) {
  const h = headerRow.map(function (x) { return String(x).trim().toLowerCase(); });
  const pos = COLUMNS.map(function (c) {
    for (let i = 0; i < h.length; i++) if (c.headers.indexOf(h[i]) !== -1) return i;
    return -1;
  });
  const known = [].concat.apply([], COLUMNS.map(function (c) { return c.headers; }));
  return pos.map(function (p, i) {
    if (p !== -1 || i >= h.length || pos.indexOf(i) !== -1) return p;
    // Only borrow a blank header, or one that belongs to another column.
    return h[i] === '' || known.indexOf(h[i]) !== -1 ? i : -1;
  });
}

/** Appends rows to a month tab, creating it with the header row if needed. */
function appendRows_(master, tabName, rows) {
  const headers = COLUMNS.map(function (c) { return c.name; }).concat(EXTRA_COLUMNS);
  let sheet = master.getSheetByName(tabName);
  if (!sheet) {
    sheet = master.insertSheet(tabName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

const MONTHS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Finds a date in a tab name. Understands "2 Oct", "2nd October", "Oct 2",
 * "October 2nd 2026", "02/10", "02-10-2026" (day first) and "2026-10-02".
 * Returns null if there is none. A date with no year gets the year that puts
 * it closest to `now`.
 */
function dateFromTabName_(name, now) {
  const s = String(name).toLowerCase();
  let m;

  if ((m = s.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) {
    return makeDate_(+m[1], +m[2], +m[3]);
  }
  const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  // "2 Oct", "08 OCT 2026", "30 Sep2026", "4octtotalreg", "2nd October"
  if ((m = s.match(new RegExp('(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-_.]*' + MON + '\\.?(?:[\\s\\-_,.]*(\\d{4}))?')))) {
    return withYear_(+m[1], monthIndex_(m[2]), m[3] ? +m[3] : null, now);
  }
  // "Oct 2", "October 2nd, 2026"
  if ((m = s.match(new RegExp('(?<![a-z])' + MON + '\\.?[\\s\\-_]*(\\d{1,2})(?:st|nd|rd|th)?(?![\\d\\/:])(?:[\\s\\-_,.]*(\\d{4}))?')))) {
    return withYear_(+m[2], monthIndex_(m[1]), m[3] ? +m[3] : null, now);
  }
  // "02/10", "02-10-2026" (day first)
  if ((m = s.match(/(?<![\d:])(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?(?![\d:])/))) {
    let y = m[3] ? +m[3] : null;
    if (y !== null && y < 100) y += 2000;
    return withYear_(+m[1], +m[2], y, now);
  }
  return null;
}

function monthIndex_(word) {
  return MONTHS_.indexOf(word.slice(0, 3)) + 1;
}

function withYear_(day, month, year, now) {
  if (year) return makeDate_(year, month, day);
  const y = +Utilities.formatDate(now, TIMEZONE, 'yyyy');
  let best = null;
  [y - 1, y, y + 1].forEach(function (cand) {
    const d = makeDate_(cand, month, day);
    if (d && (!best || Math.abs(d - now) < Math.abs(best - now))) best = d;
  });
  return best;
}

function makeDate_(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d, 12);
  return date.getMonth() === m - 1 ? date : null;
}

// ---- state (rows already copied per source tab) ----

const STATE_KEY = 'webinarMasterState';

function loadState_() {
  const raw = PropertiesService.getScriptProperties().getProperty(STATE_KEY);
  return raw ? JSON.parse(raw) : {};
}

function saveState_(state) {
  PropertiesService.getScriptProperties().setProperty(STATE_KEY, JSON.stringify(state));
}

function openMaster_() {
  const master = MASTER_SPREADSHEET_ID
    ? SpreadsheetApp.openById(MASTER_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!master) throw new Error('Set MASTER_SPREADSHEET_ID: this script is not bound to a spreadsheet.');
  return master;
}

function writeLog_(master, rows) {
  if (!rows.length) return;
  let sheet = master.getSheetByName(LOG_SHEET);
  if (!sheet) {
    sheet = master.insertSheet(LOG_SHEET);
    sheet.getRange(1, 1, 1, 5).setValues([['Time', 'Type', 'Source tab', 'Rows', 'Result']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
}

// ---- setup / maintenance (run from the editor) ----

/** Run once. Installs the triggers and does the first full pull. */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAll') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(15).create();
  syncAll();
}

/** Adds an on-change trigger for a source spreadsheet, once. */
function ensureChangeTrigger_(spreadsheetId) {
  const has = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'syncAll' && t.getTriggerSourceId() === spreadsheetId;
  });
  if (!has) ScriptApp.newTrigger('syncAll').forSpreadsheet(spreadsheetId).onChange().create();
}

/** Shows which tabs would be pulled, and into which master tab, without copying. */
function previewMatches() {
  const now = new Date();
  sourceIds_().forEach(function (id) {
    const ss = SpreadsheetApp.openById(id);
    Logger.log('== %s', ss.getName());
    const names = ss.getSheets().map(function (sh) { return sh.getName(); });
    const dates = tabDates_(names, now);
    names.forEach(function (name, i) {
      const m = matchTab_(name);
      Logger.log('%s  ->  %s', name, !m ? 'skipped' : !dates[i] ? 'skipped (no date in name)'
        : Utilities.formatDate(dates[i], TIMEZONE, MONTH_FORMAT) + ' ' + m.type + '  [' + m.campaign + ']');
    });
  });
}

/**
 * Forgets what has been copied, so the next sync pulls everything again.
 * Delete the month tabs first, or rows will be duplicated.
 */
function resetSyncState() {
  PropertiesService.getScriptProperties().deleteProperty(STATE_KEY);
}
