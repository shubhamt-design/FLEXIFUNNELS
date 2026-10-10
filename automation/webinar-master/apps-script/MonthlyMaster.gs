/**
 * 10 Mins Business Launch Workshop: monthly master sheet.
 *
 * Collects every session's Pitch / Non-pitch / Missed tab into one master
 * spreadsheet with three tabs per month:
 *
 *   October Pitch       October Non-pitch       October Missed
 *   November Pitch      November Non-pitch      November Missed
 *
 * Where the data comes from:
 *   Active Campaign List Upload 9, 10 and 11 (EXTRA_SOURCE_IDS), plus any
 *   newer file whose name contains "Active Campaign List Upload", so 12,
 *   13 ... are picked up on their own.
 *   Inside those, only tabs whose name contains "10 Mins Workshop" are read,
 *   and each one is sorted by keyword:
 *     "... non-pitch" -> Non-pitch     (checked first)
 *     "... pitch"     -> Pitch
 *     "... missed"    -> Missed
 *   e.g. "08 OCT 2026 10 Mins Workshop pitch" -> "October Pitch".
 *   Anything else (attendee tabs, Faceless workshop tabs, Sheet62 ...) is
 *   ignored.
 *
 * How it syncs:
 *   - The first run pulls ALL rows from every matching tab.
 *   - After that, each run appends only what is new: rows added to a tab
 *     since the last run, and every row of a tab created since the last run
 *     (e.g. the next session's tabs).
 *   - The month comes from the date in the tab name ("08 OCT 2026",
 *     "30 Sep2026"). If a name has no date, the tab goes into the month the
 *     script first saw it.
 *   - Columns are matched by header name; a new header becomes a new column.
 *   - Two columns are added in front: "Session tab" (the source tab name) and
 *     "Synced at".
 *
 * Triggers (installTriggers): a 15-minute timer, plus an on-change trigger on
 * each source spreadsheet that has workshop tabs, so edits there sync within
 * seconds. A new upload file gets its on-change trigger the first time the
 * timer finds a workshop tab in it.
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

// A tab is pulled only if its name matches this (case-insensitive).
// Matches "10 Mins Workshop", "10 Min Workshop", "10Mins Workshop".
const CAMPAIGN_TAB_PATTERN = /10\s*mins?\s*workshop/i;

// Tab type by keyword. First match wins, so Non-pitch must come before Pitch.
const TYPES = [
  { type: 'Non-pitch', pattern: /non[\s\-_]*pitch/i },
  { type: 'Pitch',     pattern: /pitch/i },
  { type: 'Missed',    pattern: /missed/i },
];

// Row in each source tab that holds the column headers (data starts below it).
const SOURCE_HEADER_ROW = 1;

// Master tab name. Use 'MMMM yyyy' to get "October 2026 Pitch" if you keep
// more than one year in the same spreadsheet.
const MONTH_FORMAT = 'MMMM';
const TIMEZONE = 'Asia/Kolkata';

const META_HEADERS = ['Session tab', 'Synced at'];
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

  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    const type = tabType_(name);
    if (!type) return;
    if (!triggerChecked) {
      ensureChangeTrigger_(spreadsheetId);
      triggerChecked = true;
    }

    const key = spreadsheetId + ':' + sheet.getSheetId();
    const tabState = state[key] || { copied: 0, month: null };
    if (!tabState.month) {
      const d = dateFromTabName_(name, now) || now;
      tabState.month = Utilities.formatDate(d, TIMEZONE, 'yyyy-MM');
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= SOURCE_HEADER_ROW || lastCol === 0) {
      state[key] = tabState;
      return;
    }

    const values = sheet.getRange(SOURCE_HEADER_ROW, 1, lastRow - SOURCE_HEADER_ROW + 1, lastCol).getValues();
    const headers = values[0].map(function (h) { return String(h).trim(); });
    const dataRows = values.slice(1);

    // If rows were deleted from the source, don't re-copy; just catch up.
    if (tabState.copied > dataRows.length) tabState.copied = dataRows.length;

    const fresh = dataRows.slice(tabState.copied).filter(function (r) {
      return r.some(function (c) { return c !== '' && c !== null; });
    });

    if (fresh.length) {
      const monthDate = Utilities.parseDate(tabState.month + '-01', TIMEZONE, 'yyyy-MM-dd');
      const tabName = Utilities.formatDate(monthDate, TIMEZONE, MONTH_FORMAT) + ' ' + type;
      appendRows_(master, tabName, name, headers, fresh, now);
      log.push([now, type, name, fresh.length, 'Appended to "' + tabName + '"']);
    }

    tabState.copied = dataRows.length;
    state[key] = tabState;
  });
}

/** Returns "Pitch", "Non-pitch", "Missed", or null if the tab isn't pulled. */
function tabType_(name) {
  if (!CAMPAIGN_TAB_PATTERN.test(name)) return null;
  for (let i = 0; i < TYPES.length; i++) {
    if (TYPES[i].pattern.test(name)) return TYPES[i].type;
  }
  return null;
}

/** Appends rows to the month tab, creating it and any missing columns. */
function appendRows_(master, tabName, sourceTab, sourceHeaders, rows, now) {
  let sheet = master.getSheetByName(tabName);
  if (!sheet) {
    sheet = master.insertSheet(tabName);
    sheet.getRange(1, 1, 1, META_HEADERS.length).setValues([META_HEADERS]);
    sheet.setFrozenRows(1);
  }

  const lastCol = Math.max(sheet.getLastColumn(), META_HEADERS.length);
  const masterHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });

  // Unnamed source columns are kept under "Column <letter>".
  const names = sourceHeaders.map(function (h, i) { return h || ('Column ' + columnLetter_(i + 1)); });

  // Add any source header the master tab doesn't have yet.
  const added = [];
  names.forEach(function (h) {
    if (masterHeaders.indexOf(h) === -1 && added.indexOf(h) === -1) added.push(h);
  });
  if (added.length) {
    sheet.getRange(1, masterHeaders.length + 1, 1, added.length).setValues([added]);
    added.forEach(function (h) { masterHeaders.push(h); });
  }
  sheet.getRange(1, 1, 1, masterHeaders.length).setFontWeight('bold');

  const colIndex = {};
  masterHeaders.forEach(function (h, i) { colIndex[h] = i; });

  const out = rows.map(function (r) {
    const row = new Array(masterHeaders.length).fill('');
    row[0] = sourceTab;
    row[1] = now;
    names.forEach(function (h, i) { row[colIndex[h]] = r[i]; });
    return row;
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, out.length, masterHeaders.length).setValues(out);
}

function columnLetter_(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
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
    ss.getSheets().forEach(function (sheet) {
      const name = sheet.getName();
      const type = tabType_(name);
      const d = type ? dateFromTabName_(name, now) : null;
      Logger.log('%s  ->  %s', name, !type ? 'skipped'
        : (d ? Utilities.formatDate(d, TIMEZONE, MONTH_FORMAT) : '(no date: month first synced)') + ' ' + type);
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
