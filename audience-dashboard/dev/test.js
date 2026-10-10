// Run: node dev/test.js  — tests the pure cleaning logic in Logic.gs
const fs = require('fs'), path = require('path'), assert = require('assert');
const m = { exports: {} };
new Function('module', fs.readFileSync(path.join(__dirname, '..', 'Logic.gs'), 'utf8'))(m);
const L = m.exports;

// phones (formats from the real buyers sheet)
assert.strictEqual(L.normPhone('9840402282'), '919840402282');
assert.strictEqual(L.normPhone(9840402282), '919840402282');
assert.strictEqual(L.normPhone('918956017182'), '918956017182');
assert.strictEqual(L.normPhone('+91 98404-02282'), '919840402282');
assert.strictEqual(L.normPhone('09840402282'), '919840402282');
assert.strictEqual(L.normPhone('0091 9840402282'), '919840402282');
assert.strictEqual(L.normPhone('+1 415 555 1234'), '14155551234');
for (const bad of ['--', 'NA', '', null, '12345']) assert.strictEqual(L.normPhone(bad), '');

// emails
assert.strictEqual(L.normEmail('  Thiru@FlexiFunnels.com '), 'thiru@flexifunnels.com');
assert.strictEqual(L.normEmail('ms.madasamy+1@gmail.com'), 'ms.madasamy+1@gmail.com');
assert.strictEqual(L.normEmail('NA'), '');
assert.strictEqual(L.normEmail('Email : ads4al@gmail.com'), 'ads4al@gmail.com');
assert.strictEqual(L.normEmail(' vaibhavdamle256@gmail.com'), 'vaibhavdamle256@gmail.com');

// header detection: banner row on top (reminder-team sheet), name+phone only (opt-out sheet)
const banner = "DO NOT EDIT OTHER TEAM MEMBER'S DATA (All Fields Are MANDATORY)";
assert.deepStrictEqual(L.findHeader([[banner, banner, banner, banner, banner, banner],
  ['Name', 'Email', 'Phone', "Team Member's Name", 'SOURCE OF LEAD', 'REASON OF REMOVE (What They Said)'], ['a', 'b', 'c']]),
  { row: 1, cols: { name: 0, email: 1, phone: 2 } });
assert.deepStrictEqual(L.findHeader([['Name', 'Phone', '', '', ''], ['', '']]), { row: 0, cols: { name: 0, email: -1, phone: 1 } });
assert.strictEqual(L.findHeader([['x', 'y'], ['1', '2']]), null);

// headers
assert.deepStrictEqual(L.detectColumns(['Name', 'Email', 'Phone']), { name: 0, email: 1, phone: 2 });
assert.deepStrictEqual(L.detectColumns(['Full Name', 'Join Time', 'Mobile Number', 'E-mail']), { name: 0, email: 3, phone: 2 });

// dedupe: email OR phone match
const r = L.cleanAndDedupe([
  ['A', 'a@x.com', '9840402282'],
  ['A2', 'A@X.com ', ''],              // same email
  ['B', 'b@x.com', '+91 98404 02282'], // same phone as A
  ['C', 'b@x.com', '9000000001'],      // email belongs to A's group (via B) -> dup
  ['D', '', '--'],                     // invalid
  ['E', 'e@x.com', ''],
  ['E2', '', '9111111111'],
  ['E3', 'e@x.com', '9111111111'],     // dup of E; phone already used by E2 -> not merged
  ['F', 'f@x.com', ''],
  ['F2', 'f@x.com', '9222222222'],     // dup of F; fills missing phone
]);
assert.strictEqual(r.invalid, 1);
assert.strictEqual(r.duplicates, 5);
assert.deepStrictEqual(r.rows.map(x => x[0]), ['A', 'E', 'E2', 'F']);
assert.deepStrictEqual(r.rows[3], ['F', 'f@x.com', '919222222222']);

// subtract
const buyers = L.keySetOf(L.cleanAndDedupe([['', '', '9840402282'], ['', 'f@x.com', '']]).rows);
const after = L.removeMatching(r.rows, buyers);
assert.strictEqual(after.removed, 2);
assert.deepStrictEqual(after.rows.map(x => x[0]), ['E', 'E2']);

// merge: re-cleaning already-saved audiences keeps values and drops cross-audience overlaps
const audA = [['A', 'a@x.com', '919840402282'], ['B', 'b@x.com', '']];
const audB = [['A again', '', '919840402282'], ['C', 'c@x.com', '14155551234']];
const merged = L.cleanAndDedupe(audA.concat(audB));
assert.deepStrictEqual(merged.rows, [['A', 'a@x.com', '919840402282'], ['B', 'b@x.com', ''], ['C', 'c@x.com', '14155551234']]);
assert.strictEqual(merged.duplicates, 1);

// extra columns (source tab tag) survive cleaning
assert.deepStrictEqual(L.cleanAndDedupe([['A', 'a@x.com', '9840402282', 'Tab 1'], ['A', 'a@x.com', '', 'Tab 2']]).rows,
  [['A', 'a@x.com', '919840402282', 'Tab 1']]);

// headerless tab (like "Sheet21"): timestamp, name, email, phone, source, long ad ids
const headerless = [
  ['01/03/2026 00:00:30', 'Ankit', 'palankit1437@gmail.com', '+918601474876', 'facebook', '120237758928820510'],
  ['01/03/2026 00:01:03', 'SHOBHIT', 'bajpaishobhit@gmail.com', '+917080838307', 'facebook', '120237758928820510']];
assert.deepStrictEqual(L.sniffColumns(headerless), { name: 1, email: 2, phone: 3 });
assert.strictEqual(L.sniffColumns([['LEAD SUMMARY'], ['Total rows: 5']]), null);

// 50k performance
const big = Array.from({ length: 50000 }, (_, i) => ['n' + i, `u${i % 45000}@x.com`, String(9000000000 + (i % 48000))]);
let t = Date.now(); const c = L.cleanAndDedupe(big); const ms = Date.now() - t;
assert.strictEqual(c.rows.length, 45000);
console.log('All tests passed. 50k rows cleaned in', ms, 'ms');
