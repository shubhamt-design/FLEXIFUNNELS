/**
 * Webinar campaign master sheet: merge the Pitch / Non-pitch / Missed
 * sheets into one spreadsheet with one tab per type per month.
 *
 *   October Pitch       October Non-pitch       October Missed
 *   November Pitch      November Non-pitch      November Missed
 *   ...
 *
 * How it works:
 *   - SOURCES (below) lists the three source spreadsheets and, for each, the
 *     keyword(s) a tab name must contain to be pulled (e.g. "pitch").
 *     Only tabs whose name contains a keyword are read; every other tab in
 *     that spreadsheet is ignored.
 *   - The first run pulls ALL existing rows from every matching tab.
 *   - After that, each run appends only what is new: rows added to a tab
 *     since the last run, and every row of a tab created since the last run
 *     (e.g. the tab for the 6 Oct session).
 *   - Each matching tab goes into the month taken from the date in its name
 *     ("2 Oct", "Oct 6", "06/10", "2026-10-06" ...). If the name has no date,
 *     it goes into the month in which the script first saw it, and stays
 *     there.
 *   - Columns are matched by header name, so the column order in the source
 *     tabs does not matter. A new header becomes a new column on the right.
 *   - Two columns are added in front: "Session tab" (the source tab name) and
 *     "Synced at".
 *
 * Triggers (installTriggers): an on-change trigger on each source
 * spreadsheet, so edits and new tabs sync within seconds, plus a 15-minute
 * timer as a safety net for rows written by forms, Zapier or other scripts
 * (those do not fire on-change triggers).
 *
 * One-time setup: fill in MASTER_SPREADSHEET_ID (or bind the script to the
 * master spreadsheet) and SOURCES, then run installTriggers() once from the
 * editor and approve the permissions prompt. That first run also does the
 * full backfill.
 */

// The master spreadsheet. Leave blank if this script is bound to it
// (opened via Extensions > Apps Script inside the master spreadsheet).
const MASTER_SPREADSHEET_ID = '';

// One entry per type. `type` becomes the tab suffix ("October Pitch").
// `keywords`: a source tab is pulled if its name contains ANY of these
// (case-insensitive). `exclude`: skip a tab whose name contains any of these.
// Leave `keywords` empty to pull every tab of that spreadsheet.
const SOURCES = [
  { type: 'Pitch',     spreadsheetId: 'PASTE_PITCH_SHEET_ID',     keywords: ['pitch'],     exclude: ['non'] },
  { type: 'Non-pitch', spreadsheetId: 'PASTE_NON_PITCH_SHEET_ID', keywords: ['non pitch', 'non-pitch', 'nonpitch'], exclude: [] },
  { type: 'Missed',    spreadsheetId: 'PASTE_MISSED_SHEET_ID',    keywords: ['missed'],    exclude: [] },
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

    SOURCES.forEach(function (src) {
      try {
        syncSource_(master, src, state, log);
      } catch (e) {
        log.push([new Date(), src.type, '', 0, 'ERROR: ' + e.message]);
      }
    });

    saveState_(state);
    writeLog_(master, log);
  } finally {
    lock.releaseLock();
  }
}

function syncSource_(master, src, state, log) {
  const ss = SpreadsheetApp.openById(src.spreadsheetId);
  const now = new Date();

  ss.getSheets().forEach(function (sheet) {
    const name = sheet.getName();
    if (!tabMatches_(name, src)) return;

    const key = src.spreadsheetId + ':' + sheet.getSheetId();
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
      const tabName = Utilities.formatDate(monthDate, TIMEZONE, MONTH_FORMAT) + ' ' + src.type;
      appendRows_(master, tabName, name, headers, fresh, now);
      log.push([now, src.type, name, fresh.length, 'Appended to "' + tabName + '"']);
    }

    tabState.copied = dataRows.length;
    state[key] = tabState;
  });
}

function tabMatches_(name, src) {
  const n = normalise_(name);
  const exclude = src.exclude || [];
  const keywords = src.keywords || [];
  if (exclude.some(function (k) { return n.indexOf(normalise_(k)) !== -1; })) return false;
  if (!keywords.length) return true;
  return keywords.some(function (k) { return n.indexOf(normalise_(k)) !== -1; });
}

function normalise_(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
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
  // "2 Oct", "2nd October 2026"
  const dayMonth = /(?<!\d)(\d{1,2})(?:st|nd|rd|th)?[\s\-_.]*([a-z]{3,9})(?![a-z])\.?(?:[\s\-_,.]*(\d{4}))?/g;
  while ((m = dayMonth.exec(s))) {
    const mon = monthIndex_(m[2]);
    if (mon) return withYear_(+m[1], mon, m[3] ? +m[3] : null, now);
  }
  // "Oct 2", "October 2nd, 2026"
  const monthDay = /(?<![a-z])([a-z]{3,9})\.?[\s\-_]*(\d{1,2})(?:st|nd|rd|th)?(?![\d\/])(?:[\s\-_,.]*(\d{4}))?/g;
  while ((m = monthDay.exec(s))) {
    const mon = monthIndex_(m[1]);
    if (mon) return withYear_(+m[2], mon, m[3] ? +m[3] : null, now);
  }
  // "02/10", "02-10-2026" (day first)
  if ((m = s.match(/(?<!\d)(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?(?!\d)/))) {
    let y = m[3] ? +m[3] : null;
    if (y !== null && y < 100) y += 2000;
    return withYear_(+m[1], +m[2], y, now);
  }
  return null;
}

function monthIndex_(word) {
  const i = MONTHS_.indexOf(word.slice(0, 3));
  if (i === -1) return 0;
  // Reject words that only start like a month ("marketing", "decision").
  const full = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december'][i];
  if (word.length > 3 && full.indexOf(word) !== 0 && !(i === 8 && word === 'sept')) return 0;
  return i + 1;
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
  SOURCES.forEach(function (src) {
    ScriptApp.newTrigger('syncAll').forSpreadsheet(src.spreadsheetId).onChange().create();
  });
  ScriptApp.newTrigger('syncAll').timeBased().everyMinutes(15).create();
  syncAll();
}

/** Shows which tabs would be pulled, and into which month, without copying. */
function previewMatches() {
  const now = new Date();
  SOURCES.forEach(function (src) {
    SpreadsheetApp.openById(src.spreadsheetId).getSheets().forEach(function (sheet) {
      const name = sheet.getName();
      const hit = tabMatches_(name, src);
      const d = hit ? dateFromTabName_(name, now) : null;
      Logger.log('[%s] %s  ->  %s', src.type, name,
        !hit ? 'skipped' : (d ? Utilities.formatDate(d, TIMEZONE, MONTH_FORMAT) : 'no date in name: month it is first synced'));
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
