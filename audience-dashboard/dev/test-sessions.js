// Session grouping on the real tab names of "August 2026 UTM": node dev/test-sessions.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const m = { exports: {} };
new Function('module', fs.readFileSync(path.join(__dirname, '..', 'Logic.gs'), 'utf8'))(m);
const L = m.exports;
const tabs = ["3 Nov 2026 7:30 PM Flexi Genie 10 Mins Busines","3 Nov 2026 7:30 PM Flexi Genie 10 Mins Reg Team","1 Nov 2026 7:30 PM Flexi Genie 10 Mins Busines","1 Nov 2026 7:30 PM Flexi Genie 10 Mins Reg Team","1 Nov 2026 11 AM Flexi Genie 10 Mins Busines","1 Nov 2026 11 AM Flexi Genie 10 Mins Reg Team","29 Oct 2026 8 Figure Faceless Product Encore","29 Oct 2026 8 Figure Faceless Product Encore Reg","28 Oct 2026 7:30 PM Flexi Genie 10 Mins Busines","28 Oct 2026 7:30 PM Flexi Genie 10 Mins Reg Team","Sheet96","25 Oct 2026 7:30 PM Flexi Genie 10 Mins Busines","25 Oct 2026 7:30 PM Flexi Genie 10 Mins Reg Team","25 Oct 2026 11 AM Flexi Genie 10 Mins Busines","25 Oct 2026 8 Figure Faceless Product","25 Oct 2026 8 Figure Faceless Product Reg team","21 Oct 2026 7:30 PM Flexi Genie 10 Mins Busines","21 Oct 2026 7:30 PM Flexi Genie 10 Min Reg team","Copy of 19 Oct 2026 7:30 PM Flexi Genie 10 Mins Busines","7 Oct 2026 7:30 PM Flexi Genie 10 Min Reg team","11 Oct 2026 7:30 PM Flexi Genie 10 Mins Busines","7 Oct 2026 7:30 PM Flexi Genie 10 Mins Busines","4 Oct 2026 7:30 PM Flexi Genie 10 Mins Busines","4 Oct 2026 Flexi Genie 10 Mins Business Workshop","4 Oct 2026 Flexi Genie 10 Mins Business Reg team","30 Sept 2026 Flexi Genie 10 Mins Business Workshop","30 Sept 2026 Flexi Genie 10 Mins Business Reg Team","28 Sept 2026, 8 Figure Faceless Product (ENCORE)"," 28 Sept 2026, 8 Figure Faceless team Reg (encore)","Pivot Table 11","19-20 Sept 2026 AI Income Blueprint Event","Pivot Table - 19-20 Sept 2026 AI Income event","19-20 Sept 2026 AI Event REG Team","[GET] Webhook — 1786605113688","18 Aug FlexiGenie Encore","18 Aug FlexiGenie Encore REG TEAM","20260804_214045_FunnelBuilderAgentLaunch1101476_subscriber"];
const g = L.groupSessions(tabs, 2026);
const by = Object.fromEntries(g.sessions.map(s => [s.key, s]));
const s = g.sessions[0];
assert.strictEqual(s.title, '3 Nov 2026 7:30 PM Flexi Genie 10 Mins');
assert.deepStrictEqual(s.tabs.map(t => t.label), ['Busines', 'Reg Team']);
assert.strictEqual(g.sessions[1].time, '7:30 PM'); assert.strictEqual(g.sessions[2].time, '11 AM'); // 1 Nov evening before morning
assert.strictEqual(by['2026-10-21|7:30 PM|flexi'].tabs.length, 2);            // "Mins" vs "Min"
assert.strictEqual(by['2026-10-07|7:30 PM|flexi'].tabs.length, 2);            // tabs not next to each other
assert.strictEqual(by['2026-10-25|7:30 PM|flexi'].tabs.length, 2);
assert.strictEqual(by['2026-10-25|11 AM|flexi'].tabs.length, 1);
assert.strictEqual(by['2026-10-25||8'].tabs.length, 2);                        // 8 Figure pair, no time
assert.strictEqual(by['2026-10-04|7:30 PM|flexi'].tabs.length, 1);            // separate from the no-time 4 Oct pair
assert.strictEqual(by['2026-10-04||flexi'].tabs.length, 2);
assert.strictEqual(by['2026-09-28||8'].tabs.length, 2);                        // leading space + comma
assert.strictEqual(by['2026-09-19||ai'].tabs.length, 2);                       // 19-20 Sept
assert.strictEqual(by['2026-08-18||flexigenie'].tabs.length, 2);               // no year in name
assert.deepStrictEqual(g.other.sort(), ['20260804_214045_FunnelBuilderAgentLaunch1101476_subscriber', 'Copy of 19 Oct 2026 7:30 PM Flexi Genie 10 Mins Busines', 'Pivot Table - 19-20 Sept 2026 AI Income event', 'Pivot Table 11', 'Sheet96', '[GET] Webhook — 1786605113688'].sort());
// past-webinar sheet ("Active Campaign List Upload 11 - 2026")
const past = ['Sheet62', 'Attendees 21 Oct-11 Nov (no buyers, unique)', '12 NOV 2026 10 Mins Workshop attendee(with buyers)', '12 NOV 2026 10 Mins Workshop attendee (w/o buyers)',
  '12 NOV 2026 10 Mins Workshop pitch', '12 NOV 2026 10 Mins Workshop non-pitch', '12 NOV 2026 10 Mins Workshop missed', '1 NOV 26 encore 10 Mins Workshop att(with buyers)',
  '01 NOV 26 encore 10 Mins Workshop att (w/o buyers)', '01 NOV 2026 encore 10 Mins Workshop missed', '30 Sep2026 10 Mins Workshop pitch', '11 OCT 2026 10 Mins Workshop missed1', '_tmp_counts'];
const pd = L.groupByDate(past, 2026);
assert.deepStrictEqual(pd.days.map(d => d.date), ['2026-11-12', '2026-11-01', '2026-10-11', '2026-09-30']);
assert.deepStrictEqual(pd.days[0].tabs.map(t => t.kind), ['attended (with buyers)', 'attended (no buyers)', 'pitch', 'non-pitch', 'missed']);
assert.strictEqual(pd.days[0].tabs[4].label, '10 Mins Workshop missed');
assert.strictEqual(pd.days[1].tabs.length, 3);                      // "1 NOV 26" + "01 NOV 2026" together
assert.strictEqual(pd.days[2].tabs[0].kind, 'missed');              // "missed1"
assert.strictEqual(pd.days[3].tabs[0].label, '10 Mins Workshop pitch'); // "Sep2026"
assert.ok(pd.other.includes('Attendees 21 Oct-11 Nov (no buyers, unique)'));
console.log('Session grouping tests passed.', g.sessions.length, 'sessions');
