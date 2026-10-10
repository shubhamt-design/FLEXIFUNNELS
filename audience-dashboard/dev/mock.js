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
        buyers: { count: 3412, lastSync: new Date(Date.now() - 18e5).toISOString(), sheetUrl: '#' } });
    },
    buildList: function (base, sub, phoneOnly) {
      var a = auds.find(function (x) { return x.name === base; });
      var steps = [{ label: base, count: a.contacts }];
      if (sub.length) steps.push({ label: 'Already in selected audiences', count: -Math.round(a.contacts * .27) });
      steps.push({ label: 'Buyers', count: -42 });
      if (phoneOnly) steps.push({ label: 'No phone number', count: -610 });
      var fin = steps.reduce(function (s, x) { return s + x.count; }, 0);
      return wait({ base: base, subtract: sub, phoneOnly: phoneOnly, steps: steps, final: fin, rows: [['A', 'a@x.com', '919840402282']] }, 700);
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
    syncBuyersNow: function () { return wait({ removed: 0 }); }
  };
})();
