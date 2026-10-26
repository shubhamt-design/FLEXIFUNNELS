/* 10 Min Build Comms Desk: renders the parsed communication doc as copy-ready cards. */
(function () {
  'use strict';

  var P = window.CommsParser;
  var SRC = window.COMMS_SOURCE || { doc: '', media: {}, builtAt: '' };
  var $ = function (id) { return document.getElementById(id); };

  // ---------- storage (per viewer, optional) ----------
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked: keep going */ }
  }

  var state = {
    sections: [],
    current: 0,
    query: '',
    tab: 'messages',
    details: load('commsDetails', { date: '', time: '', id: '', count: '', link: '' }),
    sent: load('commsSent', {}),
    override: load('commsDocOverride', null)
  };
  var today = new Date().toISOString().slice(0, 10);

  // ---------- light / dark theme ----------
  function applyTheme(mode) {
    var root = document.documentElement;
    if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode);
    else root.removeAttribute('data-theme');
    document.querySelectorAll('[data-theme-set]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeSet === (mode || 'auto')));
    });
  }
  applyTheme(load('commsTheme', 'auto'));

  // ---------- schedule groups ----------
  var GROUPS = [
    { name: 'Reference', test: function (t) { return /meeting|assets|guidelines/i.test(t); } },
    { name: 'Sunday · 11 AM webinar', day: 0, test: function (t) { return /11 AM|encore/i.test(t); } },
    { name: 'Tuesday · 7:30 PM webinar', day: 2, test: function (t) { return /tuesday|automated calls 7:30|sms 7:30/i.test(t); } },
    { name: 'Wednesday · 7:30 PM webinar', day: 3, test: function (t) { return /wednesday/i.test(t); } },
    { name: 'Other sequences', test: function () { return true; } }
  ];
  function groupOf(title) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].test(title)) return i;
    return GROUPS.length - 1;
  }
  function slug(s, i) {
    return 's' + i + '-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  }

  // ---------- text helpers ----------
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Replace {{DATE}}-style blanks with the webinar details typed in the top bar.
  function fill(text) {
    var d = state.details;
    var out = text.replace(/\{\{([^}]*)\}\}/g, function (m, name) {
      var n = name.trim().toLowerCase();
      var v = '';
      if (/^\d+$/.test(n)) return m;
      if (/date/.test(n) && /time/.test(n)) v = [d.date, d.time].filter(Boolean).join(', ');
      else if (/date/.test(n)) v = d.date;
      else if (n === 'time') v = d.time;
      else if (n === 'count') v = d.count;
      else if (n === 'link') v = d.link;
      return v || m;
    });
    if (d.id) out = out.replace(/(Webinar ID:\*?)[ ]*(?=\n|$|\|)/g, '$1 ' + d.id + ' ');
    return out;
  }

  // WhatsApp markup -> HTML preview (bold, strike, links, unfilled blanks).
  function waHtml(text) {
    return text.split(/(https?:\/\/[^\s]+)/).map(function (part, i) {
      if (i % 2) return '<a href="' + esc(part) + '" target="_blank" rel="noopener">' + esc(part) + '</a>';
      var h = esc(part);
      h = h.replace(/(?<![\p{L}\p{N}*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![\p{L}\p{N}])/gu, '<b>$1</b>');
      h = h.replace(/(?<![\p{L}\p{N}])~(?!\s)([^~\n]+?)(?<!\s)~(?![\p{L}\p{N}])/gu, '<s>$1</s>');
      h = h.replace(/\{\{[^}]*\}\}/g, function (m) { return /^\{\{\d+\}\}$/.test(m) ? m : '<span class="ph">' + m + '</span>'; });
      return h;
    }).join('');
  }

  // ---------- clipboard ----------
  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }
  function flash(btn, label) {
    if (!btn) return;
    var old = btn.dataset.label || btn.textContent;
    btn.dataset.label = old;
    btn.textContent = label || 'Copied';
    btn.classList.add('ok');
    setTimeout(function () { btn.textContent = old; btn.classList.remove('ok'); }, 1400);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function copyText(text, btn, what) {
    var done = function () { flash(btn); toast((what || 'Text') + ' copied. Paste it into WhatsApp or AiSensy.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        if (fallbackCopy(text)) done(); else toast('Copy was blocked. Select the text and press Ctrl+C.');
      });
    } else if (fallbackCopy(text)) done();
    else toast('Copy was blocked. Select the text and press Ctrl+C.');
  }
  function imageBlob(file) {
    var url = 'media/' + file;
    if (/\.png$/i.test(file)) {
      return fetch(url).then(function (r) { return r.blob(); }).then(function (b) {
        return b.type === 'image/png' ? b : new Blob([b], { type: 'image/png' });
      });
    }
    // JPEG: the clipboard only takes PNG, so redraw at full resolution (no quality loss).
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('encode')); }, 'image/png');
      };
      img.onerror = reject;
      img.src = url;
    });
  }
  function copyImage(file, btn) {
    if (!navigator.clipboard || !window.ClipboardItem) {
      toast('This browser cannot copy images. Use "Full size", then right-click and Copy image.');
      return;
    }
    navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob(file) })]).then(function () {
      flash(btn);
      toast('Image copied at full quality. Paste it into WhatsApp.');
    }, function () {
      toast('Image copy was blocked. Use "Full size", then right-click and Copy image.');
    });
  }

  // ---------- rendering ----------
  function sentKey(si, bi) { return state.sections[si].title + '#' + bi; }
  function isSent(si, bi) { return state.sent[sentKey(si, bi)] === today; }

  function mediaTile(id) {
    var m = SRC.media[id];
    var drive = 'https://drive.google.com/file/d/' + id + '/view';
    var dl = 'https://drive.google.com/uc?export=download&id=' + id;
    if (m && m.type === 'image' && m.file) {
      return '<div class="tile"><a class="thumb" href="media/' + esc(m.file) + '" target="_blank" rel="noopener" title="Open full size">' +
        '<img src="media/' + esc(m.file) + '" alt="' + esc(m.title) + '" loading="lazy"></a>' +
        '<div class="meta"><b>' + esc(m.title) + '</b><div class="acts">' +
        '<button class="btn small primary" data-copyimg="' + esc(m.file) + '">Copy image</button>' +
        '<a href="media/' + esc(m.file) + '" target="_blank" rel="noopener">Full size</a>' +
        '<a href="' + drive + '" target="_blank" rel="noopener">Drive</a></div></div></div>';
    }
    if (m && m.type === 'missing') {
      return '<div class="tile"><div class="icon missing">Link broken</div><div class="meta"><b class="missing">This Drive file no longer exists.</b>' +
        '<span>Ask the design team for the new file and update the doc.</span></div></div>';
    }
    var kind = m ? (m.type === 'audio' ? 'Call audio' : 'Video') : 'Drive file';
    return '<div class="tile"><div class="icon">' + kind + (m && m.size ? ' · ' + esc(m.size) : '') + '</div>' +
      '<div class="meta"><b>' + esc(m ? m.title : id) + '</b><div class="acts">' +
      '<a class="btn small primary" href="' + dl + '" target="_blank" rel="noopener">Download original</a>' +
      '<a href="' + drive + '" target="_blank" rel="noopener">Open in Drive</a></div></div></div>';
  }

  function mediaBlock(b) {
    if (!b.media.length && !b.mediaNotes.length) return '';
    var notes = b.mediaNotes.filter(function (n) { return n && n !== 'Video'; });
    return '<div><div class="rowlabel">Media</div><div class="media">' + b.media.map(mediaTile).join('') + '</div>' +
      (notes.length ? '<p class="where">' + esc(notes.join(' · ')) + '</p>' : '') +
      (!b.media.length ? '<p class="where">No Drive link in the doc for this one.</p>' : '') + '</div>';
  }

  function pollBlock(poll) {
    var opts = poll.options.map(function (o, i) {
      return '<div class="opt"><span>' + esc(o) + '</span><button class="btn small" data-copy="' + esc(o) + '" data-what="Option ' + (i + 1) + '">Copy</button></div>';
    }).join('');
    return '<div class="poll"><div class="rowlabel">WhatsApp poll · ' + poll.options.length + ' options</div>' +
      '<div class="opt q"><span>' + esc(poll.question) + '</span><button class="btn small primary" data-copy="' + esc(poll.question) + '" data-what="Poll question">Copy question</button></div>' +
      opts + '</div>';
  }

  function card(b, si, bi, showWhere) {
    if (b.type === 'divider') return '<div class="divider">' + esc(b.title) + '</div>';
    var sent = isSent(si, bi);
    var head = '<div class="card-head">' +
      (b.title ? '<span class="time">' + esc(b.title) + '</span>' : '') +
      (b.audience ? '<span class="chip">Audience: ' + esc(b.audience) + '</span>' : '') +
      (showWhere ? '<span class="where">' + esc(state.sections[si].title) + '</span>' : '') +
      (b.type !== 'note' ? '<label class="sentbox"><input type="checkbox" data-sent="' + si + ':' + bi + '"' + (sent ? ' checked' : '') + '> Sent today</label>' : '') +
      '</div>';
    var body = '';

    if (b.type === 'broadcast') {
      body += '<div><div class="rowlabel">AiSensy template' + (b.templates.length > 1 ? 's · use any one' : '') + '</div><div class="templates">' +
        b.templates.map(function (t) {
          return '<span class="tpl"><span>' + esc(t) + '</span><button class="btn small" data-copy="' + esc(t) + '" data-what="Template name">Copy</button></span>';
        }).join('') + '</div></div>';
      body += mediaBlock(b);
      if (b.params.length) {
        body += '<div><div class="rowlabel">Parameters · paste into AiSensy in this order</div><ol class="params">' +
          b.params.map(function (p, k) {
            var v = fill(p);
            return '<li><span class="pn">{{' + (k + 1) + '}}</span><span class="pv">' + waHtml(v) + '</span>' +
              '<button class="btn small" data-copy="' + esc(v) + '" data-what="Parameter {{' + (k + 1) + '}}">Copy</button></li>';
          }).join('') + '</ol></div>';
        var bubble = b.segments.map(function (s) {
          return 'param' in s ? '<span class="p">' + waHtml(fill(s.param)) + '</span>' : waHtml(fill(s.text));
        }).join('');
        body += '<details class="preview"><summary>Preview full message</summary><div class="bubble">' + bubble + '</div></details>';
      } else {
        body += '<div class="bubble">' + waHtml(fill(b.text)) + '</div>';
        body += '<p class="where">No [ ] parameters are marked in the doc for this template.</p>';
      }
      if (b.poll) body += pollBlock(b.poll);
      body += '<div class="actions"><button class="btn" data-copy="' + esc(fill(b.text)) + '" data-what="Full message">Copy full message</button></div>';
    } else if (b.type === 'poll') {
      body += mediaBlock(b) + pollBlock(b.poll);
    } else {
      body += mediaBlock(b);
      if (b.text) body += '<div class="bubble">' + waHtml(fill(b.text)) + '</div>';
      if (b.poll) body += pollBlock(b.poll);
      if (b.text) {
        var copyVal = b.plainCopy ? fill(b.text).replace(/\*/g, '') : fill(b.text);
        body += '<div class="actions"><button class="btn ' + (b.type === 'note' ? '' : 'primary') + '" data-copy="' + esc(copyVal) + '" data-what="Message">Copy ' +
          (b.type === 'note' ? 'text' : 'message') + '</button></div>';
      }
    }
    return '<article class="card ' + b.type + (sent ? ' sent' : '') + '">' + head + body + '</article>';
  }

  var KIND_LABEL = { broadcast: 'AiSensy broadcast', community: 'WhatsApp community', info: 'Reference' };

  function renderRail() {
    var day = new Date().getDay();
    var html = '';
    var opts = '';
    GROUPS.forEach(function (g, gi) {
      var items = state.sections.map(function (s, i) { return { s: s, i: i }; }).filter(function (x) { return groupOf(x.s.title) === gi; });
      if (!items.length) return;
      html += '<div class="group"><h2>' + esc(g.name) + (g.day === day ? '<span class="today">Today</span>' : '') + '</h2><ul>' +
        items.map(function (x) {
          var n = x.s.blocks.filter(function (b) { return b.type !== 'divider' && b.type !== 'note'; }).length;
          return '<li><button data-section="' + x.i + '"' + (x.i === state.current && !state.query ? ' aria-current="true"' : '') + '><span>' + esc(x.s.title) + '</span>' + (n ? '<span class="count">' + n + '</span>' : '') + '</button></li>';
        }).join('') + '</ul></div>';
      opts += '<optgroup label="' + esc(g.name) + '">' + items.map(function (x) {
        return '<option value="' + x.i + '"' + (x.i === state.current ? ' selected' : '') + '>' + esc(x.s.title) + '</option>';
      }).join('') + '</optgroup>';
    });
    html += '<div class="group"><h2>Update content</h2><p class="help">After editing the Google Doc: File → Download → Markdown (.md), then load it here.</p>' +
      '<label class="btn" for="docfile" style="display:inline-block">Load updated doc</label><input id="docfile" type="file" accept=".md,.txt,text/markdown,text/plain" hidden></div>';
    $('rail').innerHTML = html;
    $('navselect').innerHTML = opts;
  }

  function renderMessages() {
    var v = $('view');
    var html = '';
    if (state.override) {
      html += '<div class="banner"><span>Showing the doc you loaded on ' + esc(state.override.at) + ' (only in this browser).</span>' +
        '<button class="btn small" id="reset-doc">Back to the shared version</button></div>';
    }
    if (state.query) {
      var q = state.query.toLowerCase();
      var hits = [];
      state.sections.forEach(function (s, si) {
        s.blocks.forEach(function (b, bi) {
          if (b.type === 'divider') return;
          var hay = [b.title, b.text, b.templates.join(' '), b.poll ? b.poll.question + ' ' + b.poll.options.join(' ') : '', b.audience].join(' ').toLowerCase();
          if (hay.indexOf(q) >= 0) hits.push(card(b, si, bi, true));
        });
      });
      html += '<div class="sechead"><h1>' + hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for “' + esc(state.query) + '”</h1></div>';
      html += hits.length ? '<div class="timeline">' + hits.join('') + '</div>' : '<p class="empty">Nothing matches. Try a template name, a time like “7:25”, or a word from the message.</p>';
    } else {
      var s = state.sections[state.current];
      if (!s) { v.innerHTML = '<p class="empty">The doc could not be read.</p>'; return; }
      html += '<div class="sechead"><h1>' + esc(s.title) + '</h1><span class="kind ' + s.kind + '">' + KIND_LABEL[s.kind] + '</span></div>';
      html += '<div class="timeline">' + s.blocks.map(function (b, bi) { return card(b, state.current, bi, false); }).join('') + '</div>';
    }
    v.innerHTML = html;
  }

  function renderFormatter() {
    $('view').innerHTML =
      '<div class="sechead"><h1>Paste &amp; format</h1><span class="kind">Any text</span></div>' +
      '<p class="help">Copy any part of the Google Doc and paste it on the left. Bold from the doc becomes WhatsApp bold (<b>*text*</b>), stray asterisks are cleaned up, and every link gets a space on both sides.</p>' +
      '<div class="formatter"><div class="pane"><div class="rowlabel">1 · Paste from the doc</div>' +
      '<div id="paste" class="paste" contenteditable="true" data-placeholder="Click here and press Ctrl+V (Cmd+V on Mac)"></div></div>' +
      '<div class="pane"><div class="rowlabel">2 · WhatsApp-ready text</div><textarea id="fmt-out" aria-label="WhatsApp-ready text" readonly></textarea>' +
      '<div class="actions"><button class="btn primary" id="fmt-copy">Copy for WhatsApp</button><button class="btn" id="fmt-clear">Clear</button></div></div></div>';
  }

  function render() {
    renderRail();
    if (state.tab === 'formatter') renderFormatter(); else renderMessages();
    $('tab-messages').setAttribute('aria-pressed', String(state.tab === 'messages'));
    $('tab-formatter').setAttribute('aria-pressed', String(state.tab === 'formatter'));
  }

  // ---------- paste formatter ----------
  function htmlToWhatsApp(html, text) {
    var chars = [];
    function push(c, bold, kind) { chars.push({ c: c, bold: bold, kind: kind || (c === '*' ? 'star' : 't') }); }
    function nl() { if (chars.length && chars[chars.length - 1].c !== '\n') push('\n', false); }
    function walk(node, bold) {
      if (node.nodeType === 3) {
        var t = node.data.replace(/[\r\n]+/g, ' ');
        for (var i = 0; i < t.length; i++) push(t[i], bold);
        return;
      }
      if (node.nodeType !== 1) return;
      var tag = node.tagName;
      if (/^(STYLE|SCRIPT|META|TITLE)$/.test(tag)) return;
      if (tag === 'BR') { push('\n', false); return; }
      var b = bold;
      var fw = node.style && node.style.fontWeight;
      if (fw) b = fw === 'bold' || fw === 'bolder' || parseInt(fw, 10) >= 600;
      else if (/^(B|STRONG|H[1-6])$/.test(tag)) b = true;
      var block = /^(P|DIV|LI|H[1-6]|TR|UL|OL|TABLE|BLOCKQUOTE)$/.test(tag);
      if (block) nl();
      if (tag === 'LI') { push('-', false); push(' ', false); }
      if (tag === 'A' && node.getAttribute('href')) {
        var href = node.getAttribute('href');
        var label = node.textContent.trim();
        if (!label || label === href || /^https?:/.test(label)) {
          for (var k = 0; k < href.length; k++) push(href[k], false, 'url');
          push('', false, 'urlend');
          return;
        }
        node.childNodes.forEach(function (c) { walk(c, b); });
        push(' ', false);
        for (k = 0; k < href.length; k++) push(href[k], false, 'url');
        push('', false, 'urlend');
        return;
      }
      node.childNodes.forEach(function (c) { walk(c, b); });
      if (block) push('\n', false);
    }
    if (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      walk(doc.body, false);
    } else {
      for (var i = 0; i < text.length; i++) push(text[i], false);
    }
    // Emit line by line so asterisk pairs never cross lines.
    var lines = [[]];
    chars.forEach(function (c) { if (c.c === '\n') lines.push([]); else lines[lines.length - 1].push(c); });
    var out = lines.map(function (l) { return P.emitChars(l); }).join('\n');
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, [data-section]');
    if (!t) return;
    if (t.dataset.themeSet) { applyTheme(t.dataset.themeSet); save('commsTheme', t.dataset.themeSet); return; }
    if (t.dataset.copy != null) { copyText(t.dataset.copy, t, t.dataset.what); return; }
    if (t.dataset.copyimg) { copyImage(t.dataset.copyimg, t); return; }
    if (t.dataset.section != null) {
      state.current = +t.dataset.section;
      state.query = '';
      state.tab = 'messages';
      $('search').value = '';
      try { history.replaceState(null, '', '#' + slug(state.sections[state.current].title, state.current)); } catch (err) { /* ignore */ }
      render();
      window.scrollTo(0, 0);
      return;
    }
    if (t.id === 'tab-messages' || t.id === 'tab-formatter') { state.tab = t.id === 'tab-messages' ? 'messages' : 'formatter'; render(); return; }
    if (t.id === 'reset-doc') { state.override = null; save('commsDocOverride', null); build(); render(); toast('Back to the shared version.'); return; }
    if (t.id === 'fmt-copy') { copyText($('fmt-out').value, t, 'WhatsApp text'); return; }
    if (t.id === 'fmt-clear') { $('paste').innerHTML = ''; $('fmt-out').value = ''; return; }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.sent) {
      var parts = t.dataset.sent.split(':');
      var key = sentKey(+parts[0], +parts[1]);
      if (t.checked) state.sent[key] = today; else delete state.sent[key];
      save('commsSent', state.sent);
      t.closest('.card').classList.toggle('sent', t.checked);
      return;
    }
    if (t.id === 'navselect') { state.current = +t.value; state.query = ''; $('search').value = ''; render(); return; }
    if (t.id === 'docfile' && t.files && t.files[0]) {
      var f = t.files[0];
      var reader = new FileReader();
      reader.onload = function () {
        var text = String(reader.result);
        var parsed = P.parseDoc(text);
        if (!parsed.length) { toast('That file has no # headings. Download the doc as Markdown (.md) and try again.'); return; }
        state.override = { doc: text, at: new Date().toLocaleString() };
        save('commsDocOverride', state.override);
        build();
        render();
        toast('Loaded ' + f.name + ': ' + parsed.length + ' sections.');
      };
      reader.readAsText(f);
    }
  });

  document.addEventListener('paste', function (e) {
    if (!e.target.closest || !e.target.closest('#paste')) return;
    e.preventDefault();
    var html = e.clipboardData.getData('text/html');
    var text = e.clipboardData.getData('text/plain');
    var out = htmlToWhatsApp(html, text);
    $('paste').innerHTML = html ? new DOMParser().parseFromString(html, 'text/html').body.innerHTML.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '') : esc(text).replace(/\n/g, '<br>');
    $('fmt-out').value = out;
    toast('Formatted. Press "Copy for WhatsApp".');
  });

  var searchTimer;
  $('search').addEventListener('input', function (e) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { state.query = e.target.value.trim(); state.tab = 'messages'; render(); }, 150);
  });

  ['date', 'time', 'id', 'count', 'link'].forEach(function (k) {
    var el = $('d-' + k);
    el.value = state.details[k] || '';
    el.addEventListener('input', function () {
      state.details[k] = el.value.trim();
      save('commsDetails', state.details);
      if (state.tab === 'messages') renderMessages();
    });
  });
  $('details').addEventListener('submit', function (e) { e.preventDefault(); });

  function build() {
    var doc = state.override ? state.override.doc : SRC.doc;
    state.sections = P.parseDoc(doc);
    if (state.current >= state.sections.length) state.current = 0;
    $('built').textContent = state.override ? 'your loaded doc' : (SRC.builtAt ? 'doc as of ' + SRC.builtAt : '');
  }

  build();
  // Open the schedule named in the link, else today's webinar, else the first one.
  var hash = location.hash.replace('#', '');
  var fromHash = state.sections.findIndex(function (s, i) { return slug(s.title, i) === hash; });
  if (fromHash >= 0) state.current = fromHash;
  else {
    var day = new Date().getDay();
    var gi = GROUPS.findIndex(function (g) { return g.day === day; });
    var first = gi >= 0 ? state.sections.findIndex(function (s) { return groupOf(s.title) === gi; }) : -1;
    state.current = first >= 0 ? first : state.sections.findIndex(function (s) { return s.kind === 'broadcast'; });
    if (state.current < 0) state.current = 0;
  }
  render();
})();
