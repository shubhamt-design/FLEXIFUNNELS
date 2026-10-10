/**
 * Audience Dashboard — lead sheets (UTM sheets) and batch pulls.
 *
 * Every spreadsheet whose name contains CONFIG.SOURCE_SEARCH is a "source".
 * All its tabs are combined into one pool, each contact tagged with its tab.
 * A pull takes the next N contacts that are not duplicates, buyers, opt-outs,
 * internal/test or already used, and marks them as used so the next pull
 * continues after them.
 *
 * Used contacts live in a separate spreadsheet ("Audience Dashboard – Used
 * leads") so they never fill up the main data sheet.
 */

var SOURCES_TAB = '_Sources';
var BATCHES_TAB = '_Batches';
var SOURCES_HEADER = ['ID', 'Name', 'Tabs (JSON)', 'Total rows', 'Last scanned', 'Hidden'];
var BATCHES_HEADER = ['Batch ID', 'Batch name', 'Sheet', 'Tabs', 'Pulled', 'Created at', 'Created by'];
var USED_HEADER = ['Batch ID', 'Name', 'Email', 'Phone', 'Source tab', 'Sheet'];

/** Called from setup(): creates the tabs, the Used spreadsheet and the trigger. */
function setupSources_() {
  var ss = db_();
  [[SOURCES_TAB, SOURCES_HEADER], [BATCHES_TAB, BATCHES_HEADER]].forEach(function (t) {
    var sh = ss.getSheetByName(t[0]) || ss.insertSheet(t[0]);
    if (sh.getLastRow() === 0) sh.appendRow(t[1]);
    sh.setFrozenRows(1);
  });
  usedSheet_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scanSources') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scanSources').timeBased().everyHours(1).create();
  scanSources();
}

function usedSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('USED_ID'), ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else {
    ss = SpreadsheetApp.create('Audience Dashboard – Used leads');
    props.setProperty('USED_ID', ss.getId());
    var first = ss.getSheets()[0];
    first.setName('Used');
    first.appendRow(USED_HEADER);
    first.setFrozenRows(1);
    first.getRange('A:F').setNumberFormat('@');
  }
  return ss.getSheetByName('Used');
}

/* ------------------------------------------------------------------ */
/* Discover + scan sheets (hourly, or "Rescan" button)                 */
/* ------------------------------------------------------------------ */

function scanSourcesNow() { guard_(); return scanSources(); }

function scanSources() {
  var sh = db_().getSheetByName(SOURCES_TAB);
  var known = readSources_();
  var byId = {};
  known.forEach(function (s) { byId[s.id] = s; });
  var it = DriveApp.searchFiles('title contains "' + CONFIG.SOURCE_SEARCH + '" and mimeType = "' +
    MimeType.GOOGLE_SHEETS + '" and trashed = false');
  while (it.hasNext()) {
    var f = it.next();
    if (f.getId() === db_().getId()) continue;
    if (!byId[f.getId()]) byId[f.getId()] = { id: f.getId(), name: f.getName(), tabs: [], total: 0, scanned: '', hidden: false };
    byId[f.getId()].name = f.getName();
  }
  var rows = Object.keys(byId).map(function (id) {
    var s = byId[id];
    if (!s.hidden) {
      try { scanOne_(s); } catch (e) { s.error = String(e.message || e); }
    }
    return [s.id, s.name, JSON.stringify(s.tabs), s.total, s.scanned, s.hidden ? 'yes' : ''];
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, SOURCES_HEADER.length).clearContent();
  if (rows.length) {
    ensureRows_(sh, rows.length + 1);
    sh.getRange(2, 1, rows.length, SOURCES_HEADER.length).setValues(rows);
  }
  PropertiesService.getScriptProperties().setProperty('SOURCES_SCANNED', new Date().toISOString());
  return { sheets: rows.length };
}

/** Tab names, contact columns and row counts of one spreadsheet (no full read). */
function scanOne_(s) {
  var ss = SpreadsheetApp.openById(s.id);
  s.tabs = ss.getSheets().map(function (sh) {
    var last = sh.getLastRow(), info = { name: sh.getName(), rows: 0, cols: null, start: 1 };
    if (last < 1) return info;
    var width = Math.min(sh.getLastColumn(), 40);
    var top = sh.getRange(1, 1, Math.min(10, last), width).getValues();
    var head = findHeader(top);
    if (head) { info.cols = head.cols; info.start = head.row + 2; }
    else { info.cols = sniffColumns(top); info.start = 1; }
    if (info.cols) info.rows = Math.max(0, last - info.start + 1);
    return info;
  });
  s.total = s.tabs.reduce(function (t, x) { return t + x.rows; }, 0);
  s.scanned = new Date().toISOString();
}

function readSources_() {
  var sh = db_().getSheetByName(SOURCES_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, SOURCES_HEADER.length).getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return { id: r[0], name: r[1], tabs: JSON.parse(r[2] || '[]'), total: +r[3] || 0,
        scanned: r[4] ? String(r[4]) : '', hidden: r[5] === 'yes' };
    });
}

function findSource_(id) {
  var s = readSources_().filter(function (x) { return x.id === id; })[0];
  if (!s) throw new Error('That sheet is not connected. Click "Rescan Drive" and try again.');
  return s;
}

/** Add any spreadsheet by link, even without "UTM" in its name. */
function addSourceByLink(url) {
  guard_();
  var m = String(url).match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!m) throw new Error('That does not look like a Google Sheets link.');
  var s = { id: m[1], name: SpreadsheetApp.openById(m[1]).getName(), tabs: [], total: 0, hidden: false };
  scanOne_(s);
  var sh = db_().getSheetByName(SOURCES_TAB);
  var row = [s.id, s.name, JSON.stringify(s.tabs), s.total, s.scanned, ''];
  var existing = readSources_().map(function (x) { return x.id; }).indexOf(s.id);
  if (existing >= 0) sh.getRange(existing + 2, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
  return { name: s.name };
}

function setSourceHidden(id, hidden) {
  guard_();
  var i = readSources_().map(function (x) { return x.id; }).indexOf(id);
  if (i >= 0) db_().getSheetByName(SOURCES_TAB).getRange(i + 2, 6).setValue(hidden ? 'yes' : '');
  return true;
}

/* ------------------------------------------------------------------ */
/* State for the "Lead sheets" page                                    */
/* ------------------------------------------------------------------ */

function getSourcesState() {
  guard_();
  var bs = db_().getSheetByName(BATCHES_TAB);
  var batches = bs && bs.getLastRow() > 1 ? bs.getRange(2, 1, bs.getLastRow() - 1, BATCHES_HEADER.length).getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return { id: r[0], name: r[1], sheet: r[2], tabs: r[3], pulled: +r[4] || 0,
        createdAt: r[5] ? new Date(r[5]).toISOString() : '', by: r[6] };
    }).reverse() : [];
  return {
    sources: readSources_(),
    batches: batches,
    scanned: PropertiesService.getScriptProperties().getProperty('SOURCES_SCANNED') || '',
    usedUrl: usedSheet_().getParent().getUrl()
  };
}

/* ------------------------------------------------------------------ */
/* Pool: all chosen tabs combined, cleaned, minus used                 */
/* ------------------------------------------------------------------ */

function buildPool_(sourceId, tabNames, phoneOnly) {
  var src = findSource_(sourceId);
  var ss = SpreadsheetApp.openById(sourceId);
  var raw = [], steps = [];
  src.tabs.forEach(function (t) {
    if (!t.cols || !t.rows || tabNames.indexOf(t.name) < 0) return;
    var sh = ss.getSheetByName(t.name);
    if (!sh) return;
    var n = sh.getLastRow() - t.start + 1;
    if (n < 1) return;
    function col(c) { return c >= 0 ? sh.getRange(t.start, c + 1, n, 1).getValues() : null; }
    var names = col(t.cols.name), emails = col(t.cols.email), phones = col(t.cols.phone);
    for (var i = 0; i < n; i++) {
      raw.push([names ? names[i][0] : '', emails ? emails[i][0] : '', phones ? phones[i][0] : '', t.name]);
    }
  });
  if (!raw.length) throw new Error('No contacts found in the selected tabs.');
  steps.push({ label: 'Rows in selected tabs', count: raw.length, add: true });

  var cleaned = cleanAndDedupe(raw, CONFIG.COUNTRY_CODE);
  steps.push({ label: 'Duplicates (same email or phone)', count: -cleaned.duplicates });
  steps.push({ label: 'No valid email or phone', count: -cleaned.invalid });
  var rows = cleaned.rows;

  readExclusions_().lists.forEach(function (l) {
    var res = removeMatching(rows, l.keys);
    steps.push({ label: l.label, count: -res.removed });
    rows = res.rows;
  });

  var used = removeMatching(rows, readUsedKeys_());
  steps.push({ label: 'Already used in earlier batches', count: -used.removed });
  rows = used.rows;

  var domains = CONFIG.IGNORE_EMAIL_DOMAINS || [];
  if (domains.length) {
    var before = rows.length;
    rows = rows.filter(function (r) {
      return !domains.some(function (d) { return r[1] && r[1].slice(-d.length - 1) === '@' + d; });
    });
    steps.push({ label: 'Internal / test emails', count: -(before - rows.length) });
  }
  if (phoneOnly) {
    var withPhone = rows.filter(function (r) { return r[2]; });
    steps.push({ label: 'No phone number', count: -(rows.length - withPhone.length) });
    rows = withPhone;
  }
  return { source: src, rows: rows, steps: steps };
}

function readUsedKeys_() {
  var sh = usedSheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return new Set();
  return keySetOf(sh.getRange(2, 2, n, 3).getValues().map(function (r) { return [r[0], String(r[1]), String(r[2])]; }));
}

function perTab_(rows) {
  var m = {};
  rows.forEach(function (r) { m[r[3]] = (m[r[3]] || 0) + 1; });
  return m;
}

/** How many fresh contacts are available (nothing is marked as used). */
function previewPool(sourceId, tabNames, phoneOnly) {
  guard_();
  var p = buildPool_(sourceId, tabNames, phoneOnly);
  return { steps: p.steps, available: p.rows.length, perTab: perTab_(p.rows) };
}

/** Take the next `count` fresh contacts and mark them as used. */
function pullBatch(sourceId, tabNames, phoneOnly, count, batchName) {
  var user = guard_();
  batchName = String(batchName || '').trim();
  if (!batchName) throw new Error('Give this batch a name (e.g. the webinar it is for).');
  count = Math.floor(+count);
  if (!(count > 0)) throw new Error('Enter how many contacts to pull.');
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var p = buildPool_(sourceId, tabNames, phoneOnly);
    var take = p.rows.slice(0, count);
    if (!take.length) throw new Error('No fresh contacts left in the selected tabs.');
    var id = 'B' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyMMdd-HHmmss');
    var used = usedSheet_();
    var data = take.map(function (r) { return [id, r[0], r[1], r[2], r[3], p.source.name]; });
    ensureRows_(used, used.getLastRow() + data.length);
    used.getRange(used.getLastRow() + 1, 1, data.length, USED_HEADER.length).setNumberFormat('@').setValues(data);
    db_().getSheetByName(BATCHES_TAB).appendRow([id, batchName, p.source.name,
      tabNames.length + ' tab' + (tabNames.length > 1 ? 's' : ''), take.length, new Date(), user]);
    log_(user, 'Pulled batch', batchName + ': ' + take.length + ' contacts from ' + p.source.name);
    return { id: id, name: batchName, pulled: take.length, available: p.rows.length, steps: p.steps,
      perTab: perTab_(take), rows: take };
  } finally {
    lock.releaseLock();
  }
}

/** Contacts of an earlier batch, for re-download. */
function getBatchRows(batchId) {
  guard_();
  var sh = usedSheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, USED_HEADER.length).getValues()
    .filter(function (r) { return r[0] === batchId; })
    .map(function (r) { return [r[1], r[2], String(r[3]), r[4]]; });
}

/** Undo a batch: its contacts become available again. */
function releaseBatch(batchId) {
  var user = guard_();
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var sh = usedSheet_();
    var n = sh.getLastRow() - 1;
    if (n > 0) {
      var keep = sh.getRange(2, 1, n, USED_HEADER.length).getValues().filter(function (r) { return r[0] !== batchId; });
      sh.getRange(2, 1, n, USED_HEADER.length).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, USED_HEADER.length).setValues(keep);
    }
    var bs = db_().getSheetByName(BATCHES_TAB);
    var ids = bs.getRange(1, 1, bs.getLastRow(), 1).getValues();
    for (var i = ids.length - 1; i >= 1; i--) if (ids[i][0] === batchId) bs.deleteRow(i + 1);
    log_(user, 'Released batch', batchId + ' — its contacts can be pulled again');
    return true;
  } finally {
    lock.releaseLock();
  }
}
