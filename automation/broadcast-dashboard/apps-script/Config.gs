/**
 * Dashboard_Config holds one setting per row: Setting | Value | Notes.
 * List settings (channels, types, ...) repeat the Setting name once per value,
 * so the marketing team can add an option by adding a row.
 */

var STATUSES = ['Draft', 'Sent', 'Cancelled'];

// Setting name in the sheet → key used by the app. `list` settings may repeat.
var CONFIG_KEYS = {
  'Channel':           { key: 'channels',           list: true },
  'Broadcast Type':    { key: 'types',              list: true },
  'Audience Segment':  { key: 'segments',           list: true },
  'Campaign Category': { key: 'campaignCategories', list: true },
  'Currency':          { key: 'currencies',         list: true },
  'Default Currency':  { key: 'defaultCurrency' },
  'Default Channel':   { key: 'defaultChannel' }
};

var DEFAULT_CONFIG = {
  channels: ['WhatsApp', 'Email', 'SMS', 'Telegram', 'Instagram', 'X (Twitter)'],
  types: ['Promotional', 'Webinar', 'Reminder', 'Launch', 'Follow-up', 'Closing', 'Community',
    'Other'],
  segments: ['All Contacts', 'Webinar Registrants', 'Leads', 'Customers', 'Community Members'],
  campaignCategories: ['Webinar', 'Event', 'Offer', 'Product Launch', 'Reminder', 'Community',
    'Other'],
  currencies: ['INR', 'USD'],
  defaultCurrency: 'INR',
  defaultChannel: 'WhatsApp'
};

function getDefaultConfigRows_() {
  var rows = [];
  Object.keys(CONFIG_KEYS).forEach(function (setting) {
    var def = CONFIG_KEYS[setting];
    var value = DEFAULT_CONFIG[def.key];
    if (def.list) {
      value.forEach(function (v, i) {
        rows.push([setting, v, i === 0 ? 'Add a row with this Setting name to add an option' : '']);
      });
    } else {
      rows.push([setting, value, 'Single value']);
    }
  });
  return rows;
}

/** Reads Dashboard_Config, falling back to defaults for anything missing. */
function readConfig_() {
  var config = { statuses: STATUSES.slice() };
  Object.keys(CONFIG_KEYS).forEach(function (setting) {
    var def = CONFIG_KEYS[setting];
    config[def.key] = def.list ? [] : '';
  });

  var sheet = getSpreadsheet_().getSheetByName(SHEETS.CONFIG);
  if (sheet && sheet.getLastRow() > 1) {
    var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    values.forEach(function (row) {
      var def = CONFIG_KEYS[String(row[0]).trim()];
      var value = String(row[1]).trim();
      if (!def || !value) return;
      if (def.list) {
        if (config[def.key].indexOf(value) === -1) config[def.key].push(value);
      } else {
        config[def.key] = value;
      }
    });
  }

  Object.keys(DEFAULT_CONFIG).forEach(function (key) {
    var empty = Array.isArray(config[key]) ? !config[key].length : !config[key];
    if (empty) config[key] = Array.isArray(DEFAULT_CONFIG[key]) ?
      DEFAULT_CONFIG[key].slice() : DEFAULT_CONFIG[key];
  });
  if (config.currencies.indexOf(config.defaultCurrency) === -1) {
    config.currencies.unshift(config.defaultCurrency);
  }
  return config;
}

/**
 * Replaces Dashboard_Config with the settings edited in the web app.
 * @param {Object} input {channels:[], types:[], segments:[], campaignCategories:[],
 *     currencies:[], defaultCurrency:'', defaultChannel:''}
 */
function saveSettings(input) {
  return withLock_(function () {
    if (!input || typeof input !== 'object') throw new Error('No settings received.');
    var errors = [];
    var clean = {};

    Object.keys(CONFIG_KEYS).forEach(function (setting) {
      var def = CONFIG_KEYS[setting];
      if (def.list) {
        var seen = {};
        var list = (Array.isArray(input[def.key]) ? input[def.key] : [])
          .map(function (v) { return cleanText_(v, 60); })
          .filter(function (v) {
            var k = v.toLowerCase();
            if (!v || seen[k]) return false;
            seen[k] = true;
            return true;
          });
        if (!list.length) errors.push(setting + ' needs at least one option.');
        clean[def.key] = list;
      } else {
        clean[def.key] = cleanText_(input[def.key], 60);
      }
    });

    clean.currencies = (clean.currencies || []).map(function (c) { return c.toUpperCase(); });
    clean.defaultCurrency = (clean.defaultCurrency || '').toUpperCase();
    clean.currencies.forEach(function (c) {
      if (!/^[A-Z]{3}$/.test(c)) errors.push('Currency "' + c + '" must be a 3-letter code, e.g. INR.');
    });
    if (clean.currencies.indexOf(clean.defaultCurrency) === -1) {
      errors.push('Default currency must be one of the listed currencies.');
    }
    if ((clean.channels || []).indexOf(clean.defaultChannel) === -1) {
      errors.push('Default channel must be one of the listed channels.');
    }
    if (errors.length) throw new Error(errors.join('\n'));

    var rows = [];
    Object.keys(CONFIG_KEYS).forEach(function (setting) {
      var def = CONFIG_KEYS[setting];
      var value = clean[def.key];
      if (def.list) {
        value.forEach(function (v) { rows.push([setting, protectText_(v), '']); });
      } else {
        rows.push([setting, protectText_(value), 'Single value']);
      }
    });

    var sheet = getSheet_(SHEETS.CONFIG);
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(3, sheet.getLastColumn()))
        .clearContent();
    }
    sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    return { ok: true, message: 'Settings saved.', config: readConfig_() };
  });
}
