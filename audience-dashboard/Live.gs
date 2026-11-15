/**
 * Audience Dashboard — live sessions + past webinar lists.
 *
 * LIVE: session tabs of each sheet in CONFIG.LIVE_SHEETS ("August 2026 UTM",
 *   "Sakshi 10 Min Data Sheet"), grouped by session
 *   (e.g. "... 10 Mins Busines" + "... 10 Mins Reg Team").
 * PAST: tabs of CONFIG.PAST_SHEET_ID ("Active Campaign List Upload 11 - 2026"),
 *   grouped by date (attended / pitch / non-pitch / missed).
 * Both are read at the moment a list is built, so nothing is ever out of date.
 * Nothing in those sheets is changed.
 */

/** Spreadsheet ID for a source key: 'past', a CONFIG.LIVE_SHEETS key, or 'live' (= the first live sheet). */
function sheetIdFor_(src) {
  if (src === 'past') return CONFIG.PAST_SHEET_ID;
  var live = CONFIG.LIVE_SHEETS.filter(function (s) { return s.key === src; })[0] || (src === 'live' ? CONFIG.LIVE_SHEETS[0] : null);
  if (!live) throw new Error('Unknown sheet: ' + src);
  return live.id;
}

/** The live sheets, for the switch on the Live sessions page. */
function getLiveSources() {
  guard_();
  return CONFIG.LIVE_SHEETS.map(function (s) { return { key: s.key, label: s.label }; });
}

/** Header position + row count of each tab. Header positions are cached for 6 h. */
function tabInfo_(ss, names) {
  var cache = CacheService.getScriptCache(), key = 'cols_' + ss.getId();
  var known = JSON.parse(cache.get(key) || '{}'), changed = false;
  var info = {};
  names.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var last = sh.getLastRow();
    var c = known[name];
    if (!c && last > 0) {
      var top = sh.getRange(1, 1, Math.min(10, last), Math.min(Math.max(sh.getLastColumn(), 1), 40)).getValues();
      var head = findHeader(top);
      if (head) c = { c: head.cols, s: head.row + 2 };
      else { var sn = sniffColumns(top); if (sn) c = { c: sn, s: 1 }; }
      if (c) { known[name] = c; changed = true; } // empty / non-contact tabs are checked again next time
    }
    info[name] = { name: name, last: last, cols: c ? c.c : null, start: c ? c.s : 1,
      rows: c ? Math.max(0, last - c.s + 1) : 0 };
  });
  if (changed) {
    try { cache.put(key, JSON.stringify(known), 21600); } catch (e) { /* too big to cache: re-detect next time */ }
  }
  return info;
}

/** Live sessions (newest first) with live row counts, for one live sheet. */
function getLiveSessions(src) {
  guard_();
  var ss = SpreadsheetApp.openById(sheetIdFor_(src || 'live'));
  var names = ss.getSheets().map(function (s) { return s.getName(); });
  var info = tabInfo_(ss, names);
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
  return { src: src || CONFIG.LIVE_SHEETS[0].key, sheetName: ss.getName(), sheetUrl: ss.getUrl(),
    checkedAt: new Date().toISOString(), sessions: sessions, other: other };
}

/** Past webinar lists, grouped by date (newest first). */
function getPastLists() {
  guard_();
  var ss = SpreadsheetApp.openById(CONFIG.PAST_SHEET_ID);
  var names = ss.getSheets().map(function (s) { return s.getName(); });
  var info = tabInfo_(ss, names);
  var g = groupByDate(names, new Date().getFullYear());
  function withRows(t) { var x = info[t.name] || {}; t.rows = x.rows || 0; t.usable = !!x.cols && t.rows > 0; return t; }
  var days = g.days.map(function (d) { return { date: d.date, tabs: d.tabs.map(withRows).filter(function (t) { return t.usable; }) }; })
    .filter(function (d) { return d.tabs.length; });
  var other = g.other.map(function (n) { return withRows({ name: n, label: n, kind: tabKind(n) }); })
    .filter(function (t) { return t.usable; });
  return { sheetName: ss.getName(), sheetUrl: ss.getUrl(), days: days, other: other };
}

/** Raw rows of some tabs of a source sheet (tagged with the tab name). */
function readSheetTabs_(src, names) {
  var ss = SpreadsheetApp.openById(sheetIdFor_(src));
  var info = tabInfo_(ss, names);
  var tabs = names.map(function (n) { return info[n]; }).filter(function (t) { return t && t.cols && t.rows; });
  return tabs.length ? readTabsRaw_(ss, tabs, names) : [];
}

/**
 * Every tab with contacts in the live sheets and the past sheet, for the
 * Audiences page dropdowns: [{ key, label, tabs: [{ name, rows }] }].
 */
function getSheetCatalog() {
  guard_();
  return CONFIG.LIVE_SHEETS.map(function (s) { return { key: s.key, id: s.id }; })
    .concat([{ key: 'past', id: CONFIG.PAST_SHEET_ID }])
    .map(function (s) {
      var ss = SpreadsheetApp.openById(s.id);
      var names = ss.getSheets().map(function (x) { return x.getName(); });
      var info = tabInfo_(ss, names);
      return { key: s.key, label: ss.getName(), tabs: names.map(function (n) { return { name: n, rows: (info[n] || {}).rows || 0 }; })
        .filter(function (t) { return t.rows > 0; }) };
    });
}

/**
 * Everyone in the chosen tabs right now, combined and cleaned.
 * items: [{ src: <live sheet key> | 'live' | 'past', name }] (plain strings = first live sheet).
 */
function getLiveList(items, phoneOnly) {
  guard_();
  items = (items || []).map(function (x) { return typeof x === 'string' ? { src: 'live', name: x } : x; });
  if (!items.length) throw new Error('Tick at least one tab.');
  var raw = [], srcs = [];
  items.forEach(function (x) { if (srcs.indexOf(x.src) < 0) srcs.push(x.src); });
  srcs.forEach(function (src) {
    var names = items.filter(function (x) { return x.src === src; }).map(function (x) { return x.name; });
    raw = raw.concat(readSheetTabs_(src, names));
  });
  if (!raw.length) throw new Error('No contacts found in the selected tabs.');
  var res = cleanStandard_(raw, phoneOnly);
  var perTab = {};
  res.rows.forEach(function (r) { perTab[r[3]] = (perTab[r[3]] || 0) + 1; });
  return { steps: res.steps, final: res.rows.length, perTab: perTab, rows: res.rows, at: new Date().toISOString() };
}
