/**
 * Audience Dashboard — Google Apps Script web app.
 *
 * Storage = the Google Sheet this script is attached to:
 *   _Audiences   one row per saved audience (name, counts, who/when)
 *   _Log         activity log
 *   <audience>   one tab per audience: Name | Email | Phone
 *
 * Buyers are read live from CONFIG.BUYERS_SHEET_ID. syncBuyers() runs every
 * hour (installed by setup()) and removes new buyers from every audience.
 */

var CONFIG = {
  BUYERS_SHEET_ID: '186D8fAoGI0TiIUfyUroZsmYmeuBWha_Rh9QNBnvbzkk',
  BUYERS_TAB_NAME: '',                 // '' = first tab of the buyers sheet
  ALLOWED_DOMAIN: 'flexifunnels.com',  // only these emails can use the dashboard
  COUNTRY_CODE: '91',                  // added to 10-digit numbers
  APP_TITLE: 'Audience Dashboard'
};

var META_TAB = '_Audiences';
var LOG_TAB = '_Log';
var STAGING_PREFIX = '_upload_';
var META_HEADER = ['Name', 'Contacts', 'With phone', 'Uploaded rows', 'Duplicates removed',
  'Invalid removed', 'Buyers removed', 'Source', 'Created at', 'Created by'];
var M = { NAME: 0, CONTACTS: 1, PHONES: 2, UPLOADED: 3, DUPES: 4, INVALID: 5, BUYERS: 6,
  SOURCE: 7, CREATED: 8, BY: 9 };

/* ------------------------------------------------------------------ */
/* Setup — run once from the Apps Script editor                        */
/* ------------------------------------------------------------------ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('DB_ID', ss.getId());
  var meta = ss.getSheetByName(META_TAB) || ss.insertSheet(META_TAB);
  if (meta.getLastRow() === 0) meta.appendRow(META_HEADER);
  meta.setFrozenRows(1);
  var log = ss.getSheetByName(LOG_TAB) || ss.insertSheet(LOG_TAB);
  if (log.getLastRow() === 0) log.appendRow(['Time', 'User', 'Action', 'Details']);
  log.setFrozenRows(1);

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncBuyers') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncBuyers').timeBased().everyHours(1).create();

  syncBuyers();
  Logger.log('Setup done. Now deploy: Deploy → New deployment → Web app.');
}

/* ------------------------------------------------------------------ */
/* Web app                                                             */
/* ------------------------------------------------------------------ */

function doGet() {
  try {
    guard_();
  } catch (e) {
    return HtmlService.createHtmlOutput(
      '<p style="font:16px sans-serif;padding:40px">' + e.message + '</p>');
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(CONFIG.APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function guard_() {
  var email = (Session.getActiveUser().getEmail() || '').toLowerCase();
  if (CONFIG.ALLOWED_DOMAIN && !/@/.test(email)) {
    throw new Error('Please sign in with your @' + CONFIG.ALLOWED_DOMAIN + ' Google account.');
  }
  if (CONFIG.ALLOWED_DOMAIN && email.slice(-CONFIG.ALLOWED_DOMAIN.length - 1) !== '@' + CONFIG.ALLOWED_DOMAIN) {
    throw new Error('Access denied: only @' + CONFIG.ALLOWED_DOMAIN + ' accounts can use this dashboard.');
  }
  return email;
}

/** Everything the dashboard needs to draw itself. */
function getState() {
  var user = guard_();
  var props = PropertiesService.getScriptProperties();
  var audiences = readMeta_().map(function (r) {
    return {
      name: r[M.NAME], contacts: +r[M.CONTACTS] || 0, withPhone: +r[M.PHONES] || 0,
      uploaded: +r[M.UPLOADED] || 0, duplicates: +r[M.DUPES] || 0, invalid: +r[M.INVALID] || 0,
      buyersRemoved: +r[M.BUYERS] || 0, source: r[M.SOURCE],
      createdAt: r[M.CREATED] ? new Date(r[M.CREATED]).toISOString() : '', createdBy: r[M.BY]
    };
  });
  var logSheet = db_().getSheetByName(LOG_TAB);
  var n = Math.min(20, Math.max(0, logSheet.getLastRow() - 1));
  var log = n ? logSheet.getRange(logSheet.getLastRow() - n + 1, 1, n, 4).getValues().reverse()
    .map(function (r) { return { time: new Date(r[0]).toISOString(), user: r[1], action: r[2], details: r[3] }; }) : [];
  return {
    user: user,
    audiences: audiences,
    buyers: {
      count: +props.getProperty('BUYER_COUNT') || 0,
      lastSync: props.getProperty('LAST_SYNC') || '',
      sheetUrl: 'https://docs.google.com/spreadsheets/d/' + CONFIG.BUYERS_SHEET_ID + '/edit'
    },
    log: log,
    dbUrl: db_().getUrl()
  };
}

/* ------------------------------------------------------------------ */
/* Upload a new audience (sent from the browser in chunks)             */
/* ------------------------------------------------------------------ */

function startUpload(name) {
  guard_();
  name = checkNewName_(name);
  var tab = STAGING_PREFIX + Date.now() + '_' + Math.floor(Math.random() * 1000);
  var sh = db_().insertSheet(tab);
  sh.getRange('A:C').setNumberFormat('@');
  return tab;
}

function appendUpload(stagingTab, rows) {
  guard_();
  if (stagingTab.indexOf(STAGING_PREFIX) !== 0) throw new Error('Bad upload id');
  if (!rows || !rows.length) return 0;
  var sh = db_().getSheetByName(stagingTab);
  var clean = rows.map(function (r) { return [str_(r[0]), str_(r[1]), str_(r[2])]; });
  ensureRows_(sh, sh.getLastRow() + clean.length);
  sh.getRange(sh.getLastRow() + 1, 1, clean.length, 3).setValues(clean);
  return clean.length;
}

function finishUpload(stagingTab, name, source) {
  var user = guard_();
  if (stagingTab.indexOf(STAGING_PREFIX) !== 0) throw new Error('Bad upload id');
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  try {
    name = checkNewName_(name);
    var ss = db_();
    var staging = ss.getSheetByName(stagingTab);
    var raw = staging.getLastRow() ? staging.getRange(1, 1, staging.getLastRow(), 3).getValues() : [];
    ss.deleteSheet(staging);

    var cleaned = cleanAndDedupe(raw, CONFIG.COUNTRY_CODE);
    var noBuyers = removeMatching(cleaned.rows, readBuyerKeys_());
    writeAudienceTab_(name, noBuyers.rows);

    var stats = {
      name: name, uploaded: raw.length, duplicates: cleaned.duplicates, invalid: cleaned.invalid,
      buyers: noBuyers.removed, saved: noBuyers.rows.length, withPhone: countPhones_(noBuyers.rows)
    };
    ss.getSheetByName(META_TAB).appendRow([name, stats.saved, stats.withPhone, stats.uploaded,
      stats.duplicates, stats.invalid, stats.buyers, source || '', new Date(), user]);
    log_(user, 'Uploaded audience', name + ': ' + stats.uploaded + ' rows → ' + stats.saved +
      ' saved (' + stats.duplicates + ' duplicates, ' + stats.invalid + ' invalid, ' + stats.buyers + ' buyers removed)');
    return stats;
  } finally {
    lock.releaseLock();
  }
}

function cancelUpload(stagingTab) {
  guard_();
  if (stagingTab.indexOf(STAGING_PREFIX) !== 0) return;
  var sh = db_().getSheetByName(stagingTab);
  if (sh) db_().deleteSheet(sh);
}

/** Read a Google Sheet or CSV from a Drive link. Returns a 2-D array of text. */
function fetchDriveTable(url) {
  guard_();
  var m = String(url).match(/\/d\/([a-zA-Z0-9_-]{20,})/) || String(url).match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (!m) throw new Error('That does not look like a Google Drive / Sheets link.');
  var id = m[1];
  var file = DriveApp.getFileById(id);
  var mime = file.getMimeType();
  if (mime === MimeType.GOOGLE_SHEETS) {
    var ss = SpreadsheetApp.openById(id);
    var gid = (String(url).match(/[#&?]gid=(\d+)/) || [])[1];
    var sheet = ss.getSheets()[0];
    if (gid) ss.getSheets().forEach(function (s) { if (String(s.getSheetId()) === gid) sheet = s; });
    return { fileName: file.getName() + ' / ' + sheet.getName(), table: sheet.getDataRange().getDisplayValues() };
  }
  if (mime === MimeType.CSV || mime === MimeType.PLAIN_TEXT || /\.csv$/i.test(file.getName())) {
    return { fileName: file.getName(), table: Utilities.parseCsv(file.getBlob().getDataAsString()) };
  }
  throw new Error('This file is ' + mime + '. For Excel files, upload the file directly ' +
    'or open it in Google Sheets and paste that link.');
}

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
