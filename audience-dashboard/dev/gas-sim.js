// Minimal fake Google Apps Script environment to run the .gs server code in Node.
// Usage: const env = require('./gas-sim')(spreadsheets); env.run('setup') ...
const fs = require('fs'), path = require('path'), vm = require('vm');

function makeEnv(initial) {
  const files = {}; // id -> spreadsheet
  let nextId = 1;
  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = this.sh.data[this.r - 1 + i] || [];
        const o = [];
        for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; o.push(v === undefined ? '' : v); }
        out.push(o);
      }
      return out;
    }
    getDisplayValues() { return this.getValues().map(r => r.map(String)); }
    setValues(v) {
      if (v.length !== this.nr || v[0].length !== this.nc) throw new Error('setValues size mismatch');
      if (this.r - 1 + this.nr > this.sh.maxRows) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      v.forEach((row, i) => { const d = this.sh.data[this.r - 1 + i] = this.sh.data[this.r - 1 + i] || []; row.forEach((x, j) => { d[this.c - 1 + j] = x; }); });
      return this;
    }
    setValue(x) { return this.setValues([[x]]); }
    clearContent() { for (let i = 0; i < this.nr; i++) { const d = this.sh.data[this.r - 1 + i]; if (d) for (let j = 0; j < this.nc; j++) d[this.c - 1 + j] = ''; } this.sh.trim(); return this; }
    setNumberFormat() { return this; }
  }
  class Sheet {
    constructor(ss, name, data) { this.ss = ss; this.name = name; this.data = data || []; this.maxRows = Math.max(1000, this.data.length); this.id = Math.floor(Math.random() * 1e9); }
    trim() { while (this.data.length && !(this.data[this.data.length - 1] || []).some(x => x !== '' && x != null)) this.data.pop(); }
    getName() { return this.name; } setName(n) { this.name = n; }
    getSheetId() { return this.id; } getParent() { return this.ss; }
    getLastRow() { this.trim(); return this.data.length; }
    getLastColumn() { return Math.max(0, ...this.data.map(r => r.length)); }
    getMaxRows() { return this.maxRows; }
    insertRowsAfter(_, n) { this.maxRows += n; }
    deleteRows(start, n) { this.data.splice(start - 1, n); this.maxRows -= n; }
    deleteRow(r) { this.data.splice(r - 1, 1); }
    getRange(a, b, c, d) {
      if (typeof a === 'string') return new Range(this, 1, 1, this.maxRows, 3);
      return new Range(this, a, b, c || 1, d || 1);
    }
    getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    appendRow(row) { this.trim(); this.data.push(row.slice()); if (this.data.length > this.maxRows) this.maxRows = this.data.length; }
    clearContents() { this.data = []; }
    setFrozenRows() {}
  }
  class SS {
    constructor(name, tabs) { this.id = 'ss' + (nextId++) + 'xxxxxxxxxxxxxxxxxxxxxx'; this.name = name; this.sheets = Object.entries(tabs || { Sheet1: [] }).map(([n, d]) => new Sheet(this, n, d)); files[this.id] = this; }
    getId() { return this.id; } getName() { return this.name; } getUrl() { return 'https://sheet/' + this.id; }
    getSheets() { return this.sheets; }
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n) { if (this.getSheetByName(n)) throw new Error('exists'); const s = new Sheet(this, n, []); this.sheets.push(s); return s; }
    deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); }
  }
  const props = {};
  const triggers = [];
  const ctx = {
    console,
    SpreadsheetApp: {
      openById: id => { if (!files[id]) throw new Error('not found ' + id); return files[id]; },
      create: name => new SS(name),
      getActiveSpreadsheet: () => ctx.__active,
    },
    DriveApp: {
      searchFiles: q => { const term = q.match(/title contains "([^"]+)"/)[1]; const list = Object.values(files).filter(f => f.name.includes(term)); let i = 0;
        return { hasNext: () => i < list.length, next: () => { const f = list[i++]; return { getId: () => f.id, getName: () => f.name }; } }; },
    },
    MimeType: { GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet', CSV: 'text/csv', PLAIN_TEXT: 'text/plain' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = String(v); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'arman@flexifunnels.com' }) },
    Utilities: { formatDate: (d) => 'T' + (ctx.__clock = (ctx.__clock || 0) + 1) },
    ScriptApp: { getProjectTriggers: () => triggers, deleteTrigger: () => {}, newTrigger: h => ({ timeBased: () => ({ everyHours: () => ({ create: () => triggers.push({ getHandlerFunction: () => h }) }) }) }) },
    Logger: { log() {} },
    HtmlService: {},
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..');
  ['Logic.gs', 'Code.gs', 'Lists.gs', 'Sources.gs'].forEach(f => vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f }));
  return { ctx, files, SS, props, make: (name, tabs) => new SS(name, tabs) };
}
module.exports = makeEnv;
