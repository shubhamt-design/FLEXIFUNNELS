/**
 * Pure data-cleaning logic (no Google services) so it can be unit-tested
 * locally with `node dev/test.js`.
 *
 * Matching rule: two contacts are the same person if their EMAIL matches
 * OR their PHONE matches.
 */

/**
 * Lowercase + trim. Pulls the address out of text like "Email : a@b.com".
 * Returns '' if there is no email in it.
 */
function normEmail(value) {
  var s = String(value == null ? '' : value).trim().toLowerCase();
  var m = s.match(/[^\s@:;,<>()"']+@[^\s@:;,<>()"']+\.[^\s@:;,<>()"']+/);
  return m ? m[0] : '';
}

/**
 * Normalise a phone number to digits with country code, no "+".
 *   9840402282       -> 919840402282
 *   +91 98404-02282  -> 919840402282
 *   09840402282      -> 919840402282
 *   918956017182     -> 918956017182
 *   "--", "NA", ""   -> ''
 */
function normPhone(value, countryCode) {
  if (value == null) return '';
  var s = typeof value === 'number' ? value.toFixed(0) : String(value).trim();
  var d = s.replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf('00') === 0) d = d.slice(2);                // 0091...
  if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1); // 0 + local number
  if (d.length === 10) return (countryCode || '91') + d;    // local number
  if (d.length >= 11 && d.length <= 15) return d;           // already has country code
  return '';
}

/** Find Name / Email / Phone columns from a header row. -1 when missing. */
function detectColumns(header) {
  var h = (header || []).map(function (x) { return String(x).trim().toLowerCase(); });
  function find(re, not) {
    for (var i = 0; i < h.length; i++) if (re.test(h[i]) && !(not && not.test(h[i]))) return i;
    return -1;
  }
  return {
    name: find(/name/, /e-?mail|user ?name/),
    email: find(/e-?mail/),
    phone: find(/phone|mobile|whats ?app|contact|number|cell|mob/, /e-?mail/)
  };
}

/**
 * Find the header row in the first few rows (some sheets have a banner or
 * blank rows on top). Returns { row: index, cols } or null if none found.
 */
function findHeader(values) {
  var limit = Math.min(values.length, 10);
  for (var i = 0; i < limit; i++) {
    var cols = detectColumns(values[i]);
    if (cols.email >= 0 || cols.phone >= 0) return { row: i, cols: cols };
  }
  return null;
}

/**
 * For sheets without a header row: guess the Email / Phone / Name columns
 * from the values themselves. Dates, IDs and timestamps are ignored.
 */
function sniffColumns(rows) {
  var width = 0;
  rows.forEach(function (r) { width = Math.max(width, r.length); });
  var best = { email: -1, phone: -1 }, score = { email: 0, phone: 0 };
  for (var c = 0; c < width; c++) {
    var emails = 0, phones = 0, filled = 0;
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i][c];
      if (v == null || v === '' || v instanceof Date) continue;
      filled++;
      var s = String(v).trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) emails++;
      else if (/^\+?[\d\s()-]{10,17}$/.test(s) && normPhone(v)) phones++;
    }
    if (filled && emails / filled > 0.5 && emails > score.email) { score.email = emails; best.email = c; }
    if (filled && phones / filled > 0.5 && phones > score.phone) { score.phone = phones; best.phone = c; }
  }
  if (best.email < 0 && best.phone < 0) return null;
  var first = Math.min.apply(null, [best.email, best.phone].filter(function (x) { return x >= 0; }));
  return { name: first > 0 ? first - 1 : -1, email: best.email, phone: best.phone };
}

/**
 * Live session tabs are named like "3 Nov 2026 7:30 PM Flexi Genie 10 Mins Busines"
 * and "3 Nov 2026 7:30 PM Flexi Genie 10 Mins Reg Team". Returns
 * { date: 'YYYY-MM-DD', time: '7:30 PM', key } or null when the name does not
 * start with a date. Tabs with the same key belong to the same session.
 */
var MONTHS_ = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseSessionTab(name, defaultYear) {
  var m = String(name).trim().match(/^(\d{1,2})(?:\s*-\s*\d{1,2})?\s+([a-z]{3,9})\.?,?\s+(?:(\d{4}),?\s*)?(.*)$/i);
  if (!m) return null;
  var mon = MONTHS_[m[2].slice(0, 3).toLowerCase()];
  var year = m[3] ? +m[3] : defaultYear;
  if (!mon || !year) return null;
  var rest = m[4];
  var t = rest.match(/^(\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?)\s*(.*)$/i);
  var time = t ? t[1].toUpperCase().replace(/\./g, '').replace(/\s*(AM|PM)$/, ' $1') : '';
  if (t) rest = t[2];
  var first = (rest.toLowerCase().match(/[a-z0-9]+/) || [''])[0];
  var date = year + '-' + ('0' + mon).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return { date: date, time: time, key: date + '|' + time + '|' + first };
}

/** Minutes after midnight for '7:30 PM' / '11 AM' (for sorting sessions). */
function timeMinutes(time) {
  var m = String(time || '').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/);
  if (!m) return -1;
  return (+m[1] % 12 + (m[3] === 'PM' ? 12 : 0)) * 60 + (+m[2] || 0);
}

/**
 * Group tab names into sessions, newest first.
 * Returns { sessions: [{ key, date, time, title, tabs: [{ name, label }] }], other: [names] }.
 */
function groupSessions(names, defaultYear) {
  var byKey = {}, order = [], other = [];
  names.forEach(function (n) {
    var p = parseSessionTab(n, defaultYear);
    if (!p) { other.push(n); return; }
    if (!byKey[p.key]) { byKey[p.key] = { key: p.key, date: p.date, time: p.time, names: [] }; order.push(p.key); }
    byKey[p.key].names.push(n);
  });
  var sessions = order.map(function (k) {
    var g = byKey[k];
    var trimmed = g.names.map(function (n) { return n.trim(); });
    var prefix = trimmed.length > 1 ? commonPrefix_(trimmed).replace(/\S*$/, '') : trimmed[0];
    var title = prefix.trim().replace(/[\s,(-]+$/, '') || trimmed[0];
    return { key: k, date: g.date, time: g.time, title: title,
      tabs: g.names.map(function (n) { var rest = n.trim().slice(prefix.length).trim(); return { name: n, label: rest || n.trim() }; }) };
  });
  sessions.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return timeMinutes(b.time) - timeMinutes(a.time);
  });
  return { sessions: sessions, other: other };
}

function commonPrefix_(list) {
  var p = list[0];
  for (var i = 1; i < list.length; i++) {
    var j = 0;
    while (j < p.length && j < list[i].length && p.charAt(j).toLowerCase() === list[i].charAt(j).toLowerCase()) j++;
    p = p.slice(0, j);
  }
  return p;
}

/** Keys used for matching a cleaned row [name, email, phone]. */
function rowKeys(row) {
  var keys = [];
  if (row[1]) keys.push('e:' + row[1]);
  if (row[2]) keys.push('p:' + row[2]);
  return keys;
}

/** Build a lookup Set of every email and phone in a list of cleaned rows. */
function keySetOf(rows, set) {
  set = set || new Set();
  for (var i = 0; i < rows.length; i++) {
    var k = rowKeys(rows[i]);
    for (var j = 0; j < k.length; j++) set.add(k[j]);
  }
  return set;
}

function matchesSet(row, set) {
  if (row[1] && set.has('e:' + row[1])) return true;
  if (row[2] && set.has('p:' + row[2])) return true;
  return false;
}

/**
 * Clean raw [name, email, phone] rows:
 *  - normalise email + phone
 *  - drop rows with neither a valid email nor a valid phone ("invalid")
 *  - drop duplicates (email OR phone match). When a duplicate carries a
 *    phone/email/name the kept row is missing, it is filled in.
 */
function cleanAndDedupe(rawRows, countryCode) {
  var seen = new Map(); // key -> index in out
  var out = [];
  var duplicates = 0, invalid = 0;
  for (var i = 0; i < rawRows.length; i++) {
    var r = rawRows[i] || [];
    var name = String(r[0] == null ? '' : r[0]).trim();
    var email = normEmail(r[1]);
    var phone = normPhone(r[2], countryCode);
    if (!email && !phone) { invalid++; continue; }
    var ke = email ? 'e:' + email : null;
    var kp = phone ? 'p:' + phone : null;
    var idx = -1;
    if (ke && seen.has(ke)) idx = seen.get(ke);
    else if (kp && seen.has(kp)) idx = seen.get(kp);
    if (idx < 0) {
      idx = out.length;
      var row = [name, email, phone];
      for (var x = 3; x < r.length; x++) row.push(r[x]); // keep extra columns (e.g. source tab)
      out.push(row);
    } else {
      duplicates++;
      var kept = out[idx];
      if (!kept[0] && name) kept[0] = name;
      if (!kept[1] && ke && !seen.has(ke)) kept[1] = email;
      if (!kept[2] && kp && !seen.has(kp)) kept[2] = phone;
    }
    if (ke && !seen.has(ke)) seen.set(ke, idx);
    if (kp && !seen.has(kp)) seen.set(kp, idx);
  }
  return { rows: out, duplicates: duplicates, invalid: invalid };
}

/** Split rows into those NOT in the set (kept) and the count removed. */
function removeMatching(rows, set) {
  var kept = [], removed = 0;
  for (var i = 0; i < rows.length; i++) {
    if (matchesSet(rows[i], set)) removed++;
    else kept.push(rows[i]);
  }
  return { rows: kept, removed: removed };
}

/** Pull [name, email, phone] out of a 2-D table using a column map. */
function pickColumns(table, cols) {
  var out = [];
  for (var i = 0; i < table.length; i++) {
    var r = table[i];
    out.push([
      cols.name >= 0 ? r[cols.name] : '',
      cols.email >= 0 ? r[cols.email] : '',
      cols.phone >= 0 ? r[cols.phone] : ''
    ]);
  }
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { normEmail: normEmail, normPhone: normPhone, detectColumns: detectColumns, findHeader: findHeader, sniffColumns: sniffColumns,
    parseSessionTab: parseSessionTab, groupSessions: groupSessions,
    keySetOf: keySetOf, matchesSet: matchesSet, cleanAndDedupe: cleanAndDedupe,
    removeMatching: removeMatching, pickColumns: pickColumns };
}
