/**
 * FlexiFunnels Broadcast Performance Dashboard
 *
 * Entry points: web app (doGet), spreadsheet menu (onOpen) and one-time setup
 * (setupSpreadsheet). Data access lives in Broadcasts.gs, settings in Config.gs.
 *
 * Works bound to a spreadsheet (Extensions → Apps Script) or standalone: for a
 * standalone project, set the script property SPREADSHEET_ID to the sheet's id.
 */

var APP_TITLE = 'FlexiFunnels Broadcast Dashboard';

var SHEETS = {
  DATA: 'Broadcast_Data',
  CAMPAIGNS: 'Campaigns',
  CONFIG: 'Dashboard_Config',
  HISTORY: 'Broadcast_History'
};

// Column order of Broadcast_Data. `key` is the field name used by the web app.
var BROADCAST_COLUMNS = [
  { key: 'id',            header: 'Broadcast ID' },
  { key: 'name',          header: 'Broadcast Name' },
  { key: 'campaign',      header: 'Campaign Name' },
  { key: 'date',          header: 'Broadcast Date',     format: '@' },
  { key: 'time',          header: 'Broadcast Time',     format: '@' },
  { key: 'type',          header: 'Broadcast Type' },
  { key: 'segment',       header: 'Audience Segment' },
  { key: 'channel',       header: 'Channel' },
  { key: 'message',       header: 'Message Content' },
  { key: 'status',        header: 'Status' },
  { key: 'audience',      header: 'Audience Size',      format: '#,##0' },
  { key: 'sent',          header: 'Messages Sent',      format: '#,##0' },
  { key: 'delivered',     header: 'Messages Delivered', format: '#,##0' },
  { key: 'clicks',        header: 'Clicks',             format: '#,##0' },
  { key: 'shares',        header: 'Shares / Retweets',  format: '#,##0' },
  { key: 'conversions',   header: 'Conversions',        format: '#,##0' },
  { key: 'revenue',       header: 'Revenue',            format: '#,##0.00' },
  { key: 'cost',          header: 'Total Cost',         format: '#,##0.00' },
  { key: 'currency',      header: 'Currency' },
  { key: 'notes',         header: 'Notes' },
  { key: 'createdAt',     header: 'Created At',         format: 'yyyy-mm-dd hh:mm:ss' },
  { key: 'createdBy',     header: 'Created By' },
  { key: 'updatedAt',     header: 'Updated At',         format: 'yyyy-mm-dd hh:mm:ss' },
  { key: 'updatedBy',     header: 'Updated By' },
  { key: 'version',       header: 'Version',            format: '0' }
];

var CAMPAIGN_COLUMNS = [
  { key: 'name',      header: 'Campaign Name' },
  { key: 'category',  header: 'Category' },
  { key: 'startDate', header: 'Start Date', format: '@' },
  { key: 'endDate',   header: 'End Date',   format: '@' },
  { key: 'objective', header: 'Objective' },
  { key: 'notes',     header: 'Notes' },
  { key: 'createdAt', header: 'Created At', format: 'yyyy-mm-dd hh:mm:ss' },
  { key: 'updatedAt', header: 'Updated At', format: 'yyyy-mm-dd hh:mm:ss' }
];

var HISTORY_COLUMNS = [
  { key: 'timestamp', header: 'Timestamp', format: 'yyyy-mm-dd hh:mm:ss' },
  { key: 'id',        header: 'Broadcast ID' },
  { key: 'action',    header: 'Action' },
  { key: 'user',      header: 'Changed By' },
  { key: 'version',   header: 'Version' },
  { key: 'changes',   header: 'Changes (field: old → new)' },
  { key: 'snapshot',  header: 'Previous Record (JSON)' }
];

var CONFIG_HEADERS = ['Setting', 'Value', 'Notes'];

// ---------------------------------------------------------------------------
// Web app & menu
// ---------------------------------------------------------------------------

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Used by Index.html to inline Styles.html and App.html. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Broadcast Dashboard')
    .addItem('Set up / repair sheets', 'setupSpreadsheet')
    .addItem('Open dashboard', 'openDashboardDialog')
    .addToUi();
}

function openDashboardDialog() {
  var url = ScriptApp.getService().getUrl();
  var html;
  if (url) {
    html = '<p style="font-family:sans-serif">Open the dashboard: <a href="' + url +
      '" target="_blank">' + url + '</a></p>';
  } else {
    html = '<p style="font-family:sans-serif">The web app is not deployed yet. In the Apps Script ' +
      'editor choose <b>Deploy → New deployment → Web app</b>, then try again.</p>';
  }
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(520).setHeight(120), APP_TITLE);
}

// ---------------------------------------------------------------------------
// Spreadsheet access & setup
// ---------------------------------------------------------------------------

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No spreadsheet found. Bind this script to a Google Sheet, or set the ' +
      'SPREADSHEET_ID script property.');
  }
  return ss;
}

function getSheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet "' + name + '" is missing. Run "Set up / repair sheets" from the ' +
      'Broadcast Dashboard menu.');
  }
  return sheet;
}

/**
 * Creates any missing sheets and headers. Safe to run repeatedly: existing
 * data is never touched, and missing header columns are appended at the end.
 */
function setupSpreadsheet() {
  var ss = getSpreadsheet_();
  ensureSheet_(ss, SHEETS.DATA, BROADCAST_COLUMNS);
  ensureSheet_(ss, SHEETS.CAMPAIGNS, CAMPAIGN_COLUMNS);
  ensureSheet_(ss, SHEETS.HISTORY, HISTORY_COLUMNS);

  var configSheet = ensureSheet_(ss, SHEETS.CONFIG,
    CONFIG_HEADERS.map(function (h) { return { header: h }; }));
  if (configSheet.getLastRow() < 2) {
    var rows = getDefaultConfigRows_();
    configSheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }

  var message = 'Sheets are ready: ' + [SHEETS.DATA, SHEETS.CAMPAIGNS, SHEETS.CONFIG,
    SHEETS.HISTORY].join(', ') + '.';
  try {
    SpreadsheetApp.getUi().alert(APP_TITLE, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // No UI when run from the editor or the web app.
    Logger.log(message);
  }
  return message;
}

function ensureSheet_(ss, name, columns) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var lastCol = sheet.getLastColumn();
  var existing = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var missing = columns.filter(function (c) { return existing.indexOf(c.header) === -1; });

  if (missing.length) {
    var startCol = existing.filter(String).length + 1;
    sheet.getRange(1, startCol, 1, missing.length)
      .setValues([missing.map(function (c) { return c.header; })]);
  }

  var width = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setBackground('#1f3b63')
    .setFontColor('#ffffff')
    .setWrap(true);
  sheet.setFrozenRows(1);

  // Column formats keep dates/times as plain text so they round-trip exactly.
  var headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  columns.forEach(function (c) {
    if (!c.format) return;
    var col = headers.indexOf(c.header) + 1;
    if (col > 0) sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setNumberFormat(c.format);
  });
  return sheet;
}
