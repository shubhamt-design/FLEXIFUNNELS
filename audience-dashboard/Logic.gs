/**
 * Pure data-cleaning logic (no Google services) so it can be unit-tested
 * locally with `node dev/test.js`.
 *
 * Matching rule: two contacts are the same person if their EMAIL matches
 * OR their PHONE matches.
 */

/** Lowercase + trim. Returns '' if it does not look like an email. */
function normEmail(value) {
  var s = String(value == null ? '' : value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
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
      out.push([name, email, phone]);
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
  module.exports = { normEmail: normEmail, normPhone: normPhone, detectColumns: detectColumns,
    keySetOf: keySetOf, matchesSet: matchesSet, cleanAndDedupe: cleanAndDedupe,
    removeMatching: removeMatching, pickColumns: pickColumns };
}
