/**
 * Broadcast alerts: emails when a new broadcast breaks the team's rulebook.
 *
 * Every 15 minutes this reads the AiSensy sheet and checks each new broadcast
 * with the same rule checks as the dashboard's Schedule check tab (qaIssues
 * and deliveryIssues in Index.html, where the thresholds also live):
 *   Rule 1  a space before and after every link
 *   Rule 2  dates, days and times that match the webinar schedule
 *   Rule 3  utility templates only. A marketing template costs about ₹1 per
 *           delivered message instead of about ₹0.15, so the cost gives it away.
 *   Rule 4  once a 10-minute webinar is over, genie-demo no longer leads to
 *           the live room
 * It also flags broadcasts where a large share of the messages failed.
 *
 * Set up once: in the Apps Script editor pick setupAlerts and click Run.
 * The sheet only shows a broadcast after AiSensy has sent it, so an alert is
 * a prompt to send a correction or fix the next send, not a block.
 */

var ALERT_TO = 'shubham.t@flexifunnels.com'; // more people: separate addresses with commas
var CHECK_EVERY_MINUTES = 15;
var DEMO_LINK = 'https://sb.flexifunnels.com/genie-demo';
var LIVE_ROOM = /zoom\.us|zoom\.com|meet\.google\.com|youtube\.com\/live|youtu\.be|streamyard|webinarjam|teams\.microsoft/i;
var SETTLE_MINUTES = 180;          // judge cost and failures once the row says Final, or after this long
var LINK_CHECK_AFTER = 60;         // minutes after a webinar starts to check genie-demo
var LOOKBACK_DAYS = 3;             // broadcasts older than this are never checked

var RULES = {
  0: 'Delivery problem',
  1: 'Rule 1 · space before and after links',
  2: 'Rule 2 · date, time and link match the schedule',
  3: 'Rule 3 · utility templates only',
  4: 'Rule 4 · change the genie-demo redirect after the webinar'
};

/** Run once from the editor. Turns alerts on and emails what they would have caught last week. */
function setupAlerts() {
  stopAlerts();
  ScriptApp.newTrigger('checkBroadcasts').timeBased().everyMinutes(CHECK_EVERY_MINUTES).create();
  PropertiesService.getScriptProperties().setProperty('alerts:since', String(nowIst_()));
  previewAlerts(true);
}

/** Turns alerts off. */
function stopAlerts() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkBroadcasts') ScriptApp.deleteTrigger(t);
  });
}

/** Emails what the alerts would have flagged over the last 7 days. Safe to run any time. */
function previewAlerts(justTurnedOn) {
  var L = logic_(), now = nowIst_();
  var broadcasts = loadBroadcasts_(L);
  var found = [];
  broadcasts.forEach(function (b) {
    if (b.t < now - 7 * 1440) return;
    var issues = L.qaIssues(b).concat(L.deliveryIssues(b));
    if (issues.length) found.push({ b: b, issues: issues });
  });
  var link = resolveLink_(DEMO_LINK);
  var intro = (justTurnedOn ? '<p><b>Broadcast alerts are on.</b> Every ' + CHECK_EVERY_MINUTES + ' minutes new broadcasts in the AiSensy sheet are checked against the rulebook, and this address gets an email when one breaks a rule.</p>' : '') +
    '<p>Over the last 7 days the checks would have flagged ' + (found.length ? found.length + ' broadcast' + (found.length === 1 ? '' : 's') + ':' : 'nothing.') + '</p>';
  var outro = '<p style="color:#555">genie-demo right now leads to: ' + esc_(link.url || ('could not be checked (' + link.error + ')')) + '</p>';
  MailApp.sendEmail({
    to: ALERT_TO,
    subject: justTurnedOn ? 'Broadcast alerts are on' : 'Broadcast alerts: last 7 days',
    htmlBody: emailHtml_(intro, found, null, outro)
  });
  Logger.log(found.length + ' broadcasts flagged; genie-demo leads to ' + (link.url || link.error));
}

/** Runs every 15 minutes from the trigger. */
function checkBroadcasts() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var L = logic_(), now = nowIst_();
    var since = Math.max(Number(props.getProperty('alerts:since')) || now, now - LOOKBACK_DAYS * 1440);
    var broadcasts = loadBroadcasts_(L);
    var seen = props.getProperties(), updates = {}, found = [];

    broadcasts.forEach(function (b) {
      if (b.t < since) return;
      var done = (seen['b:' + b.id] || '').split('|')[0], issues = [];
      // The message text can land in the sheet after the numbers do.
      if (done.indexOf('c') < 0 && (b.content || now - b.t > 6 * 60)) { issues = issues.concat(L.qaIssues(b)); done += 'c'; }
      if (done.indexOf('d') < 0 && (b.status === 'Final' || now - b.t >= SETTLE_MINUTES)) { issues = issues.concat(L.deliveryIssues(b)); done += 'd'; }
      if (done !== (seen['b:' + b.id] || '').split('|')[0]) updates['b:' + b.id] = done + '|' + b.t;
      if (issues.length) found.push({ b: b, issues: issues });
    });

    var link = demoLinkIssue_(broadcasts, now, seen, updates);
    if (found.length || link) {
      var n = found.length + (link ? 1 : 0);
      MailApp.sendEmail({
        to: ALERT_TO,
        subject: 'Broadcast alert: ' + (n > 1 ? n + ' problems to check' : link ? 'genie-demo still leads to the live room' : found[0].b.name),
        htmlBody: emailHtml_('', found, link, '')
      });
    }
    props.setProperties(updates);
    Object.keys(seen).forEach(function (k) {
      var t = Number((seen[k] || '').split('|')[1]);
      if (/^(b|link):/.test(k) && t && t < now - (LOOKBACK_DAYS + 1) * 1440) props.deleteProperty(k);
    });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- checks ---------- */

/**
 * Rule 4. Notes where genie-demo leads while a webinar is live, then checks it
 * again an hour after the start. Still the same place, or still a meeting room,
 * means the redirect was not changed.
 */
function demoLinkIssue_(broadcasts, now, seen, updates) {
  var starts = {}, confirmed = {};
  broadcasts.forEach(function (b) {
    if (b.family !== 'genie') return;
    if (b.inferredStart) starts[b.inferredStart] = true;
    if (b.session) { starts[b.session.t] = true; if (!b.session.upcoming) confirmed[b.session.t] = true; }
  });
  var issue = null;
  Object.keys(starts).map(Number).forEach(function (t) {
    var liveKey = 'link:live:' + t, doneKey = 'link:done:' + t;
    if (now >= t - 5 && now <= t + 40 && !seen[liveKey] && !updates[liveKey]) {
      var live = resolveLink_(DEMO_LINK);
      if (live.url) updates[liveKey] = live.url + '|' + t;
    }
    // Only for webinars the live reminders confirm took place.
    if (confirmed[t] && now >= t + LINK_CHECK_AFTER && now <= t + 6 * 60 && !seen[doneKey]) {
      var after = resolveLink_(DEMO_LINK);
      if (!after.url) return;
      updates[doneKey] = '1|' + t;
      var liveUrl = (seen[liveKey] || updates[liveKey] || '').split('|')[0];
      if (LIVE_ROOM.test(after.url) || (liveUrl && after.url === liveUrl)) {
        issue = { t: t, url: after.url, same: liveUrl && after.url === liveUrl };
      }
    }
  });
  return issue;
}

/** Follows genie-demo's redirects (HTTP, or a small redirect page) and returns where it ends up. */
function resolveLink_(url) {
  try {
    for (var hop = 0; hop < 6; hop++) {
      var res = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
      var code = res.getResponseCode(), headers = res.getAllHeaders();
      var loc = headers.Location || headers.location;
      if (Array.isArray(loc)) loc = loc[0];
      if (code >= 300 && code < 400 && loc) { url = absoluteUrl_(loc, url); continue; }
      var body = code === 200 ? res.getContentText() : '';
      var next = body.length < 5000 && (/http-equiv=["']?refresh["']?[^>]*url=['"]?([^"'>\s]+)/i.exec(body) ||
        /location(?:\.href)?\s*=\s*["']([^"']+)["']|location\.replace\(\s*["']([^"']+)["']/i.exec(body));
      if (next) { url = absoluteUrl_(next[1] || next[2], url); continue; }
      return { url: url, code: code };
    }
    return { url: url };
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
}

function absoluteUrl_(loc, base) {
  if (/^https?:\/\//i.test(loc)) return loc;
  if (loc.indexOf('//') === 0) return 'https:' + loc;
  var origin = /^https?:\/\/[^\/]+/i.exec(base)[0];
  return origin + (loc.charAt(0) === '/' ? '' : '/') + loc;
}

/* ---------- data ---------- */

function loadBroadcasts_(L) {
  var data = getDashboardData();
  var broadcasts = L.buildBroadcasts(data.analysis, data.contents);
  L.analyse(broadcasts);
  return broadcasts.sort(function (a, b) { return a.t - b.t; });
}

/**
 * The rule checks live in Index.html (between LOGIC-START and LOGIC-END) so the
 * dashboard and the alerts always apply the same rules.
 */
var LOGIC_ = null;
function logic_() {
  if (LOGIC_) return LOGIC_;
  var html = HtmlService.createHtmlOutputFromFile('Index').getContent();
  var src = html.slice(html.indexOf('/*LOGIC-START*/'), html.indexOf('/*LOGIC-END*/'));
  LOGIC_ = new Function(src + '\nreturn { buildBroadcasts: buildBroadcasts, analyse: analyse, qaIssues: qaIssues, deliveryIssues: deliveryIssues };')();
  return LOGIC_;
}

/** Now, as minutes on the IST wall clock (the same scale as the sheet's times). */
function nowIst_() { return Math.floor(Date.now() / 60000) + 330; }

/* ---------- email ---------- */

var DAY_ = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MON_ = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtIst_(t) {
  var d = new Date(t * 60000), h = d.getUTCHours(), m = d.getUTCMinutes();
  return DAY_[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON_[d.getUTCMonth()] + ', ' + ((h + 11) % 12 + 1) + ':' + (m < 10 ? '0' : '') + m + ' ' + (h < 12 ? 'AM' : 'PM');
}
function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function emailHtml_(intro, found, link, outro) {
  var td = 'style="padding:8px 10px;border-top:1px solid #e5e5e5;vertical-align:top"';
  var rows = found.slice().sort(function (a, b) { return (b.b.family === 'genie') - (a.b.family === 'genie') || a.b.t - b.b.t; }).map(function (f) {
    var b = f.b;
    var what = b.family === 'genie' ? '10-minute webinar' + (b.session ? ' (for ' + fmtIst_(b.session.t) + ')' : '') : 'Other campaign';
    return '<tr><td ' + td + '><b>' + esc_(b.name) + '</b><br><span style="color:#555">' + fmtIst_(b.t) + ' · ' + esc_(what) + '</span></td><td ' + td + '>' +
      f.issues.map(function (i) { return '<div style="margin-bottom:4px"><span style="color:#555">' + esc_(RULES[i.rule] || 'Rule ' + i.rule) + ':</span> ' + esc_(i.text) + '</div>'; }).join('') + '</td></tr>';
  });
  if (link) {
    rows.unshift('<tr><td ' + td + '><b>genie-demo link</b><br><span style="color:#555">Webinar of ' + fmtIst_(link.t) + '</span></td><td ' + td + '><div><span style="color:#555">' + RULES[4] + ':</span> ' +
      LINK_CHECK_AFTER + ' minutes after the start it still leads to ' + esc_(link.url) + (link.same ? ', the same place it led during the live' : '') + '. Change it now.</div></td></tr>');
  }
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { /* not deployed as a web app */ }
  return '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;max-width:760px">' + intro +
    (rows.length ? '<table style="border-collapse:collapse;width:100%;font-size:14px"><tr><th align="left" style="padding:6px 10px">Broadcast</th><th align="left" style="padding:6px 10px">What’s wrong</th></tr>' + rows.join('') + '</table>' : '') +
    outro + (url ? '<p><a href="' + esc_(url) + '">Open the scorecard</a> (Schedule check tab) for the full message text.</p>' : '') +
    '<p style="color:#888;font-size:12px">Sent by the Webinar Broadcast Scorecard. To stop these emails, run stopAlerts in its Apps Script project.</p></div>';
}
