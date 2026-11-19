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
var BATCHES_HEADER = ['Batch ID', 'Batch name', 'Sheet', 'Tabs', 'Pulled', 'Created at', 'Created by', 'Audience'];
var USED_HEADER = ['Batch ID', 'Name', 'Email', 'Phone', 'Source tab', 'Sheet'];

/** Called from setup(): creates the tabs, the Used spreadsheet and the trigger. */
function setupSources_() {
  var ss = db_();
  [[SOURCES_TAB, SOURCES_HEADER], [BATCHES_TAB, BATCHES_HEADER]].forEach(function (t) {
    var sh = ss.getSheetByName(t[0]) || newNarrowSheet_(ss, t[0], t[1].length);
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
    trimSheet_(first, USED_HEADER.length);
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
        createdAt: r[5] ? new Date(r[5]).toISOString() : '', by: r[6], audience: r[7] || '' };
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

/** Read name / email / phone of the chosen tabs; each row tagged with its tab name. */
function readTabsRaw_(ss, tabs, tabNames) {
  var raw = [];
  tabs.forEach(function (t) {
    if (!t.cols || tabNames.indexOf(t.name) < 0) return;
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
  return raw;
}

/**
 * The standard clean-up used everywhere: duplicates, buyers / opt-outs /
 * reminder team, optional extra set (e.g. already used), internal test
 * emails and (optionally) rows without a phone. Returns { rows, steps }.
 */
function cleanStandard_(raw, phoneOnly, extra) {
  var steps = [{ label: 'Rows in selected tabs', count: raw.length, add: true }];
  var cleaned = cleanAndDedupe(raw, CONFIG.COUNTRY_CODE);
  steps.push({ label: 'Duplicates (same email or phone)', count: -cleaned.duplicates });
  steps.push({ label: 'No valid email or phone', count: -cleaned.invalid });
  var rows = cleaned.rows;
  readExclusions_().lists.forEach(function (l) {
    var res = removeMatching(rows, l.keys);
    steps.push({ label: l.label, count: -res.removed });
    rows = res.rows;
  });
  if (extra) {
    var ex = removeMatching(rows, extra.keys);
    steps.push({ label: extra.label, count: -ex.removed });
    rows = ex.rows;
  }
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
  return { rows: rows, steps: steps };
}

function buildPool_(sourceId, tabNames, phoneOnly) {
  var src = findSource_(sourceId);
  var raw = readTabsRaw_(SpreadsheetApp.openById(sourceId), src.tabs.filter(function (t) { return t.rows; }), tabNames);
  var res = cleanStandard_(raw, phoneOnly, { keys: readUsedKeys_(), label: 'Already used in earlier batches' });
  return { source: src, rows: res.rows, steps: res.steps };
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
    // 1. the audience copy (most likely step to fail, e.g. the 10-million-cell limit) — nothing is marked used yet
    var audience;
    try {
      audience = saveRowsAsAudience_(batchName, take, 'Lead sheets: ' + p.source.name + ' (batch ' + id + ')', user);
    } catch (e) {
      throw new Error('Could not save the batch (nothing was marked as used): ' + cellLimitHint_(e));
    }
    // 2. mark the contacts as used — if this fails, the audience copy is removed again
    var used = usedSheet_();
    var data = take.map(function (r) { return [id, r[0], r[1], r[2], r[3], p.source.name]; });
    var startRow = used.getLastRow() + 1;
    try {
      ensureRows_(used, used.getLastRow() + data.length);
      used.getRange(startRow, 1, data.length, USED_HEADER.length).setNumberFormat('@').setValues(data);
    } catch (e) {
      deleteAudience_(audience);
      if (used.getLastRow() >= startRow) used.getRange(startRow, 1, used.getLastRow() - startRow + 1, USED_HEADER.length).clearContent();
      throw new Error('Could not mark the contacts as used (nothing was saved): ' + cellLimitHint_(e));
    }
    var bs = db_().getSheetByName(BATCHES_TAB);
    if (!bs.getRange(1, 8).getValue()) bs.getRange(1, 8).setValue('Audience');
    bs.appendRow([id, batchName, p.source.name,
      tabNames.length + ' tab' + (tabNames.length > 1 ? 's' : ''), take.length, new Date(), user, audience]);
    log_(user, 'Pulled batch', batchName + ': ' + take.length + ' contacts from ' + p.source.name + ' — saved as audience "' + audience + '"');
    return { id: id, name: batchName, pulled: take.length, available: p.rows.length, steps: p.steps,
      perTab: perTab_(take), rows: take, audience: audience };
  } finally {
    lock.releaseLock();
  }
}

/** Contacts of an earlier batch, for re-download. */
function getBatchRows(batchId) {
  guard_();
  return batchRows_(batchId);
}

function batchRows_(batchId) {
  var sh = usedSheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, USED_HEADER.length).getValues()
    .filter(function (r) { return r[0] === batchId; })
    .map(function (r) { return [r[1], r[2], String(r[3]), r[4]]; });
}

/** Row number (1-based) of a batch in the _Batches tab, or -1. */
function batchRow_(batchId) {
  var bs = db_().getSheetByName(BATCHES_TAB);
  var ids = bs.getRange(1, 1, bs.getLastRow(), 1).getValues();
  for (var i = 1; i < ids.length; i++) if (ids[i][0] === batchId) return i + 1;
  return -1;
}

/** For batches pulled before batches were saved as audiences: add one now. */
function addBatchToAudiences(batchId) {
  var user = guard_();
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var row = batchRow_(batchId);
    if (row < 0) throw new Error('Batch not found.');
    var bs = db_().getSheetByName(BATCHES_TAB);
    var r = bs.getRange(row, 1, 1, BATCHES_HEADER.length).getValues()[0];
    if (r[7] && findMetaRow_(r[7]) > 0) return { audience: r[7] };
    var rows = batchRows_(batchId);
    if (!rows.length) throw new Error('This batch has no contacts left to save.');
    var audience = saveRowsAsAudience_(r[1], rows, 'Lead sheets: ' + r[2] + ' (batch ' + batchId + ')', user);
    if (!bs.getRange(1, 8).getValue()) bs.getRange(1, 8).setValue('Audience');
    bs.getRange(row, 8).setValue(audience);
    log_(user, 'Saved batch as audience', r[1] + ' → "' + audience + '" (' + rows.length + ')');
    return { audience: audience };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Save every pulled batch that is not on the Audiences page yet.
 * Reads the Used-leads sheet once. Can be run from the editor or the page.
 */
function addAllBatchesToAudiences() {
  var user = guard_();
  var lock = LockService.getScriptLock();
  lock.waitLock(300000);
  try {
    var bs = db_().getSheetByName(BATCHES_TAB);
    if (!bs || bs.getLastRow() < 2) return { added: [] };
    var batches = bs.getRange(2, 1, bs.getLastRow() - 1, BATCHES_HEADER.length).getValues();
    var missing = [];
    batches.forEach(function (r, i) {
      if (r[0] && !(r[7] && findMetaRow_(r[7]) > 0)) missing.push({ row: i + 2, r: r });
    });
    if (!missing.length) return { added: [] };
    // contacts of all batches in one read
    var used = usedSheet_(), n = used.getLastRow() - 1, byBatch = {};
    if (n > 0) used.getRange(2, 1, n, USED_HEADER.length).getValues().forEach(function (u) {
      (byBatch[u[0]] = byBatch[u[0]] || []).push([u[1], u[2], String(u[3]), u[4]]);
    });
    if (!bs.getRange(1, 8).getValue()) bs.getRange(1, 8).setValue('Audience');
    var added = [];
    missing.forEach(function (m) {
      var rows = byBatch[m.r[0]] || [];
      if (!rows.length) return;
      var audience = saveRowsAsAudience_(m.r[1], rows, 'Lead sheets: ' + m.r[2] + ' (batch ' + m.r[0] + ')', user);
      bs.getRange(m.row, 8).setValue(audience);
      added.push(audience);
    });
    if (added.length) log_(user, 'Saved batches as audiences', added.length + ': ' + added.join(', '));
    return { added: added };
  } finally {
    lock.releaseLock();
  }
}

function cellLimitHint_(e) {
  var msg = String(e && e.message || e);
  return /cells|limit/i.test(msg) ? msg + ' — run repairStorage() once from the Apps Script editor to free space.' : msg;
}

/**
 * One-time clean-up (run from the editor):
 *  - trims every tab of the data sheet and the Used-leads sheet to the columns /
 *    rows it actually uses (Google counts empty cells towards the 10M limit);
 *  - deletes leftover EMPTY tabs that no audience uses (failed uploads/pulls);
 *  - lists contacts marked as used by a batch that never finished, as a batch
 *    named "Unfinished pull …" so it can be released or added to Audiences.
 * Nothing with data is deleted.
 */
function repairStorage() {
  var user = guard_();
  var lock = LockService.getScriptLock();
  lock.waitLock(300000);
  try {
    var ss = db_(), report = { cellsBefore: 0, cellsAfter: 0, emptyTabsDeleted: [], unfinishedBatches: [] };
    var metaNames = {};
    readMeta_().forEach(function (r) { metaNames[r[M.NAME]] = true; });
    var cells = function (sh) { return sh.getMaxRows() * sh.getMaxColumns(); };
    ss.getSheets().forEach(function (sh) { report.cellsBefore += cells(sh); });
    ss.getSheets().forEach(function (sh) {
      var name = sh.getName(), system = name.charAt(0) === '_' && name.indexOf(STAGING_PREFIX) !== 0;
      if (!system && !metaNames[name] && sh.getLastRow() <= 1 && ss.getSheets().length > 1) {
        ss.deleteSheet(sh); report.emptyTabsDeleted.push(name); return;
      }
      var cols = name === META_TAB ? META_HEADER.length : name === BATCHES_TAB ? BATCHES_HEADER.length
        : name === SOURCES_TAB ? SOURCES_HEADER.length : name === LOG_TAB ? 4 : metaNames[name] ? 3 : 0;
      trimSheet_(sh, cols);
    });
    ss.getSheets().forEach(function (sh) { report.cellsAfter += cells(sh); });

    var used = usedSheet_();
    trimSheet_(used, USED_HEADER.length);
    // contacts of pulls that never finished (no row in _Batches)
    var bs = ss.getSheetByName(BATCHES_TAB), known = {};
    if (bs.getLastRow() > 1) bs.getRange(2, 1, bs.getLastRow() - 1, 1).getValues().forEach(function (r) { known[r[0]] = true; });
    var n = used.getLastRow() - 1, orphan = {};
    if (n > 0) used.getRange(2, 1, n, USED_HEADER.length).getValues().forEach(function (u) {
      if (u[0] && !known[u[0]]) { var o = orphan[u[0]] = orphan[u[0]] || { count: 0, sheet: u[5] }; o.count++; }
    });
    Object.keys(orphan).forEach(function (id) {
      var name = 'Unfinished pull ' + id;
      bs.appendRow([id, name, orphan[id].sheet, '', orphan[id].count, new Date(), user, '']);
      report.unfinishedBatches.push(name + ' (' + orphan[id].count + ' contacts)');
    });
    log_(user, 'Repaired storage', 'cells ' + report.cellsBefore + ' → ' + report.cellsAfter + '; empty tabs deleted: ' +
      report.emptyTabsDeleted.length + '; unfinished pulls found: ' + report.unfinishedBatches.length);
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  } finally {
    lock.releaseLock();
  }
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
    var bs = db_().getSheetByName(BATCHES_TAB), removedAudience = '';
    var row = batchRow_(batchId);
    if (row > 0) {
      var aud = bs.getRange(row, 8).getValue();
      // the batch was never sent, so its audience copy goes too
      if (aud && deleteAudience_(aud)) removedAudience = aud;
      bs.deleteRow(row);
    }
    log_(user, 'Released batch', batchId + ' — its contacts can be pulled again' +
      (removedAudience ? '; audience "' + removedAudience + '" removed' : ''));
    return true;
  } finally {
    lock.releaseLock();
  }
}
