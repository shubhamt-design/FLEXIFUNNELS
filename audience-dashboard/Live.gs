/**
 * Audience Dashboard — live sessions.
 *
 * Reads the session tabs of CONFIG.LIVE_SHEET_ID (e.g. "August 2026 UTM")
 * directly, every time, so lists always include everyone registered so far.
 * Tabs of the same session (e.g. "... 10 Mins Busines" + "... 10 Mins Reg Team")
 * are grouped together. Nothing in that sheet is ever changed.
 */

/** Header position of each tab, remembered so the page opens quickly. */
function liveTabInfo_(ss, names) {
  var props = PropertiesService.getScriptProperties();
  var cache = JSON.parse(props.getProperty('LIVE_COLS') || '{}'), changed = false;
  var info = {};
  names.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var last = sh.getLastRow();
    var c = cache[name];
    if (!c && last > 0) {
      var top = sh.getRange(1, 1, Math.min(10, last), Math.min(Math.max(sh.getLastColumn(), 1), 40)).getValues();
      var head = findHeader(top);
      if (head) c = { cols: head.cols, start: head.row + 2 };
      else { var sn = sniffColumns(top); if (sn) c = { cols: sn, start: 1 }; }
      if (c) { cache[name] = c; changed = true; } // empty / non-contact tabs are checked again next time
    }
    info[name] = { name: name, last: last, cols: c ? c.cols : null, start: c ? c.start : 1,
      rows: c ? Math.max(0, last - c.start + 1) : 0 };
  });
  if (changed) props.setProperty('LIVE_COLS', JSON.stringify(cache));
  return info;
}

/** Sessions (newest first) with live row counts. */
function getLiveSessions() {
  guard_();
  var ss = SpreadsheetApp.openById(CONFIG.LIVE_SHEET_ID);
  var names = ss.getSheets().map(function (s) { return s.getName(); });
  var info = liveTabInfo_(ss, names);
  var g = groupSessions(names, new Date().getFullYear());
  var sessions = g.sessions.map(function (s, i) {
    return { key: s.key, date: s.date, time: s.time, title: s.title,
      tabs: s.tabs.map(function (t) {
        var x = info[t.name] || {};
        var out = { name: t.name, label: t.label, rows: x.rows || 0, usable: !!x.cols };
        // latest registration time for the newest sessions (first column is the timestamp)
        if (i < 6 && x.cols && x.rows) out.lastEntry = ss.getSheetByName(t.name).getRange(x.last, 1).getDisplayValue();
        return out;
      }) };
  }).filter(function (s) { return s.tabs.some(function (t) { return t.usable; }); });
  var other = g.other.map(function (n) { var x = info[n] || {}; return { name: n, rows: x.rows || 0, usable: !!x.cols }; })
    .filter(function (t) { return t.usable && t.rows; });
  return { sheetName: ss.getName(), sheetUrl: ss.getUrl(), checkedAt: new Date().toISOString(),
    sessions: sessions, other: other };
}

/** Everyone in the chosen tabs right now, combined and cleaned. */
function getLiveList(tabNames, phoneOnly) {
  guard_();
  if (!tabNames || !tabNames.length) throw new Error('Tick at least one tab.');
  var ss = SpreadsheetApp.openById(CONFIG.LIVE_SHEET_ID);
  var info = liveTabInfo_(ss, tabNames);
  var tabs = tabNames.map(function (n) { return info[n]; }).filter(function (t) { return t && t.cols; });
  var res = cleanStandard_(readTabsRaw_(ss, tabs, tabNames), phoneOnly);
  var perTab = {};
  res.rows.forEach(function (r) { perTab[r[3]] = (perTab[r[3]] || 0) + 1; });
  return { steps: res.steps, final: res.rows.length, perTab: perTab, rows: res.rows, at: new Date().toISOString() };
}
