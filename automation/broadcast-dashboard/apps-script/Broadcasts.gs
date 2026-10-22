/**
 * Server API called from the web app via google.script.run:
 *   getDashboardData()          everything the app needs, in one read
 *   saveBroadcast(input)        create or update one broadcast
 *   getBroadcastHistory(id)     change log for one broadcast
 *   createFromTemplate(input)   bulk-create drafts from a schedule (Templates.gs)
 *   saveCampaign(input)         create, update or rename a campaign
 *   saveSettings(input)         see Config.gs
 *
 * All writes run under a script lock, re-validate on the server, and write a
 * whole row with a single setValues call.
 */

var ID_PREFIX = 'BC-';
var SEQ_PROPERTY = 'LAST_BROADCAST_SEQ';
var REQUEST_CACHE_SECONDS = 600;

var LIMITS = {
  name: 150, campaign: 100, segment: 100, message: 5000, notes: 2000,
  count: 1e9, money: 1e12
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function getDashboardData() {
  var tz = Session.getScriptTimeZone();
  var broadcasts = readTable_(getSheet_(SHEETS.DATA), BROADCAST_COLUMNS).objects
    .filter(function (b) { return b.id; })
    .map(function (b) { return normalizeBroadcast_(b, tz); });
  broadcasts.sort(function (a, b) {
    return (b.date + b.time).localeCompare(a.date + a.time);
  });

  var campaigns = readTable_(getSheet_(SHEETS.CAMPAIGNS), CAMPAIGN_COLUMNS).objects
    .filter(function (c) { return c.name; })
    .map(function (c) {
      return {
        name: String(c.name), category: String(c.category || ''),
        startDate: toDateString_(c.startDate, tz), endDate: toDateString_(c.endDate, tz),
        objective: String(c.objective || ''), notes: String(c.notes || '')
      };
    });

  return {
    config: readConfig_(),
    broadcasts: broadcasts,
    campaigns: campaigns,
    templates: readTemplates_(),
    user: currentUser_(),
    today: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
    now: Utilities.formatDate(new Date(), tz, 'HH:mm'),
    timeZone: tz
  };
}

function getBroadcastHistory(id) {
  id = cleanText_(id, 40);
  if (!id) throw new Error('Missing Broadcast ID.');
  var tz = Session.getScriptTimeZone();
  return readTable_(getSheet_(SHEETS.HISTORY), HISTORY_COLUMNS).objects
    .filter(function (h) { return h.id === id; })
    .map(function (h) {
      return {
        timestamp: toTimestampString_(h.timestamp, tz),
        action: String(h.action), user: String(h.user || ''),
        version: h.version, changes: String(h.changes || '')
      };
    })
    .reverse();
}

// ---------------------------------------------------------------------------
// Broadcast writes
// ---------------------------------------------------------------------------

/**
 * @param {Object} input form fields plus:
 *   id              set when editing an existing record
 *   version         version the user loaded (detects concurrent edits)
 *   requestId       unique per form submission (makes double-submits harmless)
 *   allowDuplicate  true once the user confirmed a look-alike record is intended
 * @return {{ok:boolean, message:string, record?:Object, errors?:Object,
 *     duplicateOf?:string}}
 */
function saveBroadcast(input) {
  if (!input || typeof input !== 'object') throw new Error('No data received.');

  var cache = CacheService.getScriptCache();
  var requestKey = input.requestId ? 'req:' + String(input.requestId).slice(0, 80) : null;
  if (requestKey) {
    var cached = cache.get(requestKey);
    if (cached) return JSON.parse(cached);
  }

  var result = withLock_(function () {
    var config = readConfig_();
    var sheet = getSheet_(SHEETS.DATA);
    var table = readTable_(sheet, BROADCAST_COLUMNS);
    var tz = Session.getScriptTimeZone();
    var editingId = cleanText_(input.id, 40);
    var rowIndex = -1;
    var existing = null;

    if (editingId) {
      rowIndex = findRowIndex_(table, 'id', editingId);
      if (rowIndex === -1) {
        throw new Error('Broadcast ' + editingId + ' no longer exists. Reload the dashboard.');
      }
      existing = normalizeBroadcast_(table.objects[rowIndex], tz);
      if (Number(input.version) !== Number(existing.version)) {
        return {
          ok: false,
          conflict: true,
          message: 'Someone else updated ' + editingId + ' after you opened it. ' +
            'Reload the record to see their changes, then edit again.'
        };
      }
    }

    var validation = validateBroadcast_(input, config, existing);
    if (Object.keys(validation.errors).length) {
      return { ok: false, errors: validation.errors, message: 'Please fix the highlighted fields.' };
    }
    var record = validation.record;
    var now = new Date();
    var user = currentUser_();

    if (existing) {
      var changes = diffRecords_(existing, record);
      if (!changes.length) {
        return { ok: true, unchanged: true, message: 'No changes to save.', record: existing };
      }
      record.id = existing.id;
      record.createdAt = table.objects[rowIndex].createdAt;
      record.createdBy = existing.createdBy;
      record.updatedAt = now;
      record.updatedBy = user;
      record.version = (Number(existing.version) || 1) + 1;

      writeRow_(sheet, table, rowIndex + 2, table.rows[rowIndex], record);
      appendHistory_(record.id, 'UPDATE', user, record.version, changes.join('\n'),
        JSON.stringify(existing));
      ensureCampaign_(record.campaign, config);
      return { ok: true, message: 'Broadcast ' + record.id + ' updated.',
        record: normalizeBroadcast_(record, tz) };
    }

    if (!input.allowDuplicate) {
      var dup = findDuplicate_(table.objects, record, tz);
      if (dup) {
        return {
          ok: false, duplicateOf: dup.id,
          message: 'This looks like a duplicate of ' + dup.id + ' ("' + dup.name + '"): same ' +
            'name, campaign, channel, segment, date and time. Save anyway?'
        };
      }
    }

    record.id = nextBroadcastId_(table);
    record.createdAt = now;
    record.createdBy = user;
    record.updatedAt = now;
    record.updatedBy = user;
    record.version = 1;

    writeRow_(sheet, table, sheet.getLastRow() + 1, null, record);
    appendHistory_(record.id, 'CREATE', user, 1, 'Record created', '');
    ensureCampaign_(record.campaign, config);
    return { ok: true, message: 'Broadcast ' + record.id + ' saved.',
      record: normalizeBroadcast_(record, tz) };
  });

  if (requestKey && result.ok) {
    cache.put(requestKey, JSON.stringify(result), REQUEST_CACHE_SECONDS);
  }
  return result;
}

/** Server-side validation. Returns {errors: {field: message}, record}. */
function validateBroadcast_(input, config, existing) {
  var errors = {};
  var r = {};

  function allowed(list, field) {
    var value = cleanText_(input[field], 100);
    // A value that was valid when saved stays valid even if removed from settings.
    if (existing && existing[field] === value) return value;
    return list.indexOf(value) !== -1 ? value : null;
  }

  r.name = cleanText_(input.name, LIMITS.name + 1);
  if (!r.name) errors.name = 'Enter a broadcast name.';
  else if (r.name.length > LIMITS.name) errors.name = 'Keep the name under ' + LIMITS.name + ' characters.';

  r.campaign = cleanText_(input.campaign, LIMITS.campaign + 1);
  if (!r.campaign) errors.campaign = 'Enter or pick a campaign.';
  else if (r.campaign.length > LIMITS.campaign) errors.campaign = 'Keep the campaign name under ' + LIMITS.campaign + ' characters.';

  r.date = cleanText_(input.date, 10);
  if (!isValidDate_(r.date)) errors.date = 'Pick a valid date.';

  r.time = cleanText_(input.time, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)) errors.time = 'Enter a time like 18:30.';

  r.type = allowed(config.types, 'type');
  if (!r.type) errors.type = 'Pick a broadcast type.';

  r.segment = cleanText_(input.segment, LIMITS.segment + 1);
  if (!r.segment) errors.segment = 'Enter the audience segment.';
  else if (r.segment.length > LIMITS.segment) errors.segment = 'Keep the segment under ' + LIMITS.segment + ' characters.';

  r.channel = allowed(config.channels, 'channel');
  if (!r.channel) errors.channel = 'Pick a channel.';

  r.status = STATUSES.indexOf(String(input.status)) !== -1 ? String(input.status) : null;
  if (!r.status) errors.status = 'Pick a status.';

  r.message = cleanText_(input.message, LIMITS.message + 1, true);
  if (r.message.length > LIMITS.message) errors.message = 'Message is longer than ' + LIMITS.message + ' characters.';

  r.notes = cleanText_(input.notes, LIMITS.notes + 1, true);
  if (r.notes.length > LIMITS.notes) errors.notes = 'Notes are longer than ' + LIMITS.notes + ' characters.';

  var currency = cleanText_(input.currency, 3).toUpperCase();
  r.currency = currency && (existing && existing.currency === currency) ||
    config.currencies.indexOf(currency) !== -1 ? currency : null;
  if (!r.currency) errors.currency = 'Pick a currency.';

  // Counts: required ones default to 0, optional ones may stay blank.
  [['audience', true], ['sent', true], ['delivered', true], ['clicks', true],
    ['shares', false], ['conversions', false]].forEach(function (f) {
    var parsed = parseNumber_(input[f[0]], true, LIMITS.count);
    if (parsed.error) errors[f[0]] = parsed.error;
    r[f[0]] = parsed.value === null ? (f[1] ? 0 : '') : parsed.value;
  });
  [['revenue', false], ['cost', true]].forEach(function (f) {
    var parsed = parseNumber_(input[f[0]], false, LIMITS.money);
    if (parsed.error) errors[f[0]] = parsed.error;
    r[f[0]] = parsed.value === null ? (f[1] ? 0 : '') : parsed.value;
  });

  if (!errors.delivered && !errors.sent && r.delivered > r.sent) {
    errors.delivered = 'Delivered (' + r.delivered + ') can\'t be more than sent (' + r.sent + ').';
  }
  if (!errors.sent && !errors.audience && r.audience > 0 && r.sent > r.audience) {
    errors.sent = 'Sent (' + r.sent + ') can\'t be more than the audience size (' + r.audience + ').';
  }
  if (r.status === 'Sent') {
    if (!errors.audience && !(r.audience > 0)) errors.audience = 'A sent broadcast needs an audience size.';
    if (!errors.sent && !(r.sent > 0)) errors.sent = 'A sent broadcast needs the number of messages sent.';
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (!errors.date && r.date > today) errors.date = 'A sent broadcast can\'t be dated in the future. Use status Draft for scheduled ones.';
  }

  return { errors: errors, record: r };
}

function findDuplicate_(objects, record, tz) {
  var key = duplicateKey_(record);
  for (var i = 0; i < objects.length; i++) {
    if (!objects[i].id) continue;
    var other = normalizeBroadcast_(objects[i], tz);
    if (duplicateKey_(other) === key) return other;
  }
  return null;
}

function duplicateKey_(b) {
  return [b.name, b.campaign, b.channel, b.segment, b.date, b.time]
    .map(function (v) { return String(v).trim().toLowerCase(); }).join('|');
}

function nextBroadcastId_(table) {
  return nextBroadcastIds_(table, 1)[0];
}

/** Reserves `count` consecutive IDs. Call under the script lock. */
function nextBroadcastIds_(table, count) {
  var props = PropertiesService.getScriptProperties();
  var seq = Number(props.getProperty(SEQ_PROPERTY)) || 0;
  table.objects.forEach(function (o) {
    var m = /^BC-(\d+)$/.exec(String(o.id));
    if (m) seq = Math.max(seq, Number(m[1]));
  });
  var ids = [];
  for (var i = 0; i < count; i++) {
    seq += 1;
    ids.push(ID_PREFIX + ('00000' + seq).slice(-5));
  }
  props.setProperty(SEQ_PROPERTY, String(seq));
  return ids;
}

var DIFF_FIELDS = ['name', 'campaign', 'date', 'time', 'type', 'segment', 'channel', 'message',
  'status', 'audience', 'sent', 'delivered', 'clicks', 'shares', 'conversions', 'revenue', 'cost',
  'currency', 'notes'];

function diffRecords_(before, after) {
  var changes = [];
  DIFF_FIELDS.forEach(function (f) {
    var a = before[f] === null || before[f] === undefined ? '' : String(before[f]);
    var b = after[f] === null || after[f] === undefined ? '' : String(after[f]);
    if (a !== b) {
      var shorten = function (s) { return s.length > 80 ? s.slice(0, 77) + '...' : s; };
      changes.push(f + ': "' + shorten(a) + '" → "' + shorten(b) + '"');
    }
  });
  return changes;
}

function appendHistory_(id, action, user, version, changes, snapshot) {
  var sheet = getSheet_(SHEETS.HISTORY);
  var table = readHeaderOnly_(sheet, HISTORY_COLUMNS);
  var record = {
    timestamp: new Date(), id: id, action: action, user: user, version: version,
    changes: changes.slice(0, 45000), snapshot: snapshot.slice(0, 45000)
  };
  writeRow_(sheet, table, sheet.getLastRow() + 1, null, record);
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

/** Adds a campaign row when a broadcast mentions a campaign we have not seen. */
function ensureCampaign_(name, config) {
  var sheet = getSheet_(SHEETS.CAMPAIGNS);
  var table = readTable_(sheet, CAMPAIGN_COLUMNS);
  var lower = name.toLowerCase();
  var exists = table.objects.some(function (c) { return String(c.name).toLowerCase() === lower; });
  if (exists) return;
  var now = new Date();
  writeRow_(sheet, table, sheet.getLastRow() + 1, null, {
    name: name, category: config.campaignCategories.indexOf('Other') !== -1 ? 'Other' : '',
    startDate: '', endDate: '', objective: '', notes: 'Added automatically from a broadcast',
    createdAt: now, updatedAt: now
  });
}

/**
 * @param {Object} input {originalName?, name, category, startDate, endDate, objective, notes}
 * Renaming a campaign also renames it on every broadcast that uses it.
 */
function saveCampaign(input) {
  if (!input || typeof input !== 'object') throw new Error('No data received.');
  return withLock_(function () {
    var config = readConfig_();
    var errors = {};
    var c = {
      name: cleanText_(input.name, LIMITS.campaign + 1),
      category: cleanText_(input.category, 60),
      startDate: cleanText_(input.startDate, 10),
      endDate: cleanText_(input.endDate, 10),
      objective: cleanText_(input.objective, 500, true),
      notes: cleanText_(input.notes, 2000, true)
    };
    var originalName = cleanText_(input.originalName, LIMITS.campaign + 1);

    if (!c.name) errors.name = 'Enter a campaign name.';
    else if (c.name.length > LIMITS.campaign) errors.name = 'Keep the name under ' + LIMITS.campaign + ' characters.';
    if (c.category && config.campaignCategories.indexOf(c.category) === -1) {
      errors.category = 'Pick a category from the list.';
    }
    if (c.startDate && !isValidDate_(c.startDate)) errors.startDate = 'Pick a valid date.';
    if (c.endDate && !isValidDate_(c.endDate)) errors.endDate = 'Pick a valid date.';
    if (!errors.startDate && !errors.endDate && c.startDate && c.endDate && c.endDate < c.startDate) {
      errors.endDate = 'End date is before the start date.';
    }

    var sheet = getSheet_(SHEETS.CAMPAIGNS);
    var table = readTable_(sheet, CAMPAIGN_COLUMNS);
    var rowIndex = originalName ? findRowIndex_(table, 'name', originalName, true) : -1;
    if (originalName && rowIndex === -1) {
      throw new Error('Campaign "' + originalName + '" no longer exists. Reload the dashboard.');
    }
    var clash = findRowIndex_(table, 'name', c.name, true);
    if (clash !== -1 && clash !== rowIndex) errors.name = 'A campaign with this name already exists.';
    if (Object.keys(errors).length) {
      return { ok: false, errors: errors, message: 'Please fix the highlighted fields.' };
    }

    var now = new Date();
    c.updatedAt = now;
    if (rowIndex === -1) {
      c.createdAt = now;
      writeRow_(sheet, table, sheet.getLastRow() + 1, null, c);
      return { ok: true, message: 'Campaign "' + c.name + '" added.' };
    }

    c.createdAt = table.objects[rowIndex].createdAt;
    writeRow_(sheet, table, rowIndex + 2, table.rows[rowIndex], c);
    var renamed = 0;
    if (originalName !== c.name) renamed = renameCampaignOnBroadcasts_(originalName, c.name);
    return {
      ok: true,
      message: 'Campaign "' + c.name + '" updated' +
        (renamed ? ' and renamed on ' + renamed + ' broadcast(s).' : '.')
    };
  });
}

function renameCampaignOnBroadcasts_(oldName, newName) {
  var sheet = getSheet_(SHEETS.DATA);
  var table = readTable_(sheet, BROADCAST_COLUMNS);
  var col = table.index.campaign;
  if (col === undefined || !table.rows.length) return 0;
  var count = 0;
  var values = table.rows.map(function (row) {
    if (String(row[col]) === oldName) { count++; return [protectText_(newName)]; }
    return [typeof row[col] === 'string' ? protectText_(row[col]) : row[col]];
  });
  if (count) sheet.getRange(2, col + 1, values.length, 1).setValues(values);
  return count;
}

// ---------------------------------------------------------------------------
// Table helpers (one read per sheet, one write per row)
// ---------------------------------------------------------------------------

/** Reads a sheet once. Columns are matched by header, so reordering is safe. */
function readTable_(sheet, columns) {
  var values = sheet.getDataRange().getValues();
  var headers = values.length ? values[0] : [];
  var index = {};
  columns.forEach(function (c) {
    var i = headers.indexOf(c.header);
    if (i !== -1) index[c.key] = i;
  });
  var rows = values.slice(1);
  var objects = rows.map(function (row) {
    var o = {};
    Object.keys(index).forEach(function (k) { o[k] = row[index[k]]; });
    return o;
  });
  return { headers: headers, index: index, rows: rows, objects: objects };
}

function readHeaderOnly_(sheet, columns) {
  var width = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  var index = {};
  columns.forEach(function (c) {
    var i = headers.indexOf(c.header);
    if (i !== -1) index[c.key] = i;
  });
  return { headers: headers, index: index, rows: [], objects: [] };
}

/** Writes `record` into row `rowNumber`, keeping any extra columns from `baseRow`. */
function writeRow_(sheet, table, rowNumber, baseRow, record) {
  writeRows_(sheet, table, rowNumber, [toRow_(table, baseRow, record)]);
}

/** Appends many records after the last row with a single setValues call. */
function appendRecords_(sheet, table, records) {
  if (!records.length) return;
  writeRows_(sheet, table, sheet.getLastRow() + 1,
    records.map(function (r) { return toRow_(table, null, r); }));
}

function toRow_(table, baseRow, record) {
  var width = table.headers.length;
  var row = baseRow ? baseRow.slice(0, width) : [];
  while (row.length < width) row.push('');
  Object.keys(table.index).forEach(function (k) {
    if (!(k in record)) return;
    var v = record[k];
    row[table.index[k]] = typeof v === 'string' ? protectText_(v) : (v === null ? '' : v);
  });
  return row;
}

function writeRows_(sheet, table, firstRow, rows) {
  var lastRow = firstRow + rows.length - 1;
  var maxRows = sheet.getMaxRows();
  if (lastRow > maxRows) sheet.insertRowsAfter(maxRows, Math.max(100, lastRow - maxRows));
  sheet.getRange(firstRow, 1, rows.length, table.headers.length).setValues(rows);
}

function findRowIndex_(table, key, value, caseInsensitive) {
  var target = caseInsensitive ? String(value).toLowerCase() : String(value);
  for (var i = 0; i < table.objects.length; i++) {
    var v = String(table.objects[i][key]);
    if ((caseInsensitive ? v.toLowerCase() : v) === target) return i;
  }
  return -1;
}

function normalizeBroadcast_(b, tz) {
  var num = function (v) { return v === '' || v === null || v === undefined ? '' : Number(v) || 0; };
  return {
    id: String(b.id), name: String(b.name || ''), campaign: String(b.campaign || ''),
    date: toDateString_(b.date, tz), time: toTimeString_(b.time, tz),
    type: String(b.type || ''), segment: String(b.segment || ''),
    channel: String(b.channel || ''), message: String(b.message || ''),
    status: String(b.status || ''),
    audience: num(b.audience) || 0, sent: num(b.sent) || 0, delivered: num(b.delivered) || 0,
    clicks: num(b.clicks) || 0, shares: num(b.shares), conversions: num(b.conversions),
    revenue: num(b.revenue), cost: num(b.cost) || 0,
    currency: String(b.currency || ''), notes: String(b.notes || ''),
    createdAt: toTimestampString_(b.createdAt, tz), createdBy: String(b.createdBy || ''),
    updatedAt: toTimestampString_(b.updatedAt, tz), updatedBy: String(b.updatedBy || ''),
    version: Number(b.version) || 1
  };
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('The dashboard is busy saving another change. Please try again in a moment.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function currentUser_() {
  try {
    return Session.getActiveUser().getEmail() || 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

/** Trims, strips control characters and caps length. */
function cleanText_(value, maxLength, multiline) {
  if (value === null || value === undefined) return '';
  var s = String(value);
  s = multiline ? s.replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F]/g, '')
    : s.replace(/[\u0000-\u001F]/g, ' ');
  s = s.trim();
  return maxLength ? s.slice(0, maxLength) : s;
}

/** Stops text that starts with = + - @ from being treated as a formula. */
function protectText_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function parseNumber_(value, integer, max) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { value: null };
  }
  var n = Number(String(value).replace(/,/g, '').trim());
  if (!isFinite(n)) return { value: null, error: 'Enter a number.' };
  if (n < 0) return { value: null, error: 'Can\'t be negative.' };
  if (n > max) return { value: null, error: 'That number is too large.' };
  if (integer && Math.floor(n) !== n) return { value: null, error: 'Enter a whole number.' };
  return { value: integer ? n : Math.round(n * 100) / 100 };
}

function isValidDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2] &&
    p[0] >= 2000 && p[0] <= 2100;
}

function toDateString_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v).trim();
}

function toTimeString_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'HH:mm');
  var s = v === null || v === undefined ? '' : String(v).trim();
  var m = /^(\d{1,2}):(\d{2})/.exec(s);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : s;
}

function toTimestampString_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm');
  return v === null || v === undefined ? '' : String(v);
}
