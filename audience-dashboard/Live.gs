/**
 * Audience Dashboard — live sessions + past webinar lists.
 *
 * LIVE: session tabs of each sheet in CONFIG.LIVE_SHEETS ("August 2026 UTM",
 *   "Sakshi 10 Min Data Sheet"), grouped by session
 *   (e.g. "... 10 Mins Busines" + "... 10 Mins Reg Team").
 * PAST: tabs of CONFIG.PAST_SHEET_ID ("Active Campaign List Upload 11 - 2026"),
 *   grouped by date (attended / pitch / non-pitch / missed).
 *
 * Speed: lists open from tab NAMES (one call per sheet). Only the newest
 * sessions are counted live; older tabs show the counts from the hourly
 * warmSheetCaches() run. Contacts themselves are always read at the moment a
 * list is built, so a download is never out of date. Nothing in those sheets
 * is changed.
 */

var FRESH_SESSIONS = 10;  // live sessions counted on every page open
var FRESH_DAYS = 7;       // past-webinar dates counted on every page open

/** Spreadsheet ID for a source key: 'past', a CONFIG.LIVE_SHEETS key, or 'live' (= the first live sheet). */
function sheetIdFor_(src) {
  if (src === 'past') return CONFIG.PAST_SHEET_ID;
  var live = CONFIG.LIVE_SHEETS.filter(function (s) { return s.key === src; })[0] || (src === 'live' ? CONFIG.LIVE_SHEETS[0] : null);
  if (!live) throw new Error('Unknown sheet: ' + src);
  return live.id;
}

function allSources_() {
  return CONFIG.LIVE_SHEETS.map(function (s) { return { key: s.key, id: s.id }; })
    .concat([{ key: 'past', id: CONFIG.PAST_SHEET_ID }]);
}

/** The live sheets, for the switch on the Live sessions page. */
function getLiveSources() {
  guard_();
  return CONFIG.LIVE_SHEETS.map(function (s) { return { key: s.key, label: s.label }; });
}

/* ------------------------------------------------------------------ */
/* Tab info: header position (cached 6 h) + row count (also cached)    */
/* ------------------------------------------------------------------ */

function cacheGet_(key) {
  try { return JSON.parse(CacheService.getScriptCache().get(key) || '{}'); } catch (e) { return {}; }
}
function cachePut_(key, obj) {
  try { CacheService.getScriptCache().put(key, JSON.stringify(obj), 21600); } catch (e) { /* too big: skip */ }
}

/** Counts every named tab now (header detection + last row). Updates both caches. */
function tabInfo_(ss, names) {
  var colsKey = 'cols_' + ss.getId(), rowsKey = 'rows_' + ss.getId();
  var known = cacheGet_(colsKey), counts = cacheGet_(rowsKey), changed = false;
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
    var rows = c ? Math.max(0, last - c.s + 1) : 0;
    info[name] = { name: name, last: last, cols: c ? c.c : null, start: c ? c.s : 1, rows: rows };
    counts[name] = { r: rows, u: !!c };
  });
  if (changed) cachePut_(colsKey, known);
  cachePut_(rowsKey, counts);
  return info;
}

/** Counts from the last time a tab was counted (or null when never counted). */
function cachedCount_(counts, name) {
  var c = counts[name];
  return c ? { rows: c.r, usable: c.u, cached: true } : { rows: null, usable: true, cached: true };
}

/** Hourly (trigger): count every tab of every connected sheet so pages open with numbers. */
function warmSheetCaches() {
  allSources_().forEach(function (s) {
    try {
      var ss = SpreadsheetApp.openById(s.id);
      tabInfo_(ss, ss.getSheets().map(function (x) { return x.getName(); }));
    } catch (e) { /* a sheet that can't be opened shows its own error when used */ }
  });
}

/** Installs the hourly warmSheetCaches trigger once (no need to re-run setup). */
function ensureWarmTrigger_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('WARM_TRIGGER')) return;
  try {
    var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'warmSheetCaches'; });
    if (!has) ScriptApp.newTrigger('warmSheetCaches').timeBased().everyHours(1).create();
    props.setProperty('WARM_TRIGGER', 'yes');
  } catch (e) { /* not allowed here: counts are still filled in as pages are used */ }
}

/* ------------------------------------------------------------------ */
/* Live sessions                                                        */
/* ------------------------------------------------------------------ */

/** Sessions of one live sheet, newest first. The newest FRESH_SESSIONS are counted live; all=true counts every tab. */
function getLiveSessions(src, all) {
  guard_();
  ensureWarmTrigger_();
  var ss = SpreadsheetApp.openById(sheetIdFor_(src || 'live'));
  var names = ss.getSheets().map(function (s) { return s.getName(); });
  var g = groupSessions(names, new Date().getFullYear());
  var freshSessions = all ? g.sessions : g.sessions.slice(0, FRESH_SESSIONS);
  var freshNames = [];
  freshSessions.forEach(function (s) { s.tabs.forEach(function (t) { freshNames.push(t.name); }); });
  if (all) freshNames = freshNames.concat(g.other);
  var info = tabInfo_(ss, freshNames), counts = cacheGet_('rows_' + ss.getId());
  function count(n) {
    var x = info[n];
    return x ? { rows: x.rows, usable: !!x.cols, last: x.last } : cachedCount_(counts, n);
  }
  var sessions = g.sessions.map(function (s, i) {
    return { key: s.key, date: s.date, time: s.time, title: s.title,
      tabs: s.tabs.map(function (t) {
        var x = count(t.name);
        var out = { name: t.name, label: t.label, rows: x.rows, usable: x.usable, cached: !!x.cached };
        // latest registration time for the newest sessions (first column is the timestamp)
        if (i < 6 && x.last && x.usable && x.rows) out.lastEntry = ss.getSheetByName(t.name).getRange(x.last, 1).getDisplayValue();
        return out;
      }) };
  }).filter(function (s) { return s.tabs.some(function (t) { return t.usable; }); });
  var other = all ? g.other.map(function (n) { var x = count(n); return { name: n, rows: x.rows, usable: x.usable }; })
    .filter(function (t) { return t.usable && t.rows; }) : [];
  return { src: src || CONFIG.LIVE_SHEETS[0].key, sheetName: ss.getName(), sheetUrl: ss.getUrl(),
    checkedAt: new Date().toISOString(), sessions: sessions, other: other, all: !!all };
}

/* ------------------------------------------------------------------ */
/* Past webinar lists                                                   */
/* ------------------------------------------------------------------ */

/** Past lists grouped by date, newest first. The newest FRESH_DAYS dates are counted live; all=true counts every tab. */
function getPastLists(all) {
  guard_();
  var ss = SpreadsheetApp.openById(CONFIG.PAST_SHEET_ID);
  var names = ss.getSheets().map(function (s) { return s.getName(); });
  var g = groupByDate(names, new Date().getFullYear());
  var freshNames = [];
  (all ? g.days : g.days.slice(0, FRESH_DAYS)).forEach(function (d) { d.tabs.forEach(function (t) { freshNames.push(t.name); }); });
  if (all) freshNames = freshNames.concat(g.other);
  var info = tabInfo_(ss, freshNames), counts = cacheGet_('rows_' + ss.getId());
  function withRows(t) {
    var x = info[t.name] ? { rows: info[t.name].rows, usable: !!info[t.name].cols } : cachedCount_(counts, t.name);
    t.rows = x.rows; t.usable = x.usable && x.rows !== 0; t.cached = !info[t.name];
    return t;
  }
  var days = g.days.map(function (d) { return { date: d.date, tabs: d.tabs.map(withRows).filter(function (t) { return t.usable; }) }; })
    .filter(function (d) { return d.tabs.length; });
  var other = all ? g.other.map(function (n) { return withRows({ name: n, label: n, kind: tabKind(n) }); })
    .filter(function (t) { return t.usable && t.rows; }) : [];
  return { sheetName: ss.getName(), sheetUrl: ss.getUrl(), days: days, other: other, all: !!all };
}

/* ------------------------------------------------------------------ */
/* Reading + the Audiences-page catalog                                 */
/* ------------------------------------------------------------------ */

/** Raw rows of some tabs of a source sheet (tagged with the tab name). */
function readSheetTabs_(src, names) {
  var ss = SpreadsheetApp.openById(sheetIdFor_(src));
  var info = tabInfo_(ss, names);
  var tabs = names.map(function (n) { return info[n]; }).filter(function (t) { return t && t.cols && t.rows; });
  return tabs.length ? readTabsRaw_(ss, tabs, names) : [];
}

/**
 * Every session / dated tab of the live sheets and the past sheet, for the
 * Audiences page dropdowns: [{ key, label, tabs: [{ name, rows }] }]. Fast:
 * names only + counts from the cache (rows null = not counted yet).
 */
function getSheetCatalog() {
  guard_();
  ensureWarmTrigger_();
  return allSources_().map(function (s) {
    var ss = SpreadsheetApp.openById(s.id);
    var names = ss.getSheets().map(function (x) { return x.getName(); });
    var counts = cacheGet_('rows_' + s.id), year = new Date().getFullYear();
    var tabs = [];
    names.forEach(function (n) {
      var c = counts[n], dated = !!parseSessionTab(n, year);
      if (c ? (c.u && c.r > 0) : dated) tabs.push({ name: n, rows: c ? c.r : null, dated: dated });
    });
    // newest first (sheets usually have the newest tab on the left, but not always)
    tabs.sort(function (a, b) {
      var pa = parseSessionTab(a.name, year), pb = parseSessionTab(b.name, year);
      if (!pa || !pb) return pa ? -1 : pb ? 1 : 0;
      if (pa.date !== pb.date) return pa.date < pb.date ? 1 : -1;
      return timeMinutes(pb.time) - timeMinutes(pa.time);
    });
    return { key: s.key, label: ss.getName(), tabs: tabs };
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
