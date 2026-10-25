/*
 * Turns the Google Docs Markdown export of the "10 MIN BUILD — EVERGREEN
 * COMMUNICATION DOC" into structured, WhatsApp-ready messages.
 *
 * Formatting rules (what the doc means -> what WhatsApp needs):
 *   - Google Docs bold (**x**) and hand-typed asterisks (\*x\*) both become
 *     WhatsApp bold (*x*). Where they overlap we emit one pair, never "**".
 *   - Italics from the doc are dropped (the doc uses them as styling only).
 *   - Links are never wrapped in bold and always get a space before and after.
 *   - In AiSensy broadcasts, every [ ... ] is a template parameter. Parameter
 *     values are flattened to one line (WhatsApp rejects newlines in them).
 *
 * Works in the browser (window.CommsParser) and in Node (module.exports).
 */
(function (root) {
  'use strict';

  var LB = '\u0001'; // literal "[" typed in the doc (AiSensy parameter start)
  var RB = '\u0002'; // literal "]"

  var TIME_RE = /\b\d{1,2}(?:[:.]\s?\d{2})?\s*(?:AM|PM|am|pm)\b/;
  var DRIVE_RE = /drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/g;

  // ---------- small helpers ----------

  function unescapeMd(s) {
    return s.replace(/\\(.)/g, '$1');
  }

  // Plain text of a raw markdown line: no formatting, links as their text.
  function plain(raw) {
    var s = raw.replace(/^\s*#+\s*/, '');
    s = s.replace(/\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)/g, function (m, t, u) {
      var tt = unescapeMd(t).replace(/\*/g, '').trim();
      return tt || '';
    });
    s = s.replace(/<(https?:\/\/[^>]+)>/g, '$1');
    s = s.replace(/(^|[^\\])\*+/g, '$1').replace(/(^|[^\\])\*+/g, '$1');
    s = unescapeMd(s);
    return s.replace(/\s+/g, ' ').trim();
  }

  function cleanUrl(u) {
    u = unescapeMd(u);
    return u.replace(/[*\\]+$/, '');
  }

  // ---------- line -> WhatsApp text ----------

  // Tokenise one raw markdown line into characters annotated with doc-bold,
  // literal-star, bracket and url roles.
  function lineChars(raw) {
    var chars = [];
    var bold = false;
    var i = 0;
    var s = raw.replace(/^\s*#{1,6}\s+/, '');
    var listMatch = s.match(/^\s+-\s+/);
    if (listMatch) s = '- ' + s.slice(listMatch[0].length);
    s = s.replace(/\\\[(DATE|TIME)\\\]/g, '{{$1}}');

    function push(c, kind) {
      chars.push({ c: c, bold: bold, kind: kind || 't' });
    }
    function pushUrl(u) {
      for (var k = 0; k < u.length; k++) chars.push({ c: u[k], bold: false, kind: 'url' });
      chars.push({ c: '', bold: false, kind: 'urlend' });
    }

    while (i < s.length) {
      var ch = s[i];
      if (ch === '\\' && i + 1 < s.length) {
        var nx = s[i + 1];
        if (nx === '*') push('*', 'star');
        else if (nx === '[') push(LB, 'lb');
        else if (nx === ']') push(RB, 'rb');
        else push(nx);
        i += 2;
        continue;
      }
      if (ch === '[') {
        var m = s.slice(i).match(/^\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)/);
        if (m) {
          var url = cleanUrl(m[2]);
          var label = plain(m[1]);
          if (label && label.replace(/\/$/, '') !== url.replace(/\/$/, '') && !/^https?:/.test(label)) {
            // A named link ("Please Confirm Here"): keep the name, then the url.
            var inner = lineChars(m[1]);
            for (var q = 0; q < inner.length; q++) {
              inner[q].bold = inner[q].bold || bold;
              chars.push(inner[q]);
            }
            push(' ');
            pushUrl(url);
          } else if (label) {
            pushUrl(url);
          }
          // An empty label is an invisible link in the doc: drop it.
          i += m[0].length;
          continue;
        }
        push('[');
        i++;
        continue;
      }
      if (ch === '<') {
        var a = s.slice(i).match(/^<(https?:\/\/[^>\s]+)>/);
        if (a) {
          pushUrl(cleanUrl(a[1]));
          i += a[0].length;
          continue;
        }
      }
      if (ch === 'h' && /^https?:\/\//.test(s.slice(i, i + 8))) {
        var b = s.slice(i).match(/^https?:\/\/(?:\\.|[^\s<>\]\)])+/);
        var u = cleanUrl(b[0]);
        pushUrl(u);
        i += b[0].length;
        continue;
      }
      if (ch === '*') {
        var run = s.slice(i).match(/^\*+/)[0].length;
        if (run === 2 || run === 3) bold = !bold;
        // run of 1 is italic (ignored); 4 is bold off+on (no-op).
        i += run;
        continue;
      }
      if (ch === '{' && s[i + 1] === '{') {
        var ph = s.slice(i).match(/^\{\{[^}]*\}\}/);
        if (ph) {
          var name = '{{' + unescapeMd(ph[0].slice(2, -2)).replace(/\*/g, '').trim() + '}}';
          for (var z = 0; z < name.length; z++) chars.push({ c: name[z], bold: false, kind: 'ph' });
          i += ph[0].length;
          continue;
        }
      }
      push(ch);
      i++;
    }
    return chars;
  }

  function isWordChar(c) {
    return /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(c);
  }

  // Emit WhatsApp-formatted text from annotated characters.
  function emit(chars) {
    // 1. Pair hand-typed asterisks. Consecutive ones count as one marker.
    var markers = [];
    for (var i = 0; i < chars.length; i++) {
      if (chars[i].kind === 'star') {
        if (i > 0 && chars[i - 1].kind === 'star') continue;
        markers.push(i);
      }
    }
    var starBold = new Array(chars.length).fill(false);
    for (var p = 0; p + 1 < markers.length; p += 2) {
      for (var k = markers[p]; k < markers[p + 1]; k++) starBold[k] = true;
    }
    // 2. Final bold mask (never on urls or brackets), stars removed.
    var out = [];
    for (i = 0; i < chars.length; i++) {
      var c = chars[i];
      if (c.kind === 'star') continue;
      var b = (c.bold || starBold[i]) && c.kind === 't';
      out.push({ c: c.c, kind: c.kind, bold: b });
    }
    // 3. Join bold runs separated only by spaces/punctuation (no word chars).
    var lastBold = -1;
    for (i = 0; i < out.length; i++) {
      if (!out[i].bold) continue;
      if (lastBold >= 0 && i - lastBold > 1) {
        var gapOk = true;
        for (k = lastBold + 1; k < i; k++) {
          if (out[k].kind !== 't' || isWordChar(out[k].c) || out[k].c === '\n') { gapOk = false; break; }
        }
        if (gapOk) for (k = lastBold + 1; k < i; k++) out[k].bold = true;
      }
      lastBold = i;
    }
    // 4. Write runs.
    var res = '';
    i = 0;
    while (i < out.length) {
      if (out[i].kind === 'urlend') {
        var next = out[i + 1];
        if (next && !/\s/.test(next.c)) res += ' ';
        i++;
        continue;
      }
      if (out[i].kind === 'url') {
        if (res && !/\s$/.test(res)) res += ' ';
        while (i < out.length && out[i].kind === 'url') res += out[i++].c;
        continue;
      }
      if (!out[i].bold) {
        res += out[i++].c;
        continue;
      }
      var j = i;
      var txt = '';
      while (j < out.length && out[j].bold) txt += out[j++].c;
      var lead = txt.match(/^[\s,;:]*/)[0];
      var trail = txt.match(/\s*$/)[0];
      var core = txt.slice(lead.length, txt.length - trail.length);
      if (core && /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(core)) {
        res += lead + '*' + core + '*' + trail;
      } else {
        res += txt;
      }
      i = j;
    }
    return res.replace(/[ \t]+$/, '');
  }

  function toWhatsApp(raw) {
    return emit(lineChars(raw));
  }

  // ---------- AiSensy parameters ----------

  // Split text holding LB/RB markers into segments: {text} and {param}.
  function splitParams(text) {
    var stack = [];
    var pairs = [];
    for (var i = 0; i < text.length; i++) {
      if (text[i] === LB) stack.push(i);
      else if (text[i] === RB && stack.length) pairs.push([stack.pop(), i]);
    }
    // Keep outermost pairs only.
    pairs.sort(function (a, b) { return a[0] - b[0]; });
    var outer = [];
    pairs.forEach(function (pr) {
      var last = outer[outer.length - 1];
      if (!last || pr[0] > last[1]) outer.push(pr);
    });
    var segs = [];
    var pos = 0;
    var strip = function (s) { return s.replace(/[\u0001\u0002]/g, ''); };
    outer.forEach(function (pr) {
      if (pr[0] > pos) segs.push({ text: strip(text.slice(pos, pr[0])) });
      var v = strip(text.slice(pr[0] + 1, pr[1]));
      v = v.replace(/\s*\n\s*/g, ' ').replace(/ {2,}/g, ' ').replace(/^ +/, '');
      segs.push({ param: v });
      pos = pr[1] + 1;
    });
    if (pos < text.length) segs.push({ text: strip(text.slice(pos)) });
    return segs;
  }

  // ---------- block structure ----------

  function isSeparator(raw) {
    var p = raw.replace(/[\\*#\s]/g, '');
    return /^[-_=]{3,}$/.test(p);
  }

  function isHeader(raw) {
    if (/\\\*|\{\{|\\\[|https?:|<http/.test(raw)) return false;
    var p = plain(raw);
    if (p.length < 2 || p.length > 75) return false;
    if (/\bIST\b|•|\|/.test(p)) return false;
    if (/[.?]$/.test(p)) return false;
    if (!/\d/.test(p)) return false;
    return TIME_RE.test(p) || /^(webinar day|\d+\s*days?\b|next day)/i.test(p);
  }

  function templateNames(p) {
    var rest = p.replace(/^(template\s*name|template|temp)\s*[-:–]?\s*/i, '');
    var names = [];
    rest.split(',').forEach(function (part) {
      part = part.replace(/^\s*video\s*[-:]\s*/i, '').trim();
      part.split(/\s+/).forEach(function (tok) {
        tok = tok.replace(/[^A-Za-z0-9_]/g, '');
        if (tok.length >= 3 && !/^temp(late)?$/i.test(tok) && names.indexOf(tok) < 0) names.push(tok);
      });
    });
    return names;
  }

  function newBlock() {
    return { title: [], templates: [], audience: '', media: [], mediaNotes: [], lines: [] };
  }

  function hasBody(b) {
    return b.lines.some(function (l) { return l.trim(); });
  }

  function collapse(lines) {
    var out = [];
    lines.forEach(function (l) {
      if (!l.trim()) {
        if (out.length && out[out.length - 1] !== '') out.push('');
      } else out.push(l);
    });
    while (out.length && out[out.length - 1] === '') out.pop();
    return out;
  }

  function finishBlock(b, section) {
    var lines = collapse(b.lines);
    var title = b.title.join(' · ');
    var block = {
      title: title,
      templates: b.templates,
      audience: b.audience,
      media: b.media,
      mediaNotes: b.mediaNotes
    };
    var bodyPlain = lines.map(function (l) { return l.replace(/[\u0001\u0002*]/g, ''); }).join('\n').trim();

    if (!lines.length && !b.media.length && !b.templates.length) {
      if (!title) return null;
      block.type = 'divider';
      return block;
    }
    if (!title && !b.templates.length && !b.media.length && lines.length <= 2 && bodyPlain.length <= 45) {
      block.type = 'divider';
      block.title = bodyPlain.replace(/\s*\n\s*/g, ' · ');
      return block;
    }

    // Polls: an explicit "Poll" label, or a header that says poll.
    var pollAt = -1;
    lines.forEach(function (l, idx) {
      if (pollAt < 0 && /^poll\s*[-:]?\s*$/i.test(l.replace(/[\u0001\u0002*]/g, '').trim())) pollAt = idx;
    });
    var pollLines = null;
    var selectAt = -1;
    lines.forEach(function (l, idx) { if (/^select one$/i.test(l.trim())) selectAt = idx; });
    if (pollAt < 0 && selectAt > 0) {
      pollLines = lines.slice(0, selectAt).concat(lines.slice(selectAt + 1));
      lines = [];
    } else if (pollAt >= 0) {
      pollLines = lines.slice(pollAt + 1);
      lines = collapse(lines.slice(0, pollAt));
    } else if (/poll/i.test(title) && !/poll\s*ss/i.test(title) && !b.templates.length) {
      pollLines = lines;
      lines = [];
    }
    if (pollLines) {
      var items = pollLines
        .map(function (l) { return l.replace(/[\u0001\u0002]/g, '').trim(); })
        .filter(Boolean)
        .map(function (l) {
          return l.replace(/^(?:\d+\.\s+|-\s+|🔘\s*)/u, '').replace(/^\*(.*)\*$/, '$1').trim();
        });
      if (items.length >= 2) {
        block.poll = { question: items[0], options: items.slice(1) };
      } else if (items.length) {
        lines = lines.concat(items);
      }
    }

    var text = lines.join('\n');
    if (b.templates.length) {
      block.type = 'broadcast';
      block.segments = splitParams(text);
      block.params = block.segments.filter(function (s) { return 'param' in s; }).map(function (s) { return s.param; });
      block.text = block.segments.map(function (s) { return 'param' in s ? s.param : s.text; }).join('');
    } else {
      block.text = text.replace(/[\u0001]/g, '[').replace(/[\u0002]/g, ']');
      var first = !section.blocks.some(function (x) { return x.type !== 'divider' && x.type !== 'note'; });
      if (block.poll && !block.text) block.type = 'poll';
      else if (section.kind === 'info' || (!title && first)) block.type = 'note';
      else block.type = 'message';
      if (!block.title && block.type !== 'note') block.title = 'Follow-up';
    }
    return block;
  }

  function sectionKind(title) {
    if (/assets|meeting|guidelines|automated calls|^sms/i.test(title)) return 'info';
    return 'community';
  }

  function parseDoc(md) {
    var rawLines = md.replace(/\r\n?/g, '\n').split('\n');
    var sections = [];
    var section = null;
    var block = newBlock();

    function flush() {
      if (!section) return;
      var fb = finishBlock(block, section);
      if (fb) section.blocks.push(fb);
      block = newBlock();
    }

    rawLines.forEach(function (raw) {
      var h1 = raw.match(/^#\s+(.*)$/);
      if (h1) {
        var t = plain(h1[1]);
        if (!t) return;
        if (section && /^(webinar day|day \d)/i.test(t)) {
          flush();
          section.blocks.push({ type: 'divider', title: t });
          return;
        }
        flush();
        section = { title: t, kind: sectionKind(t), blocks: [] };
        sections.push(section);
        return;
      }
      if (!section) return;
      if (isSeparator(raw)) {
        flush();
        return;
      }
      var p = plain(raw);

      // Media links (Drive files) are lifted out of the message body.
      var ids = [];
      raw.replace(/\\_/g, '_').replace(DRIVE_RE, function (m, id) { ids.push(id); });
      if (ids.length) {
        ids.forEach(function (id) { if (block.media.indexOf(id) < 0) block.media.push(id); });
        var rest = p.replace(/https?:\/\/\S+/g, '').trim();
        if (rest.length < 25 || /^(media|drive)/i.test(rest)) return;
      }

      if (/^another variation$/i.test(p)) {
        flush();
        block.title.push('Another variation');
        return;
      }
      if (/^\{\{video\}\}\s*-?$/i.test(p)) {
        block.mediaNotes.push('Video');
        return;
      }
      if (isHeader(raw) && !/^(template|temp|audience)\b/i.test(p)) {
        if (hasBody(block) || block.templates.length) flush();
        block.title.push(p.replace(/\s*[-–—]\s*$/, ''));
        return;
      }
      if (/^(template\s*name|template|temp)\b\s*[-:–]/i.test(p) || /^template\b/i.test(p)) {
        templateNames(p).forEach(function (n) { if (block.templates.indexOf(n) < 0) block.templates.push(n); });
        return;
      }
      if (/^audience\s*[-:]/i.test(p)) {
        block.audience = p.replace(/^audience\s*[-:]\s*/i, '');
        return;
      }
      if (/^(media|drive\s*link|drivelink|drive)\b\s*[-:]?/i.test(p) && p.length < 60) {
        var note = p.replace(/^(media(\s*drive)?(\s*link)?|drive\s*link|drivelink|drive)\s*[-:]?\s*/i, '');
        if (note) block.mediaNotes.push(note);
        return;
      }
      // Short label lines right after a header belong to the header.
      if (block.title.length && !hasBody(block) && !block.templates.length && p && p.length <= 30 &&
          !/\\\[|\\\*|\{\{/.test(raw) && !/^poll\b/i.test(p)) {
        block.title.push(p);
        return;
      }
      block.lines.push(toWhatsApp(raw));
    });
    flush();

    sections.forEach(function (s) {
      if (s.blocks.some(function (b) { return b.type === 'broadcast'; })) s.kind = 'broadcast';
      if (/guidelines/i.test(s.title)) splitCommunitySetup(s);
    });
    return sections;
  }

  // The community guidelines section holds the community title and
  // description; give each its own copy card.
  function splitCommunitySetup(section) {
    var outBlocks = [];
    section.blocks.forEach(function (b) {
      if (!b.text || !/TITLE\s*:/i.test(b.text)) { outBlocks.push(b); return; }
      var lines = b.text.split('\n');
      var ti = lines.findIndex(function (l) { return /TITLE\s*:/i.test(l); });
      var di = lines.findIndex(function (l) { return /^\*?description\s*:?\*?\s*:?$/i.test(l.replace(/\*/g, '').trim()); });
      var before = collapse(lines.slice(0, ti));
      if (before.length) outBlocks.push({ type: 'note', title: 'Setup rules', text: before.join('\n'), templates: [], media: [], mediaNotes: [] });
      var titleText = lines[ti].replace(/\*/g, '').replace(/^.*?TITLE\s*:\s*/i, '').trim();
      outBlocks.push({ type: 'message', title: 'Community title', text: titleText, plainCopy: true, templates: [], media: [], mediaNotes: [] });
      if (di > ti) {
        var desc = collapse(lines.slice(di + 1)).map(function (l) { return l.replace(/\*/g, ''); });
        outBlocks.push({ type: 'message', title: 'Community description', text: desc.join('\n'), templates: [], media: [], mediaNotes: [] });
      }
    });
    section.blocks = outBlocks;
  }

  var api = { parseDoc: parseDoc, toWhatsApp: toWhatsApp, plain: plain, splitParams: splitParams, emitChars: emit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CommsParser = api;
})(this);
