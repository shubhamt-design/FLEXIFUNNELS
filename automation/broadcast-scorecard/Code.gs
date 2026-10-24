/**
 * Webinar Broadcast Scorecard — team web app.
 *
 * Serves Index.html and hands it the two tabs of the AiSensy Broadcast
 * Analytics sheet. The page does all the analysis in the browser.
 *
 * Deploy: Deploy → New deployment → Web app, Execute as "Me",
 * Who has access "Anyone within FlexiFunnels". Viewers then need no
 * access to the sheet itself: the script reads it as the deployer.
 */

var SHEET_ID = '1jXnQPQngi-FbEBBHC0tvaOTXxmtE5_miv6Mq0rTbmLQ';
var TABS = { analysis: 'Broadcast Analysis', contents: 'Broadcast Contents' };
var CACHE_SECONDS = 300;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Webinar Broadcast Scorecard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Called by the page. Returns both tabs as text, exactly as the sheet shows them. */
function getDashboardData() {
  var cache = CacheService.getScriptCache();
  var cached = readCache_(cache);
  if (cached) return cached;

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var data = { fetchedAt: new Date().toISOString() };
  Object.keys(TABS).forEach(function (key) {
    var sheet = ss.getSheetByName(TABS[key]);
    if (!sheet) throw new Error('The sheet has no tab called "' + TABS[key] + '".');
    data[key] = sheet.getDataRange().getDisplayValues();
  });
  writeCache_(cache, data);
  return data;
}

// The payload is larger than one cache entry (100 KB), so it is split into chunks.
function readCache_(cache) {
  try {
    var meta = cache.get('scorecard:n');
    if (!meta) return null;
    var keys = [];
    for (var i = 0; i < Number(meta); i++) keys.push('scorecard:' + i);
    var parts = cache.getAll(keys);
    var json = keys.map(function (k) { return parts[k]; });
    if (json.some(function (p) { return p === undefined || p === null; })) return null;
    return JSON.parse(json.join(''));
  } catch (e) {
    return null;
  }
}

function writeCache_(cache, data) {
  try {
    var json = JSON.stringify(data), size = 90000, entries = {}, n = 0;
    for (var i = 0; i < json.length; i += size) entries['scorecard:' + n++] = json.slice(i, i + size);
    entries['scorecard:n'] = String(n);
    cache.putAll(entries, CACHE_SECONDS);
  } catch (e) {
    // Caching is only a speed-up; ignore failures.
  }
}
