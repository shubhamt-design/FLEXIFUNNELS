/**
 * Audience Dashboard — Google Apps Script web app.
 *
 * Storage = the Google Sheet this script is attached to:
 *   _Audiences   one row per saved audience (name, counts, who/when)
 *   _Log         activity log
 *   <audience>   one tab per audience: Name | Email | Phone
 *
 * "Do-not-contact" sheets (buyers, opt-outs …) in CONFIG.EXCLUDE_SHEETS are read
 * live. syncBuyers() runs every hour (installed by setup()) and removes
 * anyone on those sheets from every saved audience.
 */

var CONFIG = {
  // People on these sheets are ALWAYS removed (matched by email OR phone).
  // tab: '' = first tab. Add more sheets by adding lines.
  EXCLUDE_SHEETS: [
    { label: 'Buyers', id: '186D8fAoGI0TiIUfyUroZsmYmeuBWha_Rh9QNBnvbzkk', tab: '' },
    { label: 'Opted-out', id: '16hkr4NXxfPq77CpqAco6Zbn94szx-PJm0OrSHELNTdY', tab: '' },
    { label: 'Removed by reminder team', id: '1mp_Qv9l3iGqFD6c95AU2a4GaZrEpssFK6TYAjShEH7M', tab: '' }
  ],
  ALLOWED_DOMAIN: 'flexifunnels.com',  // only these emails can use the dashboard
  COUNTRY_CODE: '91',                  // added to 10-digit numbers
  SOURCE_SEARCH: 'UTM',                // lead sheets: every spreadsheet with this in its name
  IGNORE_EMAIL_DOMAINS: ['flexifunnels.com'], // test / staff entries skipped when pulling leads
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
  setupSources_();
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

/** Lets Index.html pull in other HTML files: <?!= include('LeadsUI') ?> */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
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
      sources: JSON.parse(props.getProperty('EXCLUDE_SOURCES') || '[]')
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
    var noBuyers = removeMatching(cleaned.rows, readExclusions_().all);
    writeAudienceTab_(name, noBuyers.rows);

    var stats = {
      name: name, uploaded: raw.length, duplicates: cleaned.duplicates, invalid: cleaned.invalid,
      buyers: noBuyers.removed, saved: noBuyers.rows.length, withPhone: countPhones_(noBuyers.rows)
    };
    ss.getSheetByName(META_TAB).appendRow([name, stats.saved, stats.withPhone, stats.uploaded,
      stats.duplicates, stats.invalid, stats.buyers, source || '', new Date(), user]);
    log_(user, 'Uploaded audience', name + ': ' + stats.uploaded + ' rows → ' + stats.saved +
      ' saved (' + stats.duplicates + ' duplicates, ' + stats.invalid + ' invalid, ' + stats.buyers + ' buyers/opt-outs removed)');
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

