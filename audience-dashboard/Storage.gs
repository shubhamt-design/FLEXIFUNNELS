/**
 * Audience Dashboard — storage that never fills up.
 *
 * Google allows 10 million cells per spreadsheet and counts every cell of
 * every tab's grid. Audience tabs live in the main data sheet first; when it
 * gets close to the limit, a new spreadsheet "Audience Dashboard – Data 2"
 * (then 3, 4 …) is created automatically and new audiences go there. The
 * _Audiences list stays in the main sheet, so the dashboard still sees one
 * list of audiences; tabs are found in whichever spreadsheet holds them.
 */

var STORE_LIMIT = 9000000;    // start a new spreadsheet before Google's 10,000,000-cell limit
var STORE_MARGIN = 50000;     // room kept free for system tabs, logs, uploads in progress

/** IDs of all storage spreadsheets: the main data sheet first, then Data 2, 3 … */
function storeIds_() {
  var extra = JSON.parse(PropertiesService.getScriptProperties().getProperty('STORE_IDS') || '[]');
  return [db_().getId()].concat(extra);
}

/** Cells used by a spreadsheet (rows × columns of every tab), cached in a script property. */
function storeCells_(id, recount) {
  var props = PropertiesService.getScriptProperties(), key = 'CELLS_' + id;
  var cached = props.getProperty(key);
  if (cached && !recount) return +cached;
  var n = 0;
  SpreadsheetApp.openById(id).getSheets().forEach(function (sh) { n += sh.getMaxRows() * sh.getMaxColumns(); });
  props.setProperty(key, String(n));
  return n;
}

function addStoreCells_(id, delta) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CELLS_' + id, String(storeCells_(id) + delta));
}

/** The tab that holds an audience, in whichever storage spreadsheet it is (or null). */
function audienceSheet_(name) {
  var cache = CacheService.getScriptCache(), map = {};
  try { map = JSON.parse(cache.get('store_map') || '{}'); } catch (e) {}
  if (map[name]) {
    try { var hit = SpreadsheetApp.openById(map[name]).getSheetByName(name); if (hit) return hit; } catch (e) {}
  }
  var ids = storeIds_();
  for (var i = 0; i < ids.length; i++) {
    var sh = SpreadsheetApp.openById(ids[i]).getSheetByName(name);
    if (sh) {
      map[name] = ids[i];
      try { cache.put('store_map', JSON.stringify(map), 21600); } catch (e) {}
      return sh;
    }
  }
  return null;
}

/**
 * Spreadsheet to put a NEW audience of `rows` contacts in: the newest storage
 * spreadsheet if it has room, otherwise a freshly created "Data N".
 */
function storeForNew_(rows) {
  var need = (rows + 2) * 3 + STORE_MARGIN;
  var ids = storeIds_(), id = ids[ids.length - 1];
  if (storeCells_(id) + need <= STORE_LIMIT) return SpreadsheetApp.openById(id);
  if (storeCells_(id, true) + need <= STORE_LIMIT) return SpreadsheetApp.openById(id); // recount once to be sure
  var ss = SpreadsheetApp.create('Audience Dashboard – Data ' + (ids.length + 1));
  var props = PropertiesService.getScriptProperties();
  props.setProperty('STORE_IDS', JSON.stringify(ids.slice(1).concat([ss.getId()])));
  // a new spreadsheet starts with one empty "Sheet1" (26 × 1000): make it tiny
  var first = ss.getSheets()[0];
  first.setName('_info');
  first.getRange(1, 1).setValue('Audience tabs that did not fit in the main data sheet. Managed by the Audience Dashboard.');
  trimSheet_(first, 1);
  storeCells_(ss.getId(), true);
  try { log_('system', 'New storage sheet', ss.getName() + ' created because the previous one was nearly full'); } catch (e) {}
  return ss;
}

/** Quick summary for the Audiences page from cached counts: [{ n: 1, cells }, { n: 2, cells } …]. */
function storageSummary_() {
  var props = PropertiesService.getScriptProperties();
  return storeIds_().map(function (id, i) { return { n: i + 1, cells: +props.getProperty('CELLS_' + id) || 0 }; });
}

/** For the dashboard: how full each storage spreadsheet is (recounted). */
function getStorageStatus() {
  guard_();
  return storeIds_().map(function (id) {
    var ss = SpreadsheetApp.openById(id);
    return { name: ss.getName(), url: ss.getUrl(), cells: storeCells_(id, true), limit: 10000000 };
  });
}
