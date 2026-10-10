// Fake backend for previewing Index.html in a normal browser (no Apps Script).
(function () {
  function wait(v, ms) { return new Promise(function (r) { setTimeout(function () { r(v); }, ms || 300); }); }
  var names = ['Webinar – 14 Sep', 'Webinar – 21 Sep', 'Masterclass – 28 Sep', 'Webinar – 5 Oct', 'Instagram leads Oct', 'Webinar – 12 Oct'];
  var sizes = [18420, 9310, 6840, 22150, 4120, 12980];
  var auds = names.map(function (n, i) {
    return { name: n, contacts: sizes[i], withPhone: Math.round(sizes[i] * .93), uploaded: sizes[i] + 1400, duplicates: 1100, invalid: 120,
      buyersRemoved: 180 + i * 7, source: 'upload.csv', createdAt: new Date(Date.now() - (6 - i) * 7 * 864e5).toISOString(), createdBy: 'arman@flexifunnels.com' };
  });
  window.MOCK_API = {
    getState: function () {
      return wait({ user: 'arman@flexifunnels.com', audiences: auds, dbUrl: '#', log: [
        { time: new Date(Date.now() - 3e5).toISOString(), user: 'auto-sync', action: 'Removed new buyers', details: '14 removed: Webinar – 12 Oct −9, Webinar – 5 Oct −5' },
        { time: new Date(Date.now() - 7e6).toISOString(), user: 'arman@flexifunnels.com', action: 'Uploaded audience', details: 'Webinar – 12 Oct: 14,620 rows → 12,980 saved (1,450 duplicates, 31 invalid, 159 buyers removed)' }],
        buyers: { count: 7520, lastSync: new Date(Date.now() - 18e5).toISOString(), sources: [{ label: 'Buyers', count: 3412, url: '#' }, { label: 'Opted-out', count: 2960, url: '#' }, { label: 'Removed by reminder team', count: 1148, url: '#' }] } });
    },
    buildList: function (bases, sub, phoneOnly) {
      var steps = bases.map(function (n) { return { label: n, count: auds.find(function (x) { return x.name === n; }).contacts, add: true }; });
      var merged = steps.reduce(function (s, x) { return s + x.count; }, 0);
      if (bases.length > 1) steps.push({ label: 'In more than one of these audiences', count: -Math.round(merged * .18) });
      if (sub.length) steps.push({ label: 'Already in subtracted audiences', count: -Math.round(merged * .2) });
      steps.push({ label: 'Buyers', count: -42 }, { label: 'Opted-out', count: -31 }, { label: 'Removed by reminder team', count: -9 });
      if (phoneOnly) steps.push({ label: 'No phone number', count: -610 });
      var fin = merged + steps.filter(function (x) { return !x.add; }).reduce(function (s, x) { return s + x.count; }, 0);
      return wait({ bases: bases, subtract: sub, phoneOnly: phoneOnly, steps: steps, mergedTotal: merged, final: fin, rows: [['A', 'a@x.com', '919840402282']] }, 700);
    },
    startUpload: function () { return wait('_upload_1'); },
    appendUpload: function () { return wait(1, 200); },
    finishUpload: function (id, name) {
      return wait({ name: name, uploaded: 5, duplicates: 1, invalid: 1, buyers: 1, saved: 2, withPhone: 2 }, 600);
    },
    cancelUpload: function () { return wait(); },
    fetchDriveTable: function () { return wait({ fileName: 'Sheet / Sheet1', table: [['Name', 'Email', 'Phone'], ['Ravi', 'ravi@x.com', '9840402282']] }); },
    saveListAsAudience: function (n) { return wait({ name: n, saved: 100 }); },
    getAudienceRows: function () { return wait([['A', 'a@x.com', '919840402282']]); },
    deleteAudience: function () { return wait(true); },
    getSourcesState: function () {
      var cols = { name: 1, email: 2, phone: 3 };
      function src(id, name, tabs) { return { id: id, name: name, tabs: tabs, total: tabs.reduce(function (t, x) { return t + x.rows; }, 0), scanned: new Date(Date.now() - 2e6).toISOString() }; }
      return wait({ scanned: new Date(Date.now() - 2e6).toISOString(), usedUrl: '#', sources: [
        src('s1', 'August 2026 UTM', [{ name: '11 Oct 2026 7:30 PM Flexi Genie 10 Min Reg team', rows: 339, cols: cols }, { name: '4 Oct 2026 Flexi Genie', rows: 5120, cols: cols }, { name: '27 Sep 2026 TFP Live', rows: 8840, cols: cols }, { name: 'Lead Summary', rows: 0, cols: null }]),
        src('s2', 'TFP Signups: UTM', [{ name: 'TFP Facebook Ads (Training)', rows: 227903, cols: cols }, { name: 'TFP Google Ads (Special)', rows: 57066, cols: cols }, { name: 'Sheet21', rows: 9510, cols: cols }]),
        src('s3', 'PSP Signups: UTM', [{ name: 'PSP Facebook', rows: 41200, cols: cols }]),
        src('s4', 'June-July 2026 UTM', [{ name: 'Webinar 5 Jul', rows: 6100, cols: cols }])] ,
        batches: [{ id: 'B1', name: 'Flexi Genie webinar – 11 Oct', sheet: 'TFP Signups: UTM', tabs: '2 tabs', pulled: 10000, createdAt: new Date(Date.now() - 6e8).toISOString(), by: 'arman@flexifunnels.com' }] });
    },
    previewPool: function (id, tabs) {
      var per = {}; tabs.forEach(function (t, i) { per[t] = 30000 - i * 9000; });
      return wait({ available: 61240, perTab: per, steps: [{ label: 'Rows in selected tabs', count: 284969, add: true }, { label: 'Duplicates (same email or phone)', count: -171200 },
        { label: 'No valid email or phone', count: -310 }, { label: 'Buyers', count: -3122 }, { label: 'Opted-out', count: -2011 }, { label: 'Removed by reminder team', count: -640 },
        { label: 'Already used in earlier batches', count: -10000 }, { label: 'Internal / test emails', count: -86 }, { label: 'No phone number', count: -36360 }] }, 900);
    },
    pullBatch: function (id, tabs, p, n, name) { var per = {}; per[tabs[0]] = n - 2000; if (tabs[1]) per[tabs[1]] = 2000; return wait({ id: 'B2', name: name, pulled: n, perTab: per, rows: [['A', 'a@x.com', '919840402282', tabs[0]]] }, 900); },
    getBatchRows: function () { return wait([['A', 'a@x.com', '919840402282', 'Tab']]); },
    releaseBatch: function () { return wait(true); },
    scanSourcesNow: function () { return wait({ sheets: 35 }); },
    addSourceByLink: function () { return wait({ name: 'Sheet' }); },
    syncBuyersNow: function () { return wait({ removed: 0 }); }
  };
})();
