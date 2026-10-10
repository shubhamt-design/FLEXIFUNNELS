/**
 * Audience Dashboard — part 2 of the server code (lists, buyers, helpers).
 * Lives next to Code.gs and Logic.gs; all three share one global scope.
 */

/* ------------------------------------------------------------------ */
/* Build a broadcast list: main audience − selected audiences − buyers */
/* ------------------------------------------------------------------ */

function buildList(base, subtract, phoneOnly) {
  guard_();
  return buildList_(base, subtract, phoneOnly);
}

function buildList_(base, subtract, phoneOnly) {
  var rows = readAudience_(base);
  var steps = [{ label: base, count: rows.length }];
  var exclude = new Set();
  (subtract || []).forEach(function (n) {
    if (n !== base) keySetOf(readAudience_(n), exclude);
  });
  var afterSub = removeMatching(rows, exclude);
  if ((subtract || []).length) steps.push({ label: 'Already in selected audiences', count: -afterSub.removed });
  var afterBuyers = removeMatching(afterSub.rows, readBuyerKeys_());
  steps.push({ label: 'Buyers', count: -afterBuyers.removed });
  var result = afterBuyers.rows;
  if (phoneOnly) {
    var withPhone = result.filter(function (r) { return r[2]; });
    steps.push({ label: 'No phone number', count: -(result.length - withPhone.length) });
    result = withPhone;
  }
  return { base: base, subtract: subtract || [], phoneOnly: !!phoneOnly, steps: steps,
    final: result.length, rows: result };
}

/** Save a built list as a new audience so it can be subtracted later. */
function saveListAsAudience(newName, base, subtract, phoneOnly) {
  var user = guard_();
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    newName = checkNewName_(newName);
    var built = buildList_(base, subtract, phoneOnly);
    writeAudienceTab_(newName, built.rows);
    var source = 'Built from ' + base + (built.subtract.length ? ' minus ' + built.subtract.join(', ') : '');
    db_().getSheetByName(META_TAB).appendRow([newName, built.rows.length, countPhones_(built.rows),
      built.steps[0].count, 0, 0, 0, source, new Date(), user]);
    log_(user, 'Saved list as audience', newName + ' (' + built.rows.length + ') — ' + source);
    return { name: newName, saved: built.rows.length };
  } finally {
    lock.releaseLock();
  }
}

function getAudienceRows(name) {
  guard_();
  return readAudience_(name);
}

function deleteAudience(name) {
  var user = guard_();
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    var ss = db_();
    var meta = ss.getSheetByName(META_TAB);
    var rowIdx = findMetaRow_(name);
    if (rowIdx < 0) throw new Error('Audience not found: ' + name);
    meta.deleteRow(rowIdx);
    var tab = ss.getSheetByName(name);
    if (tab) ss.deleteSheet(tab);
    log_(user, 'Deleted audience', name);
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Buyers                                                              */
/* ------------------------------------------------------------------ */

function syncBuyersNow() {
  guard_();
  return syncBuyers();
}

/** Hourly trigger: remove every buyer from every saved audience. */
function syncBuyers() {
  var lock = LockService.getScriptLock();
  lock.waitLock(120000);
  try {
    var buyers = readBuyerKeys_();
    var ss = db_();
    var meta = ss.getSheetByName(META_TAB);
    var metaRows = readMeta_();
    var total = 0, details = [];
    metaRows.forEach(function (r, i) {
      var name = r[M.NAME];
      var rows = readAudience_(name);
      var res = removeMatching(rows, buyers);
      if (!res.removed) return;
      writeAudienceTab_(name, res.rows, true);
      var metaRow = i + 2;
      meta.getRange(metaRow, M.CONTACTS + 1, 1, 2).setValues([[res.rows.length, countPhones_(res.rows)]]);
      meta.getRange(metaRow, M.BUYERS + 1).setValue((+r[M.BUYERS] || 0) + res.removed);
      total += res.removed;
      details.push(name + ' −' + res.removed);
    });
    var props = PropertiesService.getScriptProperties();
    props.setProperty('LAST_SYNC', new Date().toISOString());
    props.setProperty('BUYER_COUNT', String(buyers.buyerCount));
    if (total) log_('auto-sync', 'Removed new buyers', total + ' removed: ' + details.join(', '));
    return { removed: total, buyers: buyers.buyerCount, details: details };
  } finally {
    lock.releaseLock();
  }
}

function readBuyerKeys_() {
  var ss = SpreadsheetApp.openById(CONFIG.BUYERS_SHEET_ID);
  var sh = CONFIG.BUYERS_TAB_NAME ? ss.getSheetByName(CONFIG.BUYERS_TAB_NAME) : ss.getSheets()[0];
  var values = sh.getDataRange().getValues();
  if (!values.length) { var empty = new Set(); empty.buyerCount = 0; return empty; }
  var cols = detectColumns(values[0]);
  if (cols.email < 0 && cols.phone < 0) cols = { name: 0, email: 1, phone: 2 }; // no header row
  else values = values.slice(1);
  var cleaned = cleanAndDedupe(pickColumns(values, cols), CONFIG.COUNTRY_CODE);
  var set = keySetOf(cleaned.rows);
  set.buyerCount = cleaned.rows.length;
  return set;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function db_() {
  var id = PropertiesService.getScriptProperties().getProperty('DB_ID');
  if (!id) throw new Error('Run setup() once from the Apps Script editor first.');
  return SpreadsheetApp.openById(id);
}

function readMeta_() {
  var sh = db_().getSheetByName(META_TAB);
  var n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, META_HEADER.length).getValues() : [];
}

function findMetaRow_(name) {
  var rows = readMeta_();
  for (var i = 0; i < rows.length; i++) if (rows[i][M.NAME] === name) return i + 2;
  return -1;
}

function readAudience_(name) {
  if (findMetaRow_(name) < 0) throw new Error('Audience not found: ' + name);
  var sh = db_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .map(function (r) { return [str_(r[0]), str_(r[1]), str_(r[2])]; });
}

function writeAudienceTab_(name, rows, replace) {
  var ss = db_();
  var sh = ss.getSheetByName(name);
  if (sh && !replace) throw new Error('A tab named "' + name + '" already exists.');
  if (!sh) sh = ss.insertSheet(name);
  sh.clearContents();
  sh.getRange('A:C').setNumberFormat('@');
  var data = [['Name', 'Email', 'Phone']].concat(rows);
  ensureRows_(sh, data.length);
  sh.getRange(1, 1, data.length, 3).setValues(data);
  sh.setFrozenRows(1);
  // Trim spare rows so big audiences don't waste the sheet's cell limit.
  var extra = sh.getMaxRows() - data.length;
  if (extra > 10) sh.deleteRows(data.length + 1, extra - 10);
}

/** New tabs have 1,000 rows; writing past the end throws, so grow first. */
function ensureRows_(sh, needed) {
  var max = sh.getMaxRows();
  if (needed > max) sh.insertRowsAfter(max, needed - max);
}

function checkNewName_(name) {
  name = String(name || '').replace(/[\[\]\*\?\/\\:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) throw new Error('Please give the audience a name.');
  if (name.length > 90) throw new Error('Name is too long (max 90 characters).');
  if (name.charAt(0) === '_') throw new Error('Name cannot start with "_".');
  var lower = name.toLowerCase();
  var clash = readMeta_().some(function (r) { return String(r[M.NAME]).toLowerCase() === lower; }) ||
    db_().getSheets().some(function (s) { return s.getName().toLowerCase() === lower; });
  if (clash) throw new Error('An audience called "' + name + '" already exists. Pick another name.');
  return name;
}

function countPhones_(rows) {
  var n = 0;
  for (var i = 0; i < rows.length; i++) if (rows[i][2]) n++;
  return n;
}

function str_(v) {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? v.toFixed(0) : String(v);
  return String(v).trim();
}

function log_(user, action, details) {
  db_().getSheetByName(LOG_TAB).appendRow([new Date(), user, action, details]);
}
