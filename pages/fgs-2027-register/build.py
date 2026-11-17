import re, sys
src = open(sys.argv[1], encoding='utf-8').read()
out_path = sys.argv[2]

# ---- head: keep author head up to </style>, drop FF-injected runtime (re-added on publish)
head_end = src.index('</style>') + len('</style>')
head = src[:head_end]
body_start = src.index('<body>')
footer_end = src.index('</footer>') + len('</footer>')
body = src[body_start:footer_end]
# author's own script (countdown / video facades) right after footer
m = re.search(r'<script>\s*\(function\(\)\{\s*// Countdown.*?</script>', src[footer_end:], re.S)
author_script = m.group(0)

EXTRA_CSS = r'''
<style>
/* ===== Registration form in the hero ===== */
:root{--ff-accent:#0A9562;--ff-accent-hover:#087A50;--ff-btn-text:#FFFFFF;--ff-form-max:100%}
.hero-split{display:grid;grid-template-columns:minmax(0,1fr) 440px;gap:44px;align-items:start;width:100%;max-width:1240px;margin-top:30px;text-align:left}
.hero-split .hero-vid{margin-top:0;max-width:none}
.hero-split .when-line{justify-content:flex-start}
.hero-split .ticks{display:grid;margin-top:22px}
.reg{position:relative;background:#fff;color:var(--ink);border-radius:22px;padding:28px 26px 22px;box-shadow:0 30px 70px -24px rgba(0,0,0,.75),0 0 0 4px rgba(34,199,134,.35);scroll-margin-top:70px}
.reg-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:linear-gradient(180deg,var(--gold-2),var(--gold));color:var(--gold-ink);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:7px 14px;border-radius:999px;white-space:nowrap}
.reg h2{font-family:var(--f-display);font-size:26px;font-weight:800;line-height:1.15;letter-spacing:-.02em;text-align:center;margin-top:6px}
.reg h2 span{color:#0A9562}
.reg-sub{font-size:15px;color:var(--ink-2);text-align:center;margin-top:8px;line-height:1.45}
.reg-form{margin-top:16px}
.ff-orderform-theme input,.ff-orderform-theme select,.ff-orderform-theme textarea{background:#fff;color:var(--ink);border-color:var(--line-2)}
.ff-orderform-theme input:focus,.ff-orderform-theme select:focus{border-color:#0A9562}
.reg-trust{display:flex;flex-wrap:wrap;justify-content:center;gap:6px 14px;margin-top:14px;font-size:13px;font-weight:600;color:var(--ink-3)}
.reg-trust span{display:inline-flex;align-items:center;gap:5px}
.reg-trust svg{width:15px;height:15px;color:#0A9562}
.reg-proof{margin-top:14px;padding-top:14px;border-top:1px solid var(--line);font-size:13.5px;color:var(--ink-2);text-align:center;line-height:1.45}
.reg-proof b{color:var(--ink)}
.hero-under{display:flex;flex-direction:column;align-items:center;width:100%}
@media (max-width:980px){
  .hero-split{grid-template-columns:1fr;gap:26px;margin-top:22px}
  .hero-split .reg{order:-1}
  .hero-split .when-line{justify-content:center}
  .reg{padding:26px 18px 20px}
  .reg h2{font-size:23px}
}
.sticky .cta{white-space:nowrap}
</style>'''

head = head + EXTRA_CSS + '\n</head>\n'

# ---- new hero centre block
old_hero_start = body.index('<div class="hero-c">')
old_hero_end = body.index('</header>', old_hero_start)
hero_old = body[old_hero_start:old_hero_end]

def grab(pattern):
    mm = re.search(pattern, hero_old, re.S)
    assert mm, pattern
    return mm.group(0)

eyebrow = grab(r'<p class="eyebrow">.*?</p>')
h1 = grab(r'<h1 class="main">.*?</h1>')
subhead = grab(r'<p class="subhead">.*?</p>')
watch = grab(r'<p class="watch">.*?</p>')
vid = grab(r'<div class="hero-vid">.*?</button>\s*</div>')
when = grab(r'<div class="when-line">.*?</div>')
ticks = grab(r'<ul class="ticks">.*?</ul>')
urg = grab(r'<p class="urg">.*?</p>')
proof = grab(r'<div class="proof">.*?</div>\s*</div>') if False else None
proof = re.search(r'<div class="proof">.*?</p>\s*</div>', hero_old, re.S).group(0)

CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
reg_card = f'''<div class="reg" id="register">
            <span class="reg-badge">Registrations Open</span>
            <h2>Register For <span>FGS 2027</span></h2>
            <p class="reg-sub">Enter your details to get event updates, ticket info and early-bird alerts for 17, 18 &amp; 19 Feb 2027.</p>
            <div class="reg-form">
              <!--FLEXI_LEAD_FORM: first_name, email, phone-->
            </div>
            <div class="reg-trust">
              <span>{CHECK}Takes 10 seconds</span>
              <span>{CHECK}No spam, ever</span>
            </div>
            <p class="reg-proof"><b>22,000+ attendees</b> across previous editions.</p>
          </div>'''

hero_new = f'''<div class="hero-c">
        {eyebrow}
        {h1}
        {subhead}
        <div class="hero-split">
          <div class="hero-left">
            {watch.replace('<p class="watch">','<p class="watch" style="margin:0 0 10px">')}
            {vid}
            {when}
            {ticks}
          </div>
          {reg_card}
        </div>
        <div class="hero-under">
          {urg}
          {proof}
        </div>
    </div>
  </div>
'''
body = body[:old_hero_start] + hero_new + body[old_hero_end:]

# top bar CTA -> scroll to the form
body = body.replace('<a class="bar-cta" href="#tickets">Book My Seat', '<a class="bar-cta" href="#register">Register Now', 1)

STICKY = '''
<div class="sticky" id="stickyReg">
  <div><b>FGS 2027 · 17-19 Feb</b>Talkatora Stadium, New Delhi</div>
  <a class="cta" href="#register"><span>Register Now</span></a>
</div>'''

UTM_SCRIPT = r'''
<script>
/* Keep the visitor's UTM / click-id parameters: remembered for the visit and carried onto every
   outbound link (ticket checkouts etc.), so the same utm_source follows them off this page. */
(function(){
  var KEYS=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','fbclid','gclid'];
  var qs=new URLSearchParams(location.search), saved={};
  try{saved=JSON.parse(sessionStorage.getItem('fgs_utm')||'{}')||{};}catch(e){}
  var found=false;
  KEYS.forEach(function(k){var v=qs.get(k); if(v){ if(!found){saved={};found=true;} }});
  KEYS.forEach(function(k){var v=qs.get(k); if(v) saved[k]=v;});
  try{sessionStorage.setItem('fgs_utm',JSON.stringify(saved));}catch(e){}
  // put remembered UTMs back on this page's own URL (so the form submission records them)
  var changed=false;
  Object.keys(saved).forEach(function(k){ if(!qs.get(k)){qs.set(k,saved[k]);changed=true;} });
  if(changed && history.replaceState){ try{history.replaceState(null,'',location.pathname+'?'+qs.toString()+location.hash);}catch(e){} }
  function tag(a){
    var h=a.getAttribute('href')||'';
    if(!/^https?:\/\//i.test(h)) return;
    if(/(terms-of-use|privacy-policy|DPA)$/i.test(h)) return;
    try{
      var u=new URL(h);
      Object.keys(saved).forEach(function(k){ if(!u.searchParams.get(k)) u.searchParams.set(k,saved[k]); });
      a.setAttribute('href',u.toString());
    }catch(e){}
  }
  if(Object.keys(saved).length){ document.querySelectorAll('a[href]').forEach(tag); }

  // mobile sticky "Register Now" once the form has scrolled out of view
  var reg=document.getElementById('register'), st=document.getElementById('stickyReg');
  if(reg && st && 'IntersectionObserver' in window){
    new IntersectionObserver(function(es){ es.forEach(function(e){
      var past=!e.isIntersecting && e.boundingClientRect.top<0;
      st.classList.toggle('show',past);
    });}).observe(reg);
  }
})();
</script>'''

html = head + body + STICKY + '\n\n' + author_script + UTM_SCRIPT + '\n</body>\n</html>\n'
open(out_path,'w',encoding='utf-8').write(html)
print(len(html))
