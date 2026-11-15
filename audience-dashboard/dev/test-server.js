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
// every pulled batch is also a saved audience (Audiences page)
let auds = ctx.getState().audiences;
eq(auds.map(a => [a.name, a.contacts]), [['Webinar 18 Oct', 20], ['Webinar 25 Oct', 20]]);
assert.strictEqual(b1.audience, 'Webinar 18 Oct');
eq(ctx.getSourcesState().batches.map(b => b.audience), ['Webinar 25 Oct', 'Webinar 18 Oct']);
eq(ctx.buildList(['Webinar 25 Oct'], ['Webinar 18 Oct'], true).final, 20);              // usable like any audience
// same batch name again -> "(2)"
const dupName = ctx.pullBatch(src.id, all, true, 1, 'Webinar 25 Oct');
assert.strictEqual(dupName.audience, 'Webinar 25 Oct (2)');
ctx.releaseBatch(dupName.id);

// re-download + release
assert.strictEqual(ctx.getBatchRows(b1.id).length, 20);
st = ctx.getSourcesState();
assert.strictEqual(st.batches.length, 2);
ctx.releaseBatch(b1.id);
assert.ok(!ctx.getState().audiences.some(a => a.name === 'Webinar 18 Oct'), 'released batch audience removed');
// an old batch without an audience (pulled before this feature) can be added
const bsTab = env.files[ctx.PropertiesService.getScriptProperties().getProperty('DB_ID')].getSheetByName('_Batches');
bsTab.getRange(2, 8).setValue('');
ctx.deleteAudience('Webinar 25 Oct');
assert.strictEqual(ctx.getSourcesState().batches[0].audience, '');
eq(ctx.addBatchToAudiences(b2.id), { audience: 'Webinar 25 Oct' });
assert.strictEqual(ctx.getState().audiences.find(a => a.name === 'Webinar 25 Oct').contacts, 20);
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
assert.strictEqual(ctx.getState().audiences.length, 5); // 3 uploads + 2 pulled batches
// live sessions: session tabs of the live sheet, read fresh every time
const reg = (i, ts) => [ts || '03/11/2026 10:0' + i, 'R' + i, `r${i}@x.com`, '+91' + (9200000000 + i)];
const busTab = [['timestamp_incoming_webhook', 'first_name', 'email', 'phone']].concat([1, 2, 3, 4].map(i => reg(i)));
busTab.push(['t', 'Buyer', 'buyer@x.com', '']); busTab.push(['t', 'Staff', 'x+test@flexifunnels.com', '+919111111111']);
const regTab = [['timestamp_incoming_webhook', 'first_name', 'email', 'phone']].concat([3, 4, 5].map(i => reg(i)));
const live = at(ctx.CONFIG.LIVE_SHEETS[0].id, env.make('August 2026 UTM', {
  '3 Nov 2026 7:30 PM Flexi Genie 10 Mins Busines': busTab,
  '3 Nov 2026 7:30 PM Flexi Genie 10 Mins Reg Team': regTab,
  '1 Nov 2026 11 AM Flexi Genie 10 Mins Busines': [['timestamp_incoming_webhook', 'first_name', 'email', 'phone'], reg(9)],
  '3 Nov 2026 7:30 PM New Session Busines': [],               // just created, no rows yet
  'Pivot Table 11': [['Row Labels', 'Count']],
}));
let ls = ctx.getLiveSessions();
eq(ls.sessions.map(s => s.title), ['3 Nov 2026 7:30 PM Flexi Genie 10 Mins', '1 Nov 2026 11 AM Flexi Genie 10 Mins Busines']);
eq(ls.sessions[0].tabs.map(t => [t.label, t.rows]), [['Busines', 6], ['Reg Team', 3]]);
assert.strictEqual(ls.sessions[0].tabs[0].lastEntry, 't'); // timestamp cell of the last row
let lst = ctx.getLiveList(ls.sessions[0].tabs.map(t => t.name), true);
eq(lst.rows.map(r => r[1]), ['r1@x.com', 'r2@x.com', 'r3@x.com', 'r4@x.com', 'r5@x.com']); // 3,4 in both tabs -> once
assert.strictEqual(lst.rows[4][3], '3 Nov 2026 7:30 PM Flexi Genie 10 Mins Reg Team');
const st2 = k => lst.steps.find(s => s.label === k).count;
eq([st2('Rows in selected tabs'), st2('Duplicates (same email or phone)'), st2('Buyers'), st2('Internal / test emails')], [9, -2, -1, -1]);
// new registrations arrive -> next call includes them (no caching of data)
live.getSheetByName('3 Nov 2026 7:30 PM Flexi Genie 10 Mins Reg Team').appendRow(reg(6, '03/11/2026 18:00'));
lst = ctx.getLiveList(ls.sessions[0].tabs.map(t => t.name), true);
assert.strictEqual(lst.final, 6);
// the empty new tab gets its header later and then shows up
live.getSheetByName('3 Nov 2026 7:30 PM New Session Busines').appendRow(['timestamp_incoming_webhook', 'first_name', 'email', 'phone']);
live.getSheetByName('3 Nov 2026 7:30 PM New Session Busines').appendRow(reg(7));
ls = ctx.getLiveSessions();
assert.ok(ls.sessions.some(s => s.title === '3 Nov 2026 7:30 PM New Session Busines'));
// past webinar lists, combined with live registrants
const pastSS = at(ctx.CONFIG.PAST_SHEET_ID, env.make('Active Campaign List Upload 11 - 2026', {
  '12 NOV 2026 10 Mins Workshop missed': [['Name', 'Email', 'Phone', 'Time'], ['M1', 'm1@x.com', '9300000001', '0'], ['R1 again', 'R1@x.com', '', '0'], ['Buyer', '', '9000000001', '0']],
  '12 NOV 2026 10 Mins Workshop pitch': [['Name', 'Email', 'Phone', 'Time'], ['P1', 'p1@x.com', '9300000002', '265']],
  '11 NOV 2026 10 Mins Workshop missed': [['Name', 'Email', 'Phone', 'Time'], ['M2', 'm2@x.com', '9300000003', '0']],
  '_tmp_counts': [['a', 'b']],
}));
const pl = ctx.getPastLists();
eq(pl.days.map(d => d.date), ['2026-11-12', '2026-11-11']);
eq(pl.days[0].tabs.map(t => [t.kind, t.rows]), [['missed', 3], ['pitch', 1]]);
const liveTabs = ls.sessions.find(s => s.title === '3 Nov 2026 7:30 PM Flexi Genie 10 Mins').tabs.map(t => ({ src: 'live', name: t.name }));
const mixed = ctx.getLiveList(liveTabs.concat([{ src: 'past', name: '12 NOV 2026 10 Mins Workshop missed' }, { src: 'past', name: '11 NOV 2026 10 Mins Workshop missed' }]), true);
eq(mixed.rows.map(r => r[1]).slice(-2), ['m1@x.com', 'm2@x.com']);        // R1 already in live list, buyer removed
assert.strictEqual(mixed.final, 8);
assert.strictEqual(mixed.steps.find(s => s.label === 'Buyers').count, -2);
// past lists only, no live registrants
const pastOnly = ctx.getLiveList([{ src: 'past', name: '12 NOV 2026 10 Mins Workshop missed' }, { src: 'past', name: '11 NOV 2026 10 Mins Workshop missed' }], true);
eq(pastOnly.rows.map(r => r[1]), ['m1@x.com', 'm2@x.com']);   // buyer removed, R1 has no phone, both lists merged
assert.strictEqual(pastOnly.steps.find(s => s.label === 'No phone number').count, -1);
eq(pastOnly.steps[0], { label: 'Rows in selected tabs', count: 4, add: true });
// second live sheet ("Sakshi 10 Min Data Sheet"): one tab per session
const sak = at(ctx.CONFIG.LIVE_SHEETS[1].id, env.make('Sakshi 10 Min Data Sheet', {
  '17 Nov 2026 7:30 PM': [['timestamp_incoming_webhook', 'first_name', 'email', 'phone', 'profession']],
  '15 Nov 2026 11 AM': [['timestamp_incoming_webhook', 'first_name', 'email', 'phone', 'profession'],
    ['12/11/2026', 'Test', 'anita.d@flexifunnels.com', '+917302716741', 'Student'], ['12/11/2026', 'S1', 's1@x.com', '+917828765453', 'Job'],
    ['12/11/2026', 'R1 dup', 'r1@x.com', '', 'Other']],
  'Sheet1': [],
}));
eq(ctx.getLiveSources().map(x => x.key), ['aug', 'sakshi']);
const sk = ctx.getLiveSessions('sakshi');
eq(sk.sessions.map(x => [x.title, x.tabs[0].rows]), [['17 Nov 2026 7:30 PM', 0], ['15 Nov 2026 11 AM', 3]]); // upcoming session shows before anyone registers
const skList = ctx.getLiveList([{ src: 'sakshi', name: '15 Nov 2026 11 AM' }, { src: 'aug', name: '3 Nov 2026 7:30 PM Flexi Genie 10 Mins Reg Team' }], false);
eq(skList.rows.map(r => r[1]).sort(), ['r1@x.com', 'r3@x.com', 'r4@x.com', 'r5@x.com', 'r6@x.com', 's1@x.com']); // test email removed, email-only R1 kept (phone filter off)
assert.strictEqual(ctx.getLiveSessions().src, 'aug');                                  // default = first live sheet

// Audiences page: sheet tabs in the dropdowns, mixed with saved audiences
const cat = ctx.getSheetCatalog();
eq(cat.map(c => c.key), ['aug', 'sakshi', 'past']);
assert.ok(cat[2].tabs.some(t => t.name === '12 NOV 2026 10 Mins Workshop missed' && t.rows === 3));
const mixedBuild = ctx.buildList(['src:sakshi::15 Nov 2026 11 AM', 'src:past::11 NOV 2026 10 Mins Workshop missed', 'Web 2'],
  ['src:past::12 NOV 2026 10 Mins Workshop pitch'], true);
eq(mixedBuild.steps.filter(x => x.add).map(x => x.label), ['15 Nov 2026 11 AM', '11 NOV 2026 10 Mins Workshop missed', 'Web 2']);
eq(mixedBuild.rows.map(r => r[1]).sort(), ['', 'd@x.com', 'm2@x.com', 's1@x.com']);   // '' = phone-only contact C from Web 2
assert.strictEqual(mixedBuild.steps.find(x => x.label === 'Internal / test emails').count, -1);
// speed: only the newest sessions are counted when the page opens; the rest come from the hourly warm-up
const bigTabs = {};
for (let d = 1; d <= 14; d++) bigTabs[d + ' Nov 2026 7:30 PM'] = [['timestamp_incoming_webhook', 'first_name', 'email', 'phone']].concat([[ 't', 'X' + d, `x${d}@x.com`, '+91' + (9400000000 + d) ]]);
const big = env.make('Big Live Sheet', bigTabs);
ctx.CONFIG.LIVE_SHEETS.push({ key: 'big', label: 'Big Live Sheet', id: big.id });
let bs = ctx.getLiveSessions('big');
assert.strictEqual(bs.sessions.length, 14);
eq(bs.sessions.slice(0, 10).map(x => x.tabs[0].rows), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);    // newest 10 counted live
eq(bs.sessions.slice(10).map(x => [x.tabs[0].rows, x.tabs[0].cached]), [[null, true], [null, true], [null, true], [null, true]]);
ctx.warmSheetCaches();                                                                   // hourly trigger
bs = ctx.getLiveSessions('big');
eq(bs.sessions.slice(10).map(x => x.tabs[0].rows), [1, 1, 1, 1]);                         // now from the cache
eq(ctx.getLiveSessions('big', true).sessions.map(x => x.tabs[0].cached), Array(14).fill(false)); // "show older" counts all
// a cached count never limits a download: data is read fresh
big.getSheetByName('1 Nov 2026 7:30 PM').appendRow(['t', 'New', 'new1@x.com', '+919499999999']);
assert.strictEqual(ctx.getLiveList([{ src: 'big', name: '1 Nov 2026 7:30 PM' }], true).final, 2);
assert.ok(ctx.ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'warmSheetCaches'), 'hourly warm-up installed');
// catalog: names + cached counts, newest first
const bigCat = ctx.getSheetCatalog().find(c => c.key === 'big');
eq(bigCat.tabs.slice(0, 3).map(t => t.name), ['14 Nov 2026 7:30 PM', '13 Nov 2026 7:30 PM', '12 Nov 2026 7:30 PM']);
console.log('Server tests passed.');
