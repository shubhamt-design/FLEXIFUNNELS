/**
 * Flexi Genie weekly workshop: create the two registration tabs.
 *
 * Paste this file into the SAME Apps Script project that serves the
 * registration webhook (the one whose web-app URL is WEBHOOK_BASE below).
 * You do not need to redeploy the web app: this code runs on a timer,
 * and your existing doPost stays exactly as it is.
 *
 * What it does, every 15 minutes:
 *   For each row in the "Automation Inputs" sheet that has both tab names
 *   filled in but no webhooks yet, it
 *     1. creates the two tabs in the master spreadsheet (or reuses a tab
 *        that already has that exact name),
 *     2. copies the header row from last week's tab so the columns match,
 *     3. writes each tab's webhook (WEBHOOK_BASE + "?gid=<tab id>") back
 *        into columns G and H, and "Tabs ready" into column I.
 *
 * The weekly Claude run then reads columns G and H and pastes them into
 * the forms on /funnel-agent and /flexi-genie-regteam.
 *
 * One-time setup: fill in the constants, then run installTrigger() once
 * from the editor and approve the permissions prompt.
 */

// The "Flexi Genie Weekly Workshop – Automation Inputs" spreadsheet.
const CONFIG_SPREADSHEET_ID = '120U4NUfrQgW-THHAZNzy10hkHXD1qLuh0JSVTEh2xYs';

// The spreadsheet the webhook writes leads into. Leave blank if this
// script is bound to that spreadsheet (opened via Extensions > Apps Script).
const MASTER_SPREADSHEET_ID = '';

// The registration web-app URL, without any ?gid=.
const WEBHOOK_BASE =
  'https://script.google.com/macros/s/AKfycbwgpHL_XO0vR5NcX2sNM2e1FseDW_Vx0WpW2uFhbhx5OlVRMLtarUask5NPjTbnyllj/exec';

// Header row to use when there is no earlier row to copy from.
const FALLBACK_HEADERS = [
  'timestamp', 'first_name', 'email', 'phone',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'utm_flow', 'path', 'source_url', 'datetime', 'profession',
];

// Columns in the inputs sheet (1-based).
const COL = {
  runDate: 1,
  tabFunnelAgent: 2,
  tabRegTeam: 3,
  webhookFunnelAgent: 7,
  webhookRegTeam: 8,
  status: 9,
};

function createPendingWeeklyTabs() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return;
  try {
    const inputs = SpreadsheetApp.openById(CONFIG_SPREADSHEET_ID).getSheets()[0];
    const master = MASTER_SPREADSHEET_ID
      ? SpreadsheetApp.openById(MASTER_SPREADSHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    if (!master) throw new Error('Set MASTER_SPREADSHEET_ID: this script is not bound to a spreadsheet.');

    const lastRow = inputs.getLastRow();
    if (lastRow < 2) return;
    const rows = inputs.getRange(2, 1, lastRow - 1, COL.status).getValues();

    rows.forEach(function (row, i) {
      const sheetRow = i + 2;
      const nameA = String(row[COL.tabFunnelAgent - 1]).trim();
      const nameB = String(row[COL.tabRegTeam - 1]).trim();
      const hookA = String(row[COL.webhookFunnelAgent - 1]).trim();
      const hookB = String(row[COL.webhookRegTeam - 1]).trim();
      if (!nameA || !nameB || (hookA && hookB)) return;

      try {
        const headers = headersFromPreviousRow_(master, rows, i);
        const gidA = ensureTab_(master, nameA, headers);
        const gidB = ensureTab_(master, nameB, headers);
        inputs.getRange(sheetRow, COL.webhookFunnelAgent).setValue(WEBHOOK_BASE + '?gid=' + gidA);
        inputs.getRange(sheetRow, COL.webhookRegTeam).setValue(WEBHOOK_BASE + '?gid=' + gidB);
        inputs.getRange(sheetRow, COL.status).setValue('Tabs ready ' + new Date().toISOString());
      } catch (err) {
        inputs.getRange(sheetRow, COL.status).setValue('ERROR: ' + err.message);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

// Returns the gid of the tab called `name`, creating it with `headers` if needed.
function ensureTab_(master, name, headers) {
  let tab = master.getSheetByName(name);
  if (!tab) {
    tab = master.insertSheet(name);
    tab.getRange(1, 1, 1, headers.length).setValues([headers]);
    tab.setFrozenRows(1);
  }
  return tab.getSheetId();
}

// Copies the header row of the most recent earlier row's /funnel-agent tab.
function headersFromPreviousRow_(master, rows, index) {
  for (let j = index - 1; j >= 0; j--) {
    const match = String(rows[j][COL.webhookFunnelAgent - 1]).match(/[?&]gid=(\d+)/);
    if (!match) continue;
    const tab = master.getSheets().filter(function (s) {
      return String(s.getSheetId()) === match[1];
    })[0];
    if (!tab || tab.getLastColumn() === 0) continue;
    const headers = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0];
    if (headers.some(function (h) { return String(h).trim(); })) return headers;
  }
  return FALLBACK_HEADERS;
}

function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'createPendingWeeklyTabs'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('createPendingWeeklyTabs').timeBased().everyMinutes(15).create();
}
