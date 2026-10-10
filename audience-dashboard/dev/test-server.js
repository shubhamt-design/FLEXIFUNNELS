// End-to-end test of the server code on fake sheets: node dev/test-server.js
const assert = require('assert');
const env = require('./gas-sim')();
const { ctx } = env;
const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b, m);

// Do-not-contact sheets with the same IDs as CONFIG.EXCLUDE_SHEETS
const ids = ctx.CONFIG.EXCLUDE_SHEETS.map(s => s.id);
function at(id, ss) { delete env.files[ss.id]; ss.id = id; env.files[id] = ss; return ss; }
at(ids[0], env.make('Buyers', { S: [['Name', 'Email', 'Phone'], ['Buyer', 'buyer@x.com', '9000000001']] }));
at(ids[1], env.make('Opted', { S: [['Name', 'Phone'], ['Opt', '9000000002']] }));
const banner = 'DO NOT EDIT';
at(ids[2], env.make('Reminder', { S: [[banner, banner, banner], ['Name', 'Email', 'Phone'], ['Rem', 'Email : rem@x.com', '']] }));

// A UTM sheet: header tab, banner+header tab, headerless tab, summary tab
const lead = (i, extra = '') => ['01/09/2024 00:00:0' + (i % 10), 'Lead' + i, `lead${i}${extra}@x.com`, '+91' + (9100000000 + i)];
const tabA = [['timestamp_incoming_webhook', 'first_name', 'email', 'phone', 'utm_source']];
for (let i = 1; i <= 30; i++) tabA.push(lead(i).concat('facebook'));
tabA.push(['t', 'Buyer again', 'BUYER@x.com', '']);             // buyer
tabA.push(['t', 'Opt', '', '+91 90000 00002']);                 // opted out
tabA.push(['t', 'Rem', 'rem@x.com', '']);                       // reminder team
tabA.push(['t', 'Staff', 'anita.d+test@flexifunnels.com', '+919999999999']); // internal
const tabB = [['', 'WARNING'], ['#REF!', 'timestamp_incoming_webhook', 'first_name', 'email', 'phone']];
for (let i = 25; i <= 40; i++) tabB.push([''].concat(lead(i)));   // 25..30 overlap with tab A
const tabC = []; for (let i = 41; i <= 50; i++) tabC.push(lead(i).concat('facebook', '120237758928820510'));
const utm = env.make('August 2026 UTM', { 'Webinar A': tabA, 'Combined': tabB, 'Sheet21': tabC, 'Lead Summary': [['LEAD SUMMARY'], ['Total rows: 5']] });
env.make('Unrelated sheet', { S: [['Name', 'Email'], ['x', 'x@x.com']] });

// setup (main data sheet is the "active" one)
ctx.__active = env.make('Audience Dashboard – Data', {});
ctx.setup();

let st = ctx.getSourcesState();
assert.strictEqual(st.sources.length, 1, 'only sheets with UTM in name');
const src = st.sources[0];
const tabs = Object.fromEntries(src.tabs.map(t => [t.name, t]));
eq(tabs['Webinar A'].cols, { name: 1, email: 2, phone: 3 });
assert.strictEqual(tabs['Webinar A'].rows, 34);
eq(tabs['Combined'].cols, { name: 2, email: 3, phone: 4 });
assert.strictEqual(tabs['Combined'].rows, 16);
eq(tabs['Sheet21'].cols, { name: 1, email: 2, phone: 3 });
assert.strictEqual(tabs['Sheet21'].rows, 10);
assert.strictEqual(tabs['Lead Summary'].cols, null);
assert.strictEqual(src.total, 60);

const all = ['Webinar A', 'Combined', 'Sheet21'];
const pv = ctx.previewPool(src.id, all, true);
const step = l => (pv.steps.find(s => s.label === l) || {}).count;
assert.strictEqual(step('Rows in selected tabs'), 60);
assert.strictEqual(step('Duplicates (same email or phone)'), -6);
assert.strictEqual(step('Buyers'), -1);
assert.strictEqual(step('Opted-out'), -1);
assert.strictEqual(step('Removed by reminder team'), -1);
assert.strictEqual(step('Internal / test emails'), -1);
assert.strictEqual(pv.available, 50);
eq(pv.perTab, { 'Webinar A': 30, 'Combined': 10, 'Sheet21': 10 });

// pull 20, then 20 more: no overlap, continues in order
const b1 = ctx.pullBatch(src.id, all, true, 20, 'Webinar 18 Oct');
assert.strictEqual(b1.pulled, 20);
assert.strictEqual(b1.rows[0][1], 'lead1@x.com');
assert.strictEqual(b1.rows[0][3], 'Webinar A', 'tagged with source tab');
assert.strictEqual(b1.rows[0][2], '919100000001');
const b2 = ctx.pullBatch(src.id, all, true, 20, 'Webinar 25 Oct');
assert.strictEqual(b2.pulled, 20);
assert.strictEqual(b2.rows[0][1], 'lead21@x.com');
const used1 = new Set(b1.rows.map(r => r[1]));
assert.ok(b2.rows.every(r => !used1.has(r[1])), 'second batch has no overlap');
assert.strictEqual((b2.steps.find(s => s.label === 'Already used in earlier batches') || {}).count, -20);
assert.strictEqual(ctx.previewPool(src.id, all, true).available, 10);

// re-download + release
assert.strictEqual(ctx.getBatchRows(b1.id).length, 20);
st = ctx.getSourcesState();
assert.strictEqual(st.batches.length, 2);
ctx.releaseBatch(b1.id);
assert.strictEqual(ctx.previewPool(src.id, all, true).available, 30);
assert.strictEqual(ctx.getSourcesState().batches.length, 1);

// asking for more than available gives what's left
const b3 = ctx.pullBatch(src.id, all, true, 1000, 'Webinar 1 Nov');
assert.strictEqual(b3.pulled, 30);
assert.throws(() => ctx.pullBatch(src.id, all, true, 10, 'Empty'), /No fresh contacts/);

// re-scan keeps state and is idempotent
ctx.scanSources();
assert.strictEqual(ctx.getSourcesState().sources.length, 1);
// existing flow still works: upload two audiences, merge + subtract
function upload(name, rows) {
  const id = ctx.startUpload(name); ctx.appendUpload(id, rows); return ctx.finishUpload(id, name, 'test');
}
const u1 = upload('Web 1', [['A', 'a@x.com', '9811111111'], ['A2', 'a@x.com', ''], ['B', 'buyer@x.com', ''], ['C', 'c@x.com', '9822222222']]);
eq([u1.saved, u1.duplicates, u1.buyers], [2, 1, 1]);
upload('Web 2', [['C', '', '9822222222'], ['D', 'd@x.com', '9833333333']]);
upload('Web 3', [['D', 'd@x.com', '']]);
const built = ctx.buildList(['Web 1', 'Web 2'], ['Web 3'], true);
eq(built.rows.map(r => r[0]), ['A', 'C']);
eq(built.mergedTotal, 4);
assert.strictEqual(ctx.getState().audiences.length, 3);
console.log('Server tests passed.');
