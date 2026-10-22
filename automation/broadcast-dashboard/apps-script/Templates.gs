/**
 * Webinar broadcast schedules. Each template is a set of slots in the
 * Schedule_Templates sheet; createFromTemplate() turns a template plus a
 * webinar date into Draft broadcasts, one per slot, in a single write.
 */

var TEMPLATE_DEFAULT_SEGMENT = 'Webinar Registrants';

function getDefaultTemplateRows_() {
  var rows = [];
  // [day offset, time, slot prefix, type, segment ('' = chosen when scheduling), notes,
  //  full slot name (optional, replaces "prefix – time")]
  function add(template, slots) {
    slots.forEach(function (s) {
      rows.push([template, s[0], s[1], s[6] || s[2] + ' – ' + formatSlotTime_(s[1]), s[3],
        s[4] || '', s[5] || '']);
    });
  }
  var before2 = function (t) { return [-2, t, '2 days before', 'Reminder']; };
  var before1 = function (t) { return [-1, t, '1 day before', 'Reminder']; };
  var day = function (t) { return [0, t, 'Webinar day', 'Webinar']; };
  var nextDay = [1, '10:30', 'Next day', 'Follow-up', '', 'Send before 11 AM',
    'Next day – before 11 AM'];
  var eveningSlots = [
    day('19:00'), day('19:25'),
    [0, '19:30', 'Reg + missed', 'Webinar', 'Registrants + Missed'],
    day('19:35'), day('19:40'), day('19:50'), day('20:00')
  ];

  add('Tuesday Webinar', [
    before1('10:00'), before1('14:00'), before1('18:00'),
    day('10:00'), day('14:30'),
    [0, '17:30', 'Tool access', 'Webinar']
  ].concat(eveningSlots, [nextDay]));

  add('Sunday Webinar + Encore', [
    before2('10:00'), before2('18:00'),
    before1('10:00'), before1('14:00'), before1('18:00'),
    day('08:00'), day('09:00'), day('10:00'), day('10:30'), day('10:55'), day('11:05'),
    day('11:10'), day('11:15'), day('11:25'), day('11:35')
  ].concat(['14:30', '16:30', '17:30', '19:00', '19:25'].map(function (t) {
    return [0, t, 'Encore reminder', 'Reminder'];
  }), [
    [0, '19:30', 'Encore – reg + missed', 'Webinar', 'Registrants + Missed'],
    [0, '19:35', 'Encore', 'Webinar'], [0, '19:40', 'Encore', 'Webinar'],
    [0, '19:50', 'Encore', 'Webinar'], [0, '20:00', 'Encore', 'Webinar']
  ]));

  add('Wednesday Webinar', [
    day('10:00'),
    [0, '10:00', 'Missed audience', 'Reminder', 'Missed Audience'],
    day('14:00'), day('17:30')
  ].concat(eveningSlots, [nextDay]));

  return rows;
}

/** "19:25" → "7:25 PM", "10:00" → "10 AM". */
function formatSlotTime_(hhmm) {
  var p = hhmm.split(':').map(Number);
  var h = p[0] % 12 || 12;
  return h + (p[1] ? ':' + ('0' + p[1]).slice(-2) : '') + (p[0] < 12 ? ' AM' : ' PM');
}

/** Templates in sheet order, slots sorted by day then time. */
function readTemplates_() {
  var sheet = getSpreadsheet_().getSheetByName(SHEETS.TEMPLATES);
  if (!sheet) return [];
  var tz = Session.getScriptTimeZone();
  var byName = {};
  var order = [];
  readTable_(sheet, TEMPLATE_COLUMNS).objects.forEach(function (o) {
    var name = String(o.template || '').trim();
    var time = toTimeString_(o.time, tz);
    var offset = Number(o.dayOffset);
    if (!name || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || o.dayOffset === '' || !isFinite(offset)) {
      return;
    }
    if (!byName[name]) { byName[name] = { name: name, slots: [] }; order.push(name); }
    var slot = {
      dayOffset: Math.round(offset), time: time,
      slot: String(o.slot || '').trim() || 'Broadcast – ' + formatSlotTime_(time),
      type: String(o.type || '').trim(), segment: String(o.segment || '').trim(),
      notes: String(o.notes || '').trim()
    };
    slot.key = [slot.dayOffset, slot.time, slot.slot].join('|');
    byName[name].slots.push(slot);
  });
  return order.map(function (name) {
    var t = byName[name];
    t.slots.sort(function (a, b) { return a.dayOffset - b.dayOffset || a.time.localeCompare(b.time); });
    return t;
  });
}

/**
 * Creates one Draft broadcast per selected slot.
 * @param {Object} input {template, campaign, webinarDate, channel, segment, currency,
 *     slotKeys: [], requestId}
 * @return {{ok:boolean, message:string, records?:Object[], skipped?:string[], errors?:Object}}
 */
function createFromTemplate(input) {
  if (!input || typeof input !== 'object') throw new Error('No data received.');

  var cache = CacheService.getScriptCache();
  var requestKey = input.requestId ? 'tpl:' + String(input.requestId).slice(0, 80) : null;
  if (requestKey) {
    var cached = cache.get(requestKey);
    if (cached) return JSON.parse(cached);
  }

  var result = withLock_(function () {
    var config = readConfig_();
    var tz = Session.getScriptTimeZone();
    var errors = {};
    var templateName = cleanText_(input.template, 100);
    var template = null;
    readTemplates_().forEach(function (t) { if (t.name === templateName) template = t; });
    if (!template) errors.template = 'Pick a schedule template.';

    var webinarDate = cleanText_(input.webinarDate, 10);
    if (!isValidDate_(webinarDate)) errors.webinarDate = 'Pick the webinar date.';

    var keys = Array.isArray(input.slotKeys) ? input.slotKeys.map(String) : [];
    var slots = template ? template.slots.filter(function (s) { return keys.indexOf(s.key) !== -1; }) : [];
    if (template && !slots.length) errors.slots = 'Select at least one broadcast slot.';

    // Shared fields are checked once through the normal broadcast validation.
    var probe = validateBroadcast_({
      name: 'probe', campaign: input.campaign, date: isValidDate_(webinarDate) ? webinarDate : '2000-01-01',
      time: '10:00', type: config.types[0], segment: input.segment || TEMPLATE_DEFAULT_SEGMENT,
      channel: input.channel, status: 'Draft', currency: input.currency
    }, config, null);
    ['campaign', 'segment', 'channel', 'currency'].forEach(function (f) {
      if (probe.errors[f]) errors[f] = probe.errors[f];
    });
    if (Object.keys(errors).length) {
      return { ok: false, errors: errors, message: 'Please fix the highlighted fields.' };
    }

    var shared = probe.record;
    var fallbackType = config.types.indexOf('Reminder') !== -1 ? 'Reminder' : config.types[0];
    var sheet = getSheet_(SHEETS.DATA);
    var table = readTable_(sheet, BROADCAST_COLUMNS);
    var existingKeys = {};
    table.objects.forEach(function (o) {
      if (o.id) existingKeys[duplicateKey_(normalizeBroadcast_(o, tz))] = true;
    });

    var records = [];
    var skipped = [];
    var slotErrors = [];
    slots.forEach(function (s) {
      var date = addDaysIso_(webinarDate, s.dayOffset);
      var check = validateBroadcast_({
        name: s.slot, campaign: shared.campaign, date: date, time: s.time,
        type: config.types.indexOf(s.type) !== -1 ? s.type : fallbackType,
        segment: s.segment || shared.segment, channel: shared.channel, status: 'Draft',
        currency: shared.currency,
        notes: 'From template "' + template.name + '"' + (s.notes ? ' · ' + s.notes : '')
      }, config, null);
      if (Object.keys(check.errors).length) {
        slotErrors.push(s.slot + ': ' + Object.keys(check.errors).map(function (k) {
          return check.errors[k];
        }).join(' '));
        return;
      }
      var key = duplicateKey_(check.record);
      if (existingKeys[key]) { skipped.push(s.slot + ' (' + date + ')'); return; }
      existingKeys[key] = true;
      records.push(check.record);
    });
    if (slotErrors.length) {
      return { ok: false, message: 'Some slots in this template are invalid. Fix them in the ' +
        SHEETS.TEMPLATES + ' sheet:\n' + slotErrors.join('\n') };
    }
    if (!records.length) {
      return { ok: false, skipped: skipped,
        message: 'All selected slots already exist for this campaign and date. Nothing was created.' };
    }

    var now = new Date();
    var user = currentUser_();
    var ids = nextBroadcastIds_(table, records.length);
    records.forEach(function (r, i) {
      r.id = ids[i];
      r.createdAt = now; r.createdBy = user;
      r.updatedAt = now; r.updatedBy = user;
      r.version = 1;
    });
    appendRecords_(sheet, table, records);

    var historySheet = getSheet_(SHEETS.HISTORY);
    appendRecords_(historySheet, readHeaderOnly_(historySheet, HISTORY_COLUMNS),
      records.map(function (r) {
        return { timestamp: now, id: r.id, action: 'CREATE', user: user, version: 1,
          changes: 'Created from template "' + template.name + '"', snapshot: '' };
      }));
    ensureCampaign_(shared.campaign, config);

    return {
      ok: true,
      message: records.length + ' draft broadcast' + (records.length === 1 ? '' : 's') +
        ' created (' + ids[0] + (ids.length > 1 ? ' – ' + ids[ids.length - 1] : '') + ')' +
        (skipped.length ? '; ' + skipped.length + ' already existed and were skipped.' : '.'),
      records: records.map(function (r) { return normalizeBroadcast_(r, tz); }),
      skipped: skipped
    };
  });

  if (requestKey && result.ok) {
    cache.put(requestKey, JSON.stringify(result), REQUEST_CACHE_SECONDS);
  }
  return result;
}

function addDaysIso_(iso, days) {
  var p = iso.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)).toISOString().slice(0, 10);
}
