/* Pointed preview app: state, onboarding, review queue, voice learning, audit.
   Everything runs client-side. State persists in localStorage under pointed.state.v1. */

const LS_KEY = 'pointed.state.v1';
const API = 'https://pointed-api.sgibzx.workers.dev';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function freshState() {
  return {
    brand: null,            // {name, domain, url, initials}
    sample: null,           // {kind:'text'|'audio', text, savedAt, audioName}
    signals: [],            // {id, rule, quote, why, status:'proposed'|'kept'|'rejected', source}
    drafts: [],             // {id, channel, kind, title, body, why, evidence, state, slot, editedFrom}
    changes: [],            // {id, title, before, after, status, author, time, affected}
    audit: [],              // {id, time, actor, action, detail}
    competitors: [],        // urls
    lanes: [],              // {id, query, exclusions, cap, inbox, lastRun, lastError}
    destinations: [],       // {id, kind, masked, events:{...}}
    onboarded: false
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(LS_KEY)) || freshState(); } catch (e) { S = freshState(); }
/* Forward-compatible state: fields added after a user first ran the preview. */
S.lanes = (S.lanes || []).map(l => l.query ? l : { ...l, query: l.query || l.community || '' }).filter(l => l.query);
S.destinations = S.destinations || [];
S.competitors = S.competitors || [];
S.competitors = S.competitors.map(c => typeof c === 'string' ? { id: uid(), name: c, url: 'https://' + c } : c);
S.watchTopics = S.watchTopics || [];
S.watchSources = S.watchSources || [];
S.marketSignals = S.marketSignals || [];
S.angles = S.angles || [];
S.outlets = S.outlets || [];
S.pitches = S.pitches || [];
S.coverage = S.coverage || [];
if (typeof S.brandSensitive === 'undefined') S.brandSensitive = false;
if (typeof S.hosted === 'undefined') S.hosted = null; // {orgId, brandId, token, syncedAt, error} once connected to the hosted backend
const save = () => { localStorage.setItem(LS_KEY, JSON.stringify(S)); syncHosted(); };

/* ----- hosted backend sync (PR #13) -----
   Local state stays the fast copy; when a brand is connected, every save also
   pushes the state domains to the hosted API so they live server-side. */
let syncTimer = null;
function syncHosted() {
  if (!S.hosted || !S.hosted.token) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushState, 700);
}
async function pushState() {
  const h = S.hosted; if (!h || !h.token) return;
  const doms = { signals: S.signals, drafts: S.drafts, changes: S.changes, competitors: S.competitors, lanes: S.lanes, destinations: S.destinations, watchTopics: S.watchTopics, watchSources: S.watchSources };
  try {
    for (const [d, doc] of Object.entries(doms)) {
      const r = await fetch(`${API}/api/brands/${h.brandId}/state/${d}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + h.token }, body: JSON.stringify({ doc }) });
      if (!r.ok) throw new Error('sync ' + d + ' failed (' + r.status + ')');
    }
    h.syncedAt = new Date().toISOString(); h.error = null;
  } catch (e) { h.error = String(e && e.message || e); }
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
  renderPill();
}
async function connectBackend() {
  if (!S.brand || (S.hosted && S.hosted.token)) return;
  try {
    const r = await fetch(API + '/api/brands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand: S.brand }) });
    if (!r.ok) throw new Error('brand create failed (' + r.status + ')');
    const { orgId, brandId, token } = await r.json();
    S.hosted = { orgId, brandId, token };
    const mig = { signals: S.signals, drafts: S.drafts, changes: S.changes, competitors: S.competitors, lanes: S.lanes, destinations: S.destinations, watchTopics: S.watchTopics, watchSources: S.watchSources, audit: S.audit };
    const m = await fetch(`${API}/api/brands/${brandId}/migrate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(mig) });
    if (!m.ok) throw new Error('migrate failed (' + m.status + ')');
    S.hosted.syncedAt = new Date().toISOString(); S.hosted.error = null;
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
  } catch (e) {
    S.hosted = null; // stay honest: if the backend cannot be reached, the preview pill says so
  }
  renderPill();
}
function renderPill() {
  const p = document.querySelector('.preview-pill'); if (!p) return;
  if (S.hosted && S.hosted.token && !S.hosted.error) {
    p.textContent = 'Hosted · data lives on Pointed\u2019s backend';
    p.title = 'Brand-scoped state syncs to the hosted backend (Cloudflare Worker + D1). A local copy stays in this browser as the offline fallback.';
  } else if (S.hosted && S.hosted.error) {
    p.textContent = 'Sync issue · data is safe in this browser';
    p.title = 'The last backend sync failed: ' + S.hosted.error;
  } else {
    p.textContent = 'Preview · data stays in this browser';
    p.title = 'Everything in this preview stays in your browser.';
  }
}
const log = (action, detail) => {
  S.audit.unshift({ id: uid(), time: new Date().toISOString(), actor: 'you', action, detail });
  if (S.hosted && S.hosted.token) fetch(`${API}/api/brands/${S.hosted.brandId}/audit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.hosted.token }, body: JSON.stringify({ action, detail }) }).catch(() => {});
};

/* ---------- helpers ---------- */

function brandFromUrl(raw) {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  const url = new URL(u);
  const domain = url.hostname.replace(/^www\./, '');
  const base = domain.split('.')[0];
  const name = base.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return { name, domain, url: url.origin, initials };
}

function sentences(text) {
  const m = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+["')\]]*/g);
  return (m && m.length ? m : [text]).map(s => s.trim()).filter(Boolean);
}

/* Honest first-pass voice extraction. Every signal carries the exact quote it came from. */
function extractSignals(text) {
  const sents = sentences(text);
  const counts = sents.map(s => s.split(/\s+/).length);
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const shortest = sents[counts.indexOf(Math.min(...counts))];
  const sigs = [];
  const push = (rule, quote, why) => sigs.push({ id: uid(), rule, quote, why, status: 'proposed', source: 'your sample' });

  if (avg <= 14) push('Short sentences when the point matters', shortest, `Your sentences average ${Math.round(avg)} words.`);
  else push('Built, longer sentences are part of the sound', sents[counts.indexOf(Math.max(...counts))], `Your sentences average ${Math.round(avg)} words.`);

  const contraction = sents.find(s => /[a-z]'[a-z]/i.test(s));
  if (contraction) push('Contractions are welcome', contraction, 'You write like you speak.');

  const question = sents.find(s => s.includes('?'));
  if (question) push('Questions open loops', question, 'You put real questions to the reader.');

  if (!/!/.test(text)) push('No exclamation marks', sents[0], 'Calm delivery. The point carries the weight.');

  const firstPerson = (text.match(/\b(I|we|my|our)\b/gi) || []).length;
  if (firstPerson >= 2) push('First person, founder voice', sents.find(s => /\b(I|we|my|our)\b/i.test(s)) || sents[0], 'You speak for yourself, not behind a brand mask.');

  const last = sents[sents.length - 1];
  if (!last.includes('?')) push('No generic closing questions', last, 'You end on the point, not on a prompt for engagement.');

  return sigs.slice(0, 5);
}

/* Build the first pack from what we actually hold. Each card says what grounded it. */
function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function topListening() {
  return S.lanes.flatMap(l => (l.inbox || [])).sort((a, b) => (b.rank || 0) - (a.rank || 0)).slice(0, 3);
}
function buildPackLocal() {
  const kept = S.signals.filter(s => s.status === 'kept');
  const name = S.brand.name;
  const sents = S.sample && S.sample.text ? sentences(S.sample.text) : [];
  const opener = sents.length ? sents[0] : '';
  const evidence = kept.length
    ? kept.slice(0, 2).map(k => `Voice rule: ${k.rule}`)
    : ['No voice rules kept yet'];
  const tomorrow = new Date(Date.now() + 864e5);
  const slot = tomorrow.toLocaleDateString('en-GB', { weekday: 'long' });

  const post = {
    id: uid(), channel: 'LinkedIn', kind: 'Opinion post', state: 'ready', slot,
    title: `A first post for ${name}`,
    body: `${opener}\n\nThat line is yours, from your sample. The next paragraph is a placeholder for the story only you can tell: what happened at ${name} this week, and what it proved.\n\nEdit this freely. Every change you make is recorded and can update the voice.`,
    why: 'Assembled from your voice sample. No external sources connected yet.',
    evidence
  };
  const outline = {
    id: uid(), channel: 'Article', kind: 'Site draft', state: 'ready', slot,
    title: `What ${name} knows that its market forgets`,
    body: `Outline, ready to fill:\n\n1. The claim, in your words\n2. The moment you learned it\n3. What it costs people who ignore it\n4. What ${name} does differently\n5. The close, on the point`,
    why: 'A search-shaped article outline for your site. Connect Search Console to ground it in real queries.',
    evidence: evidence.slice(0, 1)
  };
  const convos = topListening();
  const listen = convos.length ? {
    id: uid(), channel: 'Listening', kind: 'Conversation brief', state: 'ready', slot,
    title: `${convos.length} conversation${convos.length === 1 ? '' : 's'} worth a look`,
    body: `Top match: "${convos[0].title}" (${convos[0].source || 'Hacker News'}).\n\nRead it, and if you have something real to add, reply as yourself. Pointed never posts for you.`,
    why: 'From your listening lanes, ranked by discussion size and recency.',
    evidence: convos.slice(0, 3).map(c => c.url)
  } : {
    id: uid(), channel: 'Listening', kind: 'Connection needed', state: 'blocked', slot: null,
    title: 'Your listening lane is empty',
    body: 'Pointed watches communities you opt into and ranks conversations worth joining, with the source link and the reason. Add a lane in Listening to fill this card.',
    why: 'No listening lane has run yet.',
    evidence: []
  };
  S.drafts = [post, outline, listen];
}

/* PR #14: when hosted, the pack is generated by the Pointed backend as a
   durable, idempotent job; the browser path below is the honest fallback. */
function packKey() {
  const kept = S.signals.filter(s => s.status === 'kept').map(k => k.rule).join('|');
  const sampleText = S.sample && S.sample.text ? S.sample.text : '';
  const str = sampleText + '|' + kept + '|' + (S.brand ? S.brand.name : '');
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return 'pack-' + h.toString(36);
}
async function buildPack() {
  if (!S.hosted || !S.hosted.token) { buildPackLocal(); return; }
  const kept = S.signals.filter(s => s.status === 'kept');
  const sampleText = S.sample && S.sample.text ? S.sample.text : '';
  try {
    const r = await fetch(`${API}/api/brands/${S.hosted.brandId}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.hosted.token },
      body: JSON.stringify({
        kind: 'generate-pack',
        idempotencyKey: packKey(),
        payload: { sampleText, brandName: S.brand.name, keptSignals: kept.map(k => ({ rule: k.rule })), listening: topListening().map(c => ({ title: c.title, url: c.url, source: c.source || 'Hacker News' })) }
      })
    });
    if (!r.ok) throw new Error('job request failed: ' + r.status);
    const { job } = await r.json();
    let drafts = (job && job.drafts) || [];
    if (!drafts.length && job && job.id) {
      const g = await fetch(`${API}/api/brands/${S.hosted.brandId}/jobs/${job.id}`, { headers: { Authorization: 'Bearer ' + S.hosted.token } });
      if (g.ok) drafts = (((await g.json()).job) || {}).drafts || [];
    }
    if (!drafts.length) throw new Error('job returned no drafts');
    S.drafts = drafts.map(d => ({ ...d, evidence: [...(d.evidence || []), `Hosted job ${job.id}`] }));
    log('pack generated on hosted backend', `job ${job.id}`);
  } catch (e) {
    buildPackLocal();
    log('hosted generation unavailable', 'built this pack in the browser instead');
  }
}

/* ---------- onboarding ---------- */

const onb = $('#onboarding');
const steps = $$('.onb-step', onb);
let onbStep = 0;
const stepNames = ['site', 'voice', 'signals', 'pack'];

function showStep(i) {
  onbStep = i;
  steps.forEach(st => st.hidden = st.dataset.step !== stepNames[i]);
  $('#onb-progress').textContent = `Step ${i + 1} of ${steps.length}`;
  const focusable = $('input,textarea,button.onb-primary', steps.find(st => !st.hidden));
  if (focusable) focusable.focus();
}
function openOnboarding(url) {
  onb.hidden = false;
  document.body.style.overflow = 'hidden';
  if (url) $('#onb-url').value = url;
  showStep(S.brand ? (S.sample ? (S.signals.length ? 2 : 1) : 1) : 0);
}
function closeOnboarding() { onb.hidden = true; document.body.style.overflow = ''; }

$('#url-form').addEventListener('submit', e => { e.preventDefault(); openOnboarding($('#site').value); });
$$('[data-close-onb]').forEach(b => b.addEventListener('click', closeOnboarding));

$('#onb-site-form').addEventListener('submit', e => {
  e.preventDefault();
  try {
    S.brand = brandFromUrl($('#onb-url').value);
  } catch (err) { $('#onb-url').setCustomValidity('Enter a valid URL'); $('#onb-url').reportValidity(); return; }
  $('#onb-url').setCustomValidity('');
  log('brand added', `${S.brand.name} (${S.brand.domain})`);
  save(); renderBrand();
  showStep(1);
});

$('#onb-record').addEventListener('click', async () => {
  const btn = $('#onb-record');
  if (!navigator.mediaRecorder) { btn.textContent = 'Recording not supported in this browser'; return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      S.sample = { kind: 'audio', text: '', savedAt: new Date().toISOString(), audioName: 'voice-note.webm' };
      log('voice sample saved', 'voice note (audio); transcription arrives with the hosted backend');
      save();
      S.signals = [];
      (async () => { await buildPack(); save(); showStep(3); renderPack(); })();
    };
    btn.textContent = 'Recording… tap again to stop';
    rec.start();
    btn.onclick = () => { rec.stop(); btn.textContent = 'Record a voice note instead'; btn.onclick = null; };
  } catch (err) { btn.textContent = 'Microphone unavailable'; }
});

$('#onb-voice-form').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('#onb-sample').value.trim();
  if (text.split(/\s+/).length < 8) { $('#onb-sample').setCustomValidity('Give a little more: a few sentences is plenty.'); $('#onb-sample').reportValidity(); return; }
  $('#onb-sample').setCustomValidity('');
  S.sample = { kind: 'text', text, savedAt: new Date().toISOString() };
  S.signals = extractSignals(text);
  log('voice sample saved', `${text.split(/\s+/).length} words pasted`);
  log('voice read', `${S.signals.length} rules proposed from your sample`);
  save();
  renderOnbSignals();
  showStep(2);
});

function renderOnbSignals() {
  const box = $('#onb-signals');
  if (!S.signals.length) {
    box.innerHTML = `<p class="muted">No readable text yet. Your pack will mark voice rules as pending until a text sample or transcription lands.</p>`;
    return;
  }
  box.innerHTML = S.signals.map(sg => `
    <article class="sig" data-id="${sg.id}">
      <div class="sig-main"><b>${esc(sg.rule)}</b><small>${esc(sg.why)}</small>
      <blockquote>${esc(sg.quote)}</blockquote></div>
      <div class="sig-actions">
        <button class="chip-keep" data-act="keep">${sg.status === 'kept' ? 'Kept ✓' : 'Keep'}</button>
        <button class="chip-reject" data-act="reject">${sg.status === 'rejected' ? 'Rejected' : 'Not me'}</button>
      </div>
    </article>`).join('');
  $$('.sig button', box).forEach(b => b.addEventListener('click', () => {
    const id = b.closest('.sig').dataset.id;
    const sg = S.signals.find(x => x.id === id);
    sg.status = b.dataset.act === 'keep' ? 'kept' : 'rejected';
    log(`voice rule ${sg.status}`, sg.rule);
    save(); renderOnbSignals();
  }));
}

$('#onb-signals-done').addEventListener('click', async () => {
  await buildPack();
  log('first pack built', `${S.drafts.filter(d => d.state === 'ready').length} drafts ready for review`);
  save();
  renderPack();
  showStep(3);
});

function renderPack() {
  $('#onb-pack').innerHTML = S.drafts.map(d => `
    <article class="pack-card">
      <span class="pack-tag ${d.state === 'blocked' ? 'blocked' : ''}">${esc(d.channel)} · ${esc(d.kind)}</span>
      <b>${esc(d.title)}</b>
      <small>${esc(d.why)}</small>
    </article>`).join('');
  const items = [
    ['Website added', !!S.brand],
    ['Voice sample saved', !!S.sample],
    ['First pack built', S.drafts.length > 0],
    ['Search Console', false],
    ['CMS publishing', false],
    ['Slack or Discord', false]
  ];
  const done = items.filter(i => i[1]).length;
  $('#onb-checklist').innerHTML = `<div class="check-head"><span>Setup</span><b>${done} of ${items.length} connected</b><i><u style="width:${Math.round(done / items.length * 100)}%"></u></i></div>` +
    items.map(([label, ok]) => `<div class="check-row"><i class="${ok ? 'ok' : ''}"></i><span>${label}</span><em>${ok ? 'Done' : 'Later'}</em></div>`).join('');
}

$('#onb-finish').addEventListener('click', () => {
  S.onboarded = true;
  log('onboarding finished', 'workspace opened');
  save(); closeOnboarding(); openApp();
  connectBackend();
});

/* ---------- workspace ---------- */

const app = $('#app');
let view = 'today';
let focusDraft = null;

function openApp() { app.hidden = false; document.body.style.overflow = 'hidden'; location.hash = 'workspace'; renderAll(); }
function closeApp() { app.hidden = true; document.body.style.overflow = ''; history.replaceState(null, '', location.pathname); }
$$('[data-open-app]').forEach(b => b.addEventListener('click', openApp));
$$('[data-close-app]').forEach(b => b.addEventListener('click', closeApp));

$$('.app aside nav button').forEach(b => b.addEventListener('click', () => {
  view = b.dataset.view;
  $$('.app aside nav button').forEach(x => x.classList.toggle('active', x === b));
  renderAll();
}));
document.addEventListener('click', e => {
  const t = e.target.closest('[data-goto]');
  if (t) { view = t.dataset.goto; $$('.app aside nav button').forEach(x => x.classList.toggle('active', x.dataset.view === view)); renderAll(); }
});

function renderBrand() {
  if (S.brand) {
    $('#brand-initials').textContent = S.brand.initials;
    $('#brand-name').textContent = S.brand.name;
    $('#brand-sub').textContent = S.brand.domain;
  }
}

function renderAll() {
  renderBrand();
  renderPill();
  const d = new Date();
  $('#ws-date').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  const h = d.getHours();
  $('#ws-greeting').textContent = h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.';
  const ready = S.drafts.filter(x => x.state === 'ready').length;
  const nc = $('#nav-count'); nc.hidden = !ready; nc.textContent = ready;
  ['today', 'review', 'signals', 'listening', 'watch', 'press', 'publishing', 'agency', 'calendar', 'voice', 'results', 'health'].forEach(v => { $('#view-' + v).hidden = v !== view; });
  ({ today: renderToday, review: renderReview, signals: renderSignals, listening: renderListening, watch: renderWatch, press: renderPress, publishing: renderPublishing, agency: renderAgency, calendar: renderCalendar, voice: renderVoice, results: renderResults, health: renderHealth })[view]();
}

const stateChip = s => ({ ready: '<span class="st ready">Ready for you</span>', approved: '<span class="st approved">Approved</span>', edited: '<span class="st edited">Edited</span>', sentback: '<span class="st sentback">Sent back</span>', blocked: '<span class="st blocked">Connection needed</span>', exported: '<span class="st exported">Exported</span>' }[s] || '');

/* ----- Today ----- */
function renderToday() {
  const el = $('#view-today');
  if (!S.onboarded) {
    el.innerHTML = `<div class="empty-view"><span class="eyebrow">NOTHING FAKED HERE</span><h2>No brand, no queue. Yet.</h2><p>Give Pointed your website and one voice sample. The first pack lands here in about two minutes, and every card will say what grounded it.</p><button id="cta-onb">Start with your website</button></div>`;
    $('#cta-onb').addEventListener('click', () => openOnboarding());
    return;
  }
  const ready = S.drafts.filter(d => d.state === 'ready');
  const done = S.drafts.filter(d => d.state !== 'ready' && d.state !== 'blocked');
  const kept = S.signals.filter(s => s.status === 'kept').length;
  el.innerHTML = `
  <div class="workspace-grid">
    <section class="needs">
      <div class="section-head"><div><span class="eyebrow">NEEDS YOU</span><h2>${ready.length ? `${ready.length} draft${ready.length > 1 ? 's' : ''} need a quick look.` : 'Queue clear.'}</h2></div><span>${ready.length ? 'A few minutes' : 'Nothing waiting'}</span></div>
      ${ready.map(d => `
        <article>
          <div><span class="type ${d.channel === 'LinkedIn' ? 'linkedin' : d.channel === 'Article' ? 'article' : 'listen'}">${esc(d.channel[0])}</span><small>${esc(d.channel.toUpperCase())} · ${esc((d.slot || 'UNSCHEDULED').toUpperCase())}</small><h3>${esc(d.title)}</h3><p>${esc(d.why)}</p></div>
          <button data-review="${d.id}">Review →</button>
        </article>`).join('') || '<p class="muted pad">Approved and sent-back work is in the Calendar and Review queue.</p>'}
    </section>
    <aside class="rail">
      <section><div class="section-head"><h3>System health</h3><span class="healthy">${S.drafts.some(d => d.state === 'blocked') ? '1 needs a connection' : 'All healthy'}</span></div>
        <ul>
          <li><i></i><div><b>Voice profile</b><small>${kept} rule${kept === 1 ? '' : 's'} kept</small></div></li>
          <li><i class="dim"></i><div><b>Search Console</b><small>Not connected</small></div></li>
          <li><i class="dim"></i><div><b>Publishing</b><small>Draft-only · no CMS yet</small></div></li>
        </ul>
        <button data-goto="health">See all routines →</button></section>
      <section><span class="eyebrow">ACTIVITY</span>
        <p>${S.audit.length ? esc(S.audit[0].action + (S.audit[0].detail ? ' · ' + S.audit[0].detail : '')) : 'Nothing recorded yet.'}</p>
        <button data-goto="voice">See the voice →</button></section>
    </aside>
  </div>`;
  $$('[data-review]', el).forEach(b => b.addEventListener('click', () => { focusDraft = b.dataset.review; view = 'review'; renderAll(); }));
}

/* ----- Review queue ----- */
function renderReview() {
  const el = $('#view-review');
  if (!S.drafts.length) {
    el.innerHTML = `<div class="empty-view"><span class="eyebrow">REVIEW QUEUE</span><h2>Nothing to review yet.</h2><p>Finish onboarding and the first pack lands here.</p><button id="cta-onb2">Open onboarding</button></div>`;
    $('#cta-onb2').addEventListener('click', () => openOnboarding());
    return;
  }
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">REVIEW QUEUE</span><h2>Every card says why it exists.</h2></div><span>${S.drafts.filter(d => d.state === 'ready').length} waiting</span></div>
    ${S.drafts.map(d => `
    <article class="rev-card" data-id="${d.id}">
      <header><span class="pack-tag ${d.state === 'blocked' ? 'blocked' : ''}">${esc(d.channel)} · ${esc(d.kind)}</span>${stateChip(d.state)}</header>
      <h3>${esc(d.title)}</h3>
      <div class="rev-body" data-body="${d.id}">${esc(d.body).replace(/\n/g, '<br>')}</div>
      <div class="rev-why"><small>WHY THIS EXISTS</small><p>${esc(d.why)}</p>${d.evidence && d.evidence.length ? `<small>EVIDENCE</small><ul>${d.evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}</div>
      ${d.state === 'ready' || d.state === 'edited' ? `
      <footer>
        <button class="rv-approve" data-act="approve">Approve</button>
        <button class="rv-edit" data-act="edit">Edit</button>
        <button class="rv-back" data-act="sendback">Send back</button>
      </footer>` : d.state === 'approved' ? `<footer><span class="muted">Approved by you. It sits in the Calendar as approved, never auto-published.</span><button class="linklike" data-act="toexport">Export pack &rarr;</button></footer>` : d.state === 'exported' ? `<footer><span class="muted">Exported. The pack lives in the Calendar; publishing stays manual or via a connected CMS.</span></footer>` : ''}
    </article>`).join('')}
  </div>`;
  $$('.rev-card button', el).forEach(b => b.addEventListener('click', () => {
    const card = b.closest('.rev-card');
    const d = S.drafts.find(x => x.id === card.dataset.id);
    const act = b.dataset.act;
    if (act === 'toexport') { view = 'calendar'; renderAll(); return; }
    if (act === 'approve') {
      d.state = 'approved';
      log('draft approved', d.title);
      save(); renderAll();
    } else if (act === 'sendback') {
      d.state = 'sentback';
      log('draft sent back', d.title);
      save(); renderAll();
    } else if (act === 'edit') {
      const bodyEl = $(`[data-body="${d.id}"]`, card);
      const ta = document.createElement('textarea');
      ta.className = 'rev-editor'; ta.value = d.body;
      bodyEl.replaceWith(ta); ta.focus();
      b.textContent = 'Save edit'; b.dataset.act = 'save';
    } else if (act === 'save') {
      const ta = $('.rev-editor', card);
      const next = ta.value.trim();
      if (next && next !== d.body) {
        S.changes.unshift({ id: uid(), title: `Edit to “${d.title}”`, before: d.body.slice(0, 220), after: next.slice(0, 220), status: 'proposed', author: 'you', time: new Date().toISOString(), affected: S.brand ? S.brand.name : 'this brand' });
        d.body = next; d.state = 'edited'; d.editedFrom = 'you';
        log('draft edited', d.title);
        log('voice change proposed', 'from your edit');
        save();
      }
      renderAll();
    }
  }));
  if (focusDraft) {
    const card = $(`.rev-card[data-id="${focusDraft}"]`, el);
    if (card) { card.classList.add('flash'); setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30); }
    focusDraft = null;
  }
}

/* ----- Signals ----- */
function renderSignals() {
  const el = $('#view-signals');
  const comps = S.competitors.map(c => `<div class="check-row"><i class="ok"></i><span>${esc(c.name)}</span></div>`).join('');
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">SIGNALS</span><h2>Sources you choose. Nothing watched in secret.</h2></div></div>
    <div class="sig-sources">
      <article><span class="provider comp">↗</span><div><b>Competitors</b><small>Up to 3 sites. Pointed proposes a keyword map you review. Managed in Market watch.</small></div></article>
      ${comps || '<p class="muted">No competitors yet.</p>'}
      <button class="linklike" id="go-watch">Manage competitors in Market watch</button>
      <article class="src-off"><span class="provider google">G</span><div><b>Google Search Console</b><small>OAuth read access. Property picker appears after sign-in.</small></div><em>Hosted build only</em></article>
      <article class="src-off"><span class="provider slack">R</span><div><b>Reddit listening</b><small>Opt-in communities, ranked conversations, source links.</small></div><em>Hosted build only</em></article>
    </div>
    <div class="kw-map"><span class="eyebrow">KEYWORD MAP</span><p class="muted">${S.competitors.length ? 'Proposed after the first research run. Runs live on the hosted backend; this preview records your competitors so the map has somewhere to start.' : 'Add at least one competitor and Pointed has somewhere to start.'}</p></div>
  </div>`;
  const gw = $('#go-watch');
  if (gw) gw.addEventListener('click', () => { view = 'watch'; renderAll(); });
}

/* ----- Export pack + preflight (local, mechanical, honest) ----- */
function preflight(d) {
  const checks = [];
  const zw = d.body.match(/[\u200B-\u200D\uFEFF\u00AD]/);
  checks.push(zw
    ? { name: 'Hidden characters', ok: false, blocking: true, fix: 'A zero-width or hidden character is in the copy, around position ' + zw.index + '. Delete it before this leaves.' }
    : { name: 'Hidden characters', ok: true, note: 'No zero-width or invisible characters found.' });
  if (d.channel === 'LinkedIn') {
    const limit = 3000, over = d.body.length - limit;
    checks.push(over > 0
      ? { name: 'Channel length', ok: false, blocking: true, fix: 'LinkedIn cuts off at 3,000 characters. This is ' + over + ' over. Trim it in Review.' }
      : { name: 'Channel length', ok: true, note: d.body.length + ' of 3,000 characters.' });
  }
  const tags = d.body.match(/#[A-Za-z]\w+/g) || [];
  checks.push(tags.length
    ? { name: 'Hashtags', ok: false, blocking: false, fix: tags.length + ' hashtag' + (tags.length > 1 ? 's' : '') + ' found (' + tags.slice(0, 3).join(' ') + '). Remove them unless they are deliberate.' }
    : { name: 'Hashtags', ok: true, note: 'None. Clean.' });
  const links = d.body.match(/https?:\/\/[^\s)\]]+/g) || [];
  checks.push(links.length
    ? { name: 'Links', ok: true, note: links.length + ' link' + (links.length > 1 ? 's' : '') + ': ' + links.join(', ') + '. Check they are the ones you mean to ship.' }
    : { name: 'Links', ok: true, note: 'No links in the copy.' });
  const closingQ = /\?\s*$/.test(d.body);
  const noCloseQ = S.signals.some(s => s.status === 'kept' && s.rule === 'No generic closing questions');
  if (closingQ && noCloseQ) checks.push({ name: 'Voice check', ok: false, blocking: false, fix: 'Ends on a question. Your kept voice rules say no generic closing questions.' });
  return checks;
}

function packText(d) {
  const checks = preflight(d);
  return [
    '# ' + d.title,
    '',
    'Channel: ' + d.channel + ' - ' + d.kind,
    'Suggested slot: ' + (d.slot || 'Unscheduled'),
    'Exported: ' + new Date().toISOString() + ' (from the Pointed preview, by you)',
    '',
    '## Copy',
    '',
    d.body,
    '',
    '## Media and alt text',
    '',
    'No media attached to this pack.',
    '',
    '## Why this exists',
    '',
    d.why,
    ...(d.evidence && d.evidence.length ? ['', 'Evidence:', ...d.evidence.map(e => '- ' + e)] : []),
    '',
    '## Preflight at export',
    '',
    ...checks.map(c => '- ' + (c.ok ? 'PASS' : (c.blocking ? 'BLOCKED' : 'CHECK')) + ' - ' + c.name + ': ' + (c.note || c.fix)),
    '',
    'Publishing stays manual or via a connected CMS. Pointed never posts silently.'
  ].join('\n');
}

function downloadPack(d) {
  const blob = new Blob([packText(d)], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pointed-pack-' + d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) + '.md';
  a.click();
  URL.revokeObjectURL(a.href);
  log('export pack downloaded', d.title);
  save(); renderAll();
}

/* ----- Listening inbox: opt-in lanes, honest empty inbox ----- */
function renderListening() {
  const el = $('#view-listening');
  const lanes = S.lanes.map((l, i) => `
    <article class="lane"><span class="provider comp">H</span><div class="lane-main"><b>Hacker News</b><small>Watching for: ${esc(l.query)}${l.exclusions ? ' · Excluding: ' + esc(l.exclusions) : ''} · Cap ${esc(String(l.cap))}/week</small>
    <small>${l.lastError ? '<span class="needs-you">Last run failed: ' + esc(l.lastError) + '</span>' : l.lastRun ? 'Last run ' + timeAgo(l.lastRun) + ' · ' + (l.inbox || []).length + ' conversation' + ((l.inbox || []).length === 1 ? '' : 's') : 'Not run yet'}</small></div><em><button class="linklike" data-checklane="${i}">Check now</button> <button class="linklike" data-rmlane="${i}">Remove</button></em></article>`).join('');
  const inbox = S.lanes.flatMap(l => (l.inbox || []).map(c => ({ ...c, lane: l })))
    .sort((a, b) => b.rank - a.rank).slice(0, 20);
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">LISTENING INBOX</span><h2>Conversations worth joining. Nothing watched in secret.</h2></div></div>
    <p class="muted">Pointed searches Hacker News for each lane's watch query and ranks what it finds: source link, age, discussion size, and the reason it matched. More communities (Reddit and others) join once their account connections land. You always send any reply yourself.</p>
    <div class="sig-list">${lanes || '<p class="muted">No lanes yet. Add the communities you want watched.</p>'}</div>
    ${S.lanes.length < 5 ? `<form id="lane-form" class="lane-form">
      <div class="lane-grid">
        <input id="lane-query" placeholder="watch Hacker News for, e.g. ${S.brand ? esc(S.brand.name) + ', alternatives to, looking for a tool' : 'your brand, alternatives to, looking for a tool'}" required>
      </div>
      <div class="lane-grid">
        <input id="lane-exclusions" placeholder="exclude (optional), e.g. hiring, meme">
        <input id="lane-cap" type="number" min="1" max="50" value="10" title="Max conversations per week">
      </div>
      <button class="onb-primary">Add lane</button>
    </form>` : '<p class="muted">Lane cap reached (5). Remove one to add another.</p>'}
    <div class="kw-map"><span class="eyebrow">INBOX</span>${inbox.length ? `<div class="sig-list">${inbox.map(c => `
      <article class="sig"><div class="sig-main"><b><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a></b>
      <small>${esc(c.source || 'Hacker News')} · ${timeAgo(c.createdAt)} · ${c.score} points · ${c.comments} comments · ${esc(c.reason)}</small>
      ${c.snippet ? `<blockquote>${esc(c.snippet)}</blockquote>` : ''}</div></article>`).join('')}</div>`
    : `<p class="muted">${S.lanes.length ? (S.lanes.some(l => l.lastRun) ? 'The last run found nothing matching. That is a real result, not a loading state.' : 'No conversations yet. Hit Check now on a lane to run it against live Hacker News search.') : 'The inbox stays empty until a lane exists. No lane, no watching.'}</p>`}</div>
  </div>`;
  const f = $('#lane-form');
  if (f) f.addEventListener('submit', e => {
    e.preventDefault();
    const query = $('#lane-query').value.trim();
    if (!query) return;
    S.lanes.push({ id: uid(), query, exclusions: $('#lane-exclusions').value.trim(), cap: Math.min(50, Math.max(1, +$('#lane-cap').value || 10)) });
    log('listening lane added', 'Hacker News - ' + query);
    save(); renderAll();
  });
  $$('[data-rmlane]', el).forEach(b => b.addEventListener('click', () => {
    const [removed] = S.lanes.splice(+b.dataset.rmlane, 1);
    log('listening lane removed', 'Hacker News - ' + removed.query);
    save(); renderAll();
  }));
  $$('[data-checklane]', el).forEach(b => b.addEventListener('click', () => checkLane(+b.dataset.checklane)));
}

async function checkLane(i) {
  const lane = S.lanes[i];
  if (!lane) return;
  if (!S.hosted || !S.hosted.token) { lane.lastError = 'Listening runs through the hosted backend - finish onboarding to connect.'; save(); renderAll(); return; }
  lane.lastError = null;
  log('listening run started', 'Hacker News - ' + lane.query);
  save(); renderAll();
  try {
    const r = await fetch(`${API}/api/brands/${S.hosted.brandId}/listen?query=${encodeURIComponent(lane.query)}&limit=25`, { headers: { Authorization: 'Bearer ' + S.hosted.token } });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    const excl = (lane.exclusions || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
    lane.inbox = (data.items || [])
      .filter(c => !excl.some(w => (c.title + ' ' + (c.snippet || '')).toLowerCase().includes(w)))
      .map(c => ({ ...c, reason: `matches "${lane.query}" on Hacker News`, rank: c.comments * 2 + c.score }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, lane.cap);
    lane.lastRun = new Date().toISOString();
    log('listening run finished', `Hacker News - ${lane.inbox.length} conversations ranked`);
  } catch (e) {
    lane.lastError = String(e.message || e);
    log('listening run failed', lane.lastError);
  }
  save(); renderAll();
}

/* ----- Market watch: competitors, topics, trusted sources; every signal keeps its chain ----- */
const WATCH_GROUPS = [
  ['competitors', 'Competitors', 3, 'competitor name', 'https://competitor.com'],
  ['watchTopics', 'Topics', 6, 'topic, e.g. founder-led marketing', null],
  ['watchSources', 'Trusted sources', 6, 'source name', 'https://source.example/feed'],
];

function validUrl(v) { try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { return false; } }

function renderWatch() {
  const el = $('#view-watch');
  const groups = WATCH_GROUPS.map(([key, label, cap, namePh, urlPh]) => {
    const items = S[key].map((w, i) => `
      <article class="lane"><span class="provider comp">${label[0]}</span><div class="lane-main"><b>${esc(w.name)}</b>${w.url ? '<small>' + esc(w.url) + '</small>' : ''}</div><em><button class="linklike" data-rmwatch="${key}:${i}">Remove</button></em></article>`).join('');
    return `<div class="watch-group">
      <h3 class="group-h">${label} <span class="muted small">${S[key].length}/${cap}</span></h3>
      <div class="sig-list">${items || '<p class="muted">Nothing tracked yet.</p>'}</div>
      ${S[key].length < cap ? `<form class="lane-form" data-watchform="${key}">
        <div class="lane-grid">
          <input data-wname placeholder="${namePh}" required>
          ${urlPh ? `<input data-wurl placeholder="${urlPh}" required>` : ''}
        </div>
        <button class="onb-primary">Add ${label.toLowerCase().replace(/s$/, '')}</button>
      </form>` : `<p class="muted">Cap reached (${cap}). Remove one to add another.</p>`}
    </div>`;
  }).join('');
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">MARKET WATCH</span><h2>Watch the market. Show the chain.</h2></div></div>
    <p class="muted">Track selected competitors, topics and trusted sources. In this preview the watch list is real and saved; the tracking runs on the hosted backend.</p>
    ${groups}
    <div class="kw-map"><span class="eyebrow">SIGNALS</span>
      <p class="muted">${(S.competitors.length + S.watchTopics.length + S.watchSources.length) ? 'No market signals yet. When the hosted watcher sees movement, each signal lands here with its source link, the time it was observed, a summary and the reason it matters.' : 'The signal list stays empty until something is tracked. No watch list, no watching.'}</p>
      <div class="chain"><span>signal</span><i>&#8594;</i><span>proposed topic</span><i>&#8594;</i><span>draft</span></div>
      <p class="muted small">A draft can only exist from signals you can inspect: same source link, same reason, all the way down. Unsupported claims never enter generation.</p>
    </div>
  </div>`;
  $$('[data-watchform]', el).forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const key = f.dataset.watchform;
    const name = f.querySelector('[data-wname]').value.trim();
    const urlInput = f.querySelector('[data-wurl]');
    const url = urlInput ? urlInput.value.trim() : '';
    if (!name) return;
    if (urlInput && !validUrl(url)) { urlInput.focus(); urlInput.setCustomValidity('Needs a full https:// URL'); urlInput.reportValidity(); return; }
    S[key].push(url ? { id: uid(), name, url } : { id: uid(), name });
    const labels = { competitors: 'competitor', watchTopics: 'topic', watchSources: 'trusted source' };
    log(labels[key] + ' added to market watch', name + (url ? ' - ' + url : ''));
    save(); renderAll();
  }));
  $$('[data-rmwatch]', el).forEach(b => b.addEventListener('click', () => {
    const [key, i] = b.dataset.rmwatch.split(':');
    const [removed] = S[key].splice(+i, 1);
    log('removed from market watch', removed.name);
    save(); renderAll();
  }));
}

/* ----- Press: angles, outlets/contacts, pitches, coverage. Outbound needs approval + a verified recipient. ----- */
function renderPress() {
  const el = $('#view-press');
  const angles = S.angles.map((a, i) => `
    <article class="lane"><span class="provider comp">A</span><div class="lane-main"><b>${esc(a.angle)}</b><small>Grounded in: ${esc(a.ground)}</small></div><em><button class="linklike" data-rmangle="${i}">Remove</button></em></article>`).join('');
  const outlets = S.outlets.map((o, i) => `
    <article class="lane"><span class="provider cms">O</span><div class="lane-main"><b>${esc(o.outlet)}</b><small>${esc(o.contact)} · ${esc(o.email)} · unverified - verification happens in the hosted build</small></div><em><button class="linklike" data-rmoutlet="${i}">Remove</button></em></article>`).join('');
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">PRESS</span><h2>Pitches with a paper trail. Nothing sends itself.</h2></div></div>
    <p class="muted">Keep story angles, outlets and contacts. The hosted build drafts pitches from grounded signals, routes them through your review queue, and tracks replies and coverage. Outbound email requires your explicit approval and a verified recipient - always.</p>
    <div class="watch-group">
      <h3 class="group-h">Story angles <span class="muted small">${S.angles.length}/6</span></h3>
      <div class="sig-list">${angles || '<p class="muted">No angles yet. An angle names the story and the signal that grounds it.</p>'}</div>
      ${S.angles.length < 6 ? `<form id="angle-form" class="lane-form">
        <div class="lane-grid">
          <input id="angle-text" placeholder="angle, e.g. founder-led brands outgrow generic SEO" required>
          <input id="angle-ground" placeholder="grounded in, e.g. GSC: rising 'founder brand' queries" required>
        </div>
        <button class="onb-primary">Add angle</button>
      </form>` : '<p class="muted">Cap reached (6). Remove one to add another.</p>'}
    </div>
    <div class="watch-group">
      <h3 class="group-h">Outlets and contacts <span class="muted small">${S.outlets.length}/8</span></h3>
      <div class="sig-list">${outlets || '<p class="muted">No outlets yet. Add the publications and people worth a pitch.</p>'}</div>
      ${S.outlets.length < 8 ? `<form id="outlet-form" class="lane-form">
        <div class="lane-grid">
          <input id="outlet-name" placeholder="outlet, e.g. Maker Press" required>
          <input id="outlet-contact" placeholder="contact name" required>
        </div>
        <div class="lane-grid">
          <input id="outlet-email" type="email" placeholder="contact email" required>
        </div>
        <button class="onb-primary">Add outlet</button>
      </form>` : '<p class="muted">Cap reached (8). Remove one to add another.</p>'}
    </div>
    <div class="kw-map"><span class="eyebrow">PITCHES</span>
      <p class="muted">${S.angles.length && S.outlets.length ? 'No pitches yet. The hosted build drafts them from your grounded angles, and each one lands in your review queue first. You approve the wording and the recipient; it never sends itself.' : 'Pitches stay empty until an angle and an outlet exist - a pitch needs both a grounded story and a verified destination.'}</p>
    </div>
    <div class="kw-map"><span class="eyebrow">COVERAGE</span>
      <p class="muted">No coverage tracked yet. When a pitch lands, the coverage is recorded here with its URL and becomes an eligible input for later topics and drafts.</p>
    </div>
  </div>`;
  const af = $('#angle-form');
  if (af) af.addEventListener('submit', e => {
    e.preventDefault();
    const angle = $('#angle-text').value.trim(), ground = $('#angle-ground').value.trim();
    if (!angle || !ground) return;
    S.angles.push({ id: uid(), angle, ground });
    log('story angle added', angle + ' - grounded in ' + ground);
    save(); renderAll();
  });
  const of = $('#outlet-form');
  if (of) of.addEventListener('submit', e => {
    e.preventDefault();
    const outlet = $('#outlet-name').value.trim(), contact = $('#outlet-contact').value.trim(), email = $('#outlet-email').value.trim();
    if (!outlet || !contact || !email) return;
    S.outlets.push({ id: uid(), outlet, contact, email });
    log('press outlet added', outlet + ' - ' + contact);
    save(); renderAll();
  });
  $$('[data-rmangle]', el).forEach(b => b.addEventListener('click', () => {
    const [r] = S.angles.splice(+b.dataset.rmangle, 1);
    log('story angle removed', r.angle); save(); renderAll();
  }));
  $$('[data-rmoutlet]', el).forEach(b => b.addEventListener('click', () => {
    const [r] = S.outlets.splice(+b.dataset.rmoutlet, 1);
    log('press outlet removed', r.outlet); save(); renderAll();
  }));
}

/* ----- Publishing: CMS connector framework. Connections are OAuth in the hosted build; policies are per-site. ----- */
function renderPublishing() {
  const el = $('#view-publishing');
  const connectors = [
    ['W', 'WordPress', 'comp'],
    ['S', 'Shopify', 'mint'],
    ['W', 'Webflow', 'blue'],
  ].map(([l, name, cls]) => `
    <article class="lane"><span class="provider ${cls}">${l}</span><div class="lane-main"><b>${name}</b><small>Authorize with OAuth in the hosted build. Until then nothing here can publish, draft or read.</small></div><em>Not connected</em></article>`).join('');
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">PUBLISHING</span><h2>Connected when you connect it. Draft-first by default.</h2></div></div>
    <p class="muted">Pointed publishes through CMS connectors. In this preview the framework is visible; the connections themselves are authorized in the hosted build.</p>
    <div class="watch-group">
      <h3 class="group-h">Connectors</h3>
      <div class="sig-list">${connectors}</div>
      <p class="muted small">Later systems implement the same connector contract: authenticate, list sites, create draft, update draft, read article state. Nothing outside that contract touches your CMS.</p>
    </div>
    <div class="watch-group">
      <h3 class="group-h">Sites and policy</h3>
      <div class="kw-map"><p class="muted">No sites connected. When a connector is authorized, its sites appear here and each site gets its own policy: <b>draft-only</b> (Pointed creates drafts, you publish) or <b>reviewed publishing</b> (publishes only what you approved in the review queue). There is no global auto-publish switch, and no site publishes without a policy you set.</p></div>
    </div>
    <div class="watch-group">
      <h3 class="group-h">Article tracking</h3>
      <div class="kw-map"><p class="muted">Nothing published yet. Every article Pointed touches is tracked here with its full history, canonical URL, sitemap presence, index state and any publishing failure with its fix.</p></div>
    </div>
  </div>`;
}

/* ----- Agency: client workspaces, roles, approval routes, sensitive-brand isolation ----- */
function renderAgency() {
  const el = $('#view-agency');
  const b = S.brand;
  const roles = [
    ['Read-only', 'Sees the client workspace, drafts and results. Cannot change anything.'],
    ['Reviewer', 'Approves, edits and rejects in the review queue. Cannot change voice rules or connections.'],
    ['Voice editor', 'Shapes the voice profile and its evidence. Cannot publish or export.'],
    ['Admin', 'Manages connections, destinations, policies and people. Publishing still follows the per-site policy.'],
  ].map(([r, d]) => `<article class="lane"><span class="provider blue">${r[0]}</span><div class="lane-main"><b>${r}</b><small>${d}</small></div></article>`).join('');
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">AGENCY</span><h2>Client work, deliberately separated.</h2></div></div>
    <p class="muted">Agencies run client workspaces with roles, approval routes and exports. Switching workspace or brand is always a deliberate act - nothing leaks across by default.</p>
    <div class="watch-group">
      <h3 class="group-h">This workspace</h3>
      <div class="sig-list">
        <article class="lane"><span class="provider mint">${b ? esc(b.name[0]) : '?'}</span><div class="lane-main"><b>${b ? esc(b.name) : 'No brand yet'}</b><small>${b ? esc(b.domain) : 'Finish onboarding first'} · sources, destinations, search and audit stay inside this brand</small></div><em>${S.brandSensitive ? 'Sensitive' : 'Standard'}</em></article>
      </div>
      ${b ? `<form id="sensitive-form" class="lane-form">
        <label class="check-line"><input type="checkbox" id="brand-sensitive" ${S.brandSensitive ? 'checked' : ''}> Mark this brand sensitive</label>
        <p class="muted small">Sensitive brands require an additional role before anyone - including your own team - can open them. In the hosted build, isolation is enforced in storage queries, background jobs, search and notifications, not only in this UI. Cross-brand retrieval is denied by default and covered by automated tests.</p>
        <button class="onb-primary">Save</button>
      </form>` : ''}
    </div>
    <div class="watch-group">
      <h3 class="group-h">Client access roles</h3>
      <div class="sig-list">${roles}</div>
      <p class="muted small">Inviting clients and assigning roles happens in the hosted build. Approval routes stay fixed: drafts and pitches pass the review queue regardless of role.</p>
    </div>
  </div>`;
  const sf = $('#sensitive-form');
  if (sf) sf.addEventListener('submit', e => {
    e.preventDefault();
    S.brandSensitive = $('#brand-sensitive').checked;
    log('brand sensitivity ' + (S.brandSensitive ? 'enabled' : 'removed'), S.brand.name);
    save(); renderAll();
  });
}

/* ----- Notifications: destinations + per-event choices (recorded here, delivered by the hosted backend) ----- */
const NOTIF_EVENTS = [['draft', 'Draft ready'], ['decision', 'Decision needed'], ['exported', 'Export completed'], ['failed', 'Run failed'], ['recovery', 'Recovery needed'], ['digest', 'Weekly digest']];

function maskWebhook(url) {
  try { const u = new URL(url); return u.origin + u.pathname.slice(0, 14) + '...'; } catch (e) { return 'invalid URL'; }
}

function renderNotifications() {
  const dests = S.destinations.map((d, i) => `
    <article class="lane"><span class="provider ${d.kind === 'slack' ? 'slack' : 'cms'}">${d.kind === 'slack' ? 'S' : 'D'}</span>
    <div class="lane-main"><b>${d.kind === 'slack' ? 'Slack' : 'Discord'} webhook</b><small>${esc(d.masked)}</small>
    <small>${NOTIF_EVENTS.filter(([k]) => d.events[k]).map(([, l]) => l).join(' · ') || 'No events chosen'}</small></div>
    <em><button class="linklike" data-rmdest="${i}">Remove</button></em></article>`).join('');
  return `
    <h3 class="group-h">Notification destinations</h3>
    <p class="muted small">Slack and Discord get OAuth pickers in the hosted build. The webhook fallback works today: paste an incoming-webhook URL, choose its events, and it is stored only in this browser - never in logs or links. Notifications never carry approval or publishing power.</p>
    <div class="sig-list">${dests || '<p class="muted">No destinations yet.</p>'}</div>
    <form id="dest-form" class="lane-form">
      <div class="lane-grid"><input id="dest-url" type="url" placeholder="https://hooks.slack.com/... or discord webhook" required></div>
      <div class="dest-events">${NOTIF_EVENTS.map(([k, l]) => `<label><input type="checkbox" data-ev="${k}" ${k === 'draft' || k === 'failed' ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <button class="onb-primary">Add destination</button>
    </form>`;
}

function bindNotifications(el) {
  const f = $('#dest-form', el);
  if (f) f.addEventListener('submit', e => {
    e.preventDefault();
    const url = $('#dest-url').value.trim();
    let kind = null;
    try {
      const u = new URL(url);
      if (u.hostname === 'hooks.slack.com') kind = 'slack';
      if (u.hostname === 'discord.com' && u.pathname.startsWith('/api/webhooks/')) kind = 'discord';
    } catch (err) {}
    if (!kind) { $('#dest-url').setCustomValidity('Enter a Slack (hooks.slack.com) or Discord webhook URL'); $('#dest-url').reportValidity(); return; }
    const events = {};
    $$('[data-ev]', f).forEach(c => { events[c.dataset.ev] = c.checked; });
    S.destinations.push({ id: uid(), kind, masked: maskWebhook(url), events });
    log('notification destination added', kind + ' webhook ' + maskWebhook(url));
    save(); renderAll();
  });
  $$('[data-rmdest]', el).forEach(b => b.addEventListener('click', () => {
    const [removed] = S.destinations.splice(+b.dataset.rmdest, 1);
    log('notification destination removed', removed.kind);
    save(); renderAll();
  }));
}

/* ----- Weekly digest preview: computed from real local state ----- */
function digestPreview() {
  const weekAgo = Date.now() - 7 * 864e5;
  const recent = S.audit.filter(a => new Date(a.time).getTime() > weekAgo);
  const waiting = S.drafts.filter(d => d.state === 'ready').length;
  const approved = S.drafts.filter(d => d.state === 'approved').length;
  const exported = S.drafts.filter(d => d.state === 'exported').length;
  const changes = S.changes.filter(c => new Date(c.time).getTime() > weekAgo).length;
  return `<article class="digest-card">
    <span class="mini-label">WEEKLY DIGEST · PREVIEW</span>
    <h3>Your week, as the digest would say it</h3>
    <ul>
      <li><b>${waiting}</b> draft${waiting === 1 ? '' : 's'} waiting for review</li>
      <li><b>${approved}</b> approved, <b>${exported}</b> exported this cycle</li>
      <li><b>${S.signals.filter(s => s.status === 'kept').length}</b> voice rules kept, <b>${changes}</b> voice change${changes === 1 ? '' : 's'} this week</li>
      <li><b>${S.lanes.length}</b> listening lane${S.lanes.length === 1 ? '' : 's'}, <b>${S.destinations.length}</b> notification destination${S.destinations.length === 1 ? '' : 's'}</li>
      <li><b>${S.competitors.length + S.watchTopics.length + S.watchSources.length}</b> market watch entr${(S.competitors.length + S.watchTopics.length + S.watchSources.length) === 1 ? 'y' : 'ies'} set</li>
      <li><b>${S.angles.length}</b> press angle${S.angles.length === 1 ? '' : 's'}, <b>${S.outlets.length}</b> outlet${S.outlets.length === 1 ? '' : 's'} on file</li>
      <li><b>${recent.length}</b> audited action${recent.length === 1 ? '' : 's'} in 7 days</li>
    </ul>
    <small class="muted">Computed from this browser's state right now. The hosted build sends this to your chosen destinations weekly.</small>
  </article>`;
}

/* ----- Calendar ----- */
function renderCalendar() {
  const el = $('#view-calendar');
  const sched = S.drafts.filter(d => d.state !== 'blocked');
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">CALENDAR</span><h2>Planned work, honest states.</h2></div></div>
    ${sched.length ? sched.map(d => {
      const exportable = d.state === 'approved' || d.state === 'edited';
      const exported = d.state === 'exported';
      const checks = (exportable || exported) ? preflight(d) : [];
      const blockedBy = checks.filter(c => c.blocking && !c.ok);
      return `<div class="cal-item">
      <div class="cal-row"><div class="cal-day"><b>${esc(d.slot || 'Unscheduled')}</b><small>${esc(d.channel)}</small></div>
      <div class="cal-main"><b>${esc(d.title)}</b><small>${esc(d.kind)}</small></div>${stateChip(d.state)}</div>
      ${exportable ? `<div class="pack-panel">
        <span class="mini-label">EXPORT PACK · PREFLIGHT</span>
        <ul class="pf-list">${checks.map(c => `<li class="${c.ok ? 'pf-pass' : c.blocking ? 'pf-block' : 'pf-warn'}"><i></i><div><b>${esc(c.name)}</b><small>${esc(c.ok ? c.note : c.fix)}</small></div></li>`).join('')}</ul>
        <div class="pack-actions">
          <button class="rv-edit" data-xact="copy" data-id="${d.id}">Copy text</button>
          <button class="rv-approve" data-xact="download" data-id="${d.id}" ${blockedBy.length ? 'disabled' : ''}>Download pack (.md)</button>
          <button class="rv-back" data-xact="mark" data-id="${d.id}" ${blockedBy.length ? 'disabled' : ''}>Mark as exported</button>
        </div>
        ${blockedBy.length ? '<small class="muted">Preflight failed closed: ' + esc(blockedBy[0].name) + '. Fix it in Review, then export.</small>' : '<small class="muted">Nothing auto-publishes. The pack is for your hands or a connected CMS.</small>'}
      </div>` : ''}
      ${exported ? `<div class="pack-panel done"><small class="muted">Exported${d.exportedAt ? ' ' + new Date(d.exportedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}. Publishing stays manual or via a connected CMS.</small><button class="linklike" data-xact="download" data-id="${d.id}">Download again</button></div>` : ''}
      </div>`;
    }).join('')
      : '<p class="muted">Nothing planned. Build a first pack from onboarding.</p>'}
    <p class="muted small">Approved means approved. Publishing happens through a connected CMS or by hand, never silently.</p>
  </div>`;
  $$('[data-xact]', el).forEach(b => b.addEventListener('click', () => {
    const d = S.drafts.find(x => x.id === b.dataset.id);
    if (!d) return;
    const act = b.dataset.xact;
    if (act === 'copy') {
      navigator.clipboard.writeText(d.body).then(() => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy text'; }, 1500); });
      log('copy copied to clipboard', d.title); save();
    } else if (act === 'download') {
      downloadPack(d);
    } else if (act === 'mark') {
      d.state = 'exported'; d.exportedAt = new Date().toISOString();
      log('draft marked exported', d.title);
      save(); renderAll();
    }
  }));
}

/* ----- Voice profile ----- */
function renderVoice() {
  const el = $('#view-voice');
  const kept = S.signals.filter(s => s.status === 'kept');
  const rejected = S.signals.filter(s => s.status === 'rejected');
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">VOICE PROFILE</span><h2>${S.sample ? 'Built from your sample, in the open.' : 'No sample yet.'}</h2></div><span>${kept.length} rules kept</span></div>
    ${S.sample && S.sample.kind === 'audio' ? '<p class="muted">Your sample is audio. Transcription and rule extraction arrive with the hosted backend.</p>' : ''}
    ${kept.length ? `<h3 class="group-h">Your rules</h3>` + kept.map(sg => `
      <article class="sig kept"><div class="sig-main"><b>${esc(sg.rule)}</b><small>Evidence from ${esc(sg.source)}</small><blockquote>${esc(sg.quote)}</blockquote></div>
      <div class="sig-actions"><button class="chip-reject" data-unkeep="${sg.id}">Remove</button></div></article>`).join('') : '<p class="muted">No rules kept yet.</p>'}
    ${rejected.length ? `<h3 class="group-h">Rejected</h3>` + rejected.map(sg => `<article class="sig dim"><div class="sig-main"><b>${esc(sg.rule)}</b><small>You rejected this. It stays rejected.</small></div></article>`).join('') : ''}
    <h3 class="group-h">What changed in this voice</h3>
    ${S.changes.length ? S.changes.map(c => `
      <article class="chg" data-id="${c.id}">
        <span class="mini-label">${c.status === 'proposed' ? 'PROPOSED' : c.status === 'kept' ? 'KEPT' : c.status === 'rolled-back' ? 'ROLLED BACK' : 'REJECTED'} · ${new Date(c.time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        <h3>${esc(c.title)}</h3>
        <div class="chg-diff"><div><small>BEFORE</small><p>${esc(c.before)}</p></div><div class="after"><small>AFTER</small><p>${esc(c.after)}</p></div></div>
        <small class="muted">Author: ${esc(c.author)} · Affects ${esc(c.affected)}</small>
        <footer>${c.status === 'proposed' ? `<button class="chip-keep" data-chg="keep">Keep this change</button><button class="chip-reject" data-chg="reject">Not us</button>` : c.status === 'kept' ? `<button class="chip-reject" data-chg="rollback">Roll back</button>` : ''}</footer>
      </article>`).join('') : '<p class="muted">No edits yet. When you edit a draft, the proposed voice change lands here with before and after.</p>'}
  </div>`;
  $$('[data-unkeep]', el).forEach(b => b.addEventListener('click', () => {
    const sg = S.signals.find(x => x.id === b.dataset.unkeep);
    sg.status = 'rejected'; log('voice rule removed', sg.rule); save(); renderAll();
  }));
  $$('[data-chg]', el).forEach(b => b.addEventListener('click', () => {
    const c = S.changes.find(x => x.id === b.closest('.chg').dataset.id);
    c.status = b.dataset.chg === 'keep' ? 'kept' : b.dataset.chg === 'rollback' ? 'rolled-back' : 'rejected';
    log(`voice change ${c.status}`, c.title);
    save(); renderAll();
  }));
}

/* ----- Results ----- */
function renderResults() {
  $('#view-results').innerHTML = `<div class="empty-view"><span class="eyebrow">RESULTS</span><h2>Nothing to measure yet.</h2><p>Results explain what changed and why, from connected performance: Search Console for search, channel data for posts. Manual entry stays as a fallback. Connect a source and the first explanations land here, with no vanity charts.</p><button data-goto="signals">Connect a source</button></div>`;
}

/* ----- System health + activity ----- */
function renderHealth() {
  const el = $('#view-health');
  const ready = S.drafts.filter(d => d.state === 'ready').length;
  const routines = [
    ['Onboarding', S.onboarded ? ['ok', 'Complete'] : ['warn', 'Not finished'], S.onboarded ? 'First pack built' : 'Finish the four steps'],
    ['Voice learning', S.signals.some(s => s.status === 'kept') ? ['ok', 'Active'] : ['warn', 'Waiting'], `${S.signals.filter(s => s.status === 'kept').length} rules kept, ${S.changes.length} changes recorded`],
    ['Review queue', ready ? ['warn', 'Needs you'] : ['ok', 'Clear'], ready ? `${ready} drafts waiting` : 'Nothing waiting'],
    ['Search ingestion', ['off', 'Not connected'], 'Connect Search Console to start'],
    ['Listening', S.lanes.length ? ['ok', 'Lanes set'] : ['off', 'No lanes'], S.lanes.length ? S.lanes.length + (S.lanes.length === 1 ? ' lane saved' : ' lanes saved') + ', watcher is hosted-only' : 'Add a lane in Listening'],
    ['Market watch', (S.competitors.length + S.watchTopics.length + S.watchSources.length) ? ['ok', 'Watching'] : ['off', 'Nothing tracked'], (S.competitors.length + S.watchTopics.length + S.watchSources.length) ? [S.competitors.length + (S.competitors.length === 1 ? ' competitor' : ' competitors'), S.watchTopics.length + (S.watchTopics.length === 1 ? ' topic' : ' topics'), S.watchSources.length + (S.watchSources.length === 1 ? ' source' : ' sources')].join(', ') + ', tracker is hosted-only' : 'Add one in Market watch'],
    ['Press', (S.angles.length + S.outlets.length) ? ['ok', 'Lists set'] : ['off', 'No angles or outlets'], (S.angles.length + S.outlets.length) ? S.angles.length + (S.angles.length === 1 ? ' angle' : ' angles') + ', ' + S.outlets.length + (S.outlets.length === 1 ? ' outlet' : ' outlets') + ', pitching is hosted-only' : 'Add them in Press'],
    ['Publishing', ['off', 'Draft-only'], 'Connect a CMS to export'],
    ['Isolation', ['ok', 'Enforced'], (S.brandSensitive ? 'Sensitive brand: extra role required, ' : '') + 'cross-brand retrieval denied by default'],
  ];
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">SYSTEM HEALTH</span><h2>Every routine shows its state.</h2></div></div>
    <div class="routine-list">${routines.map(([name, [cls, st], note]) => `
      <div class="routine"><i class="${cls}"></i><div><b>${name}</b><small>${note}</small></div><em class="${cls === 'warn' ? 'needs-you' : ''}">${st}</em></div>`).join('')}</div>
    ${digestPreview()}
    ${renderNotifications()}
    <h3 class="group-h">Activity</h3>
    <p class="muted small">Everything you approve, edit, reject or roll back is recorded here. Newest first.</p>
    <div class="audit-list">${S.audit.length ? S.audit.map(a => `
      <div class="audit-row"><div><b>${esc(a.action)}</b>${a.detail ? `<small>${esc(a.detail)}</small>` : ''}</div>
      <time>${new Date(a.time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></div>`).join('')
      : '<p class="muted">Nothing recorded yet.</p>'}</div>
  </div>`;
  bindNotifications(el);
}

/* ---------- boot ---------- */
renderBrand();
if (location.hash === '#workspace') openApp();

/* Existing brands from before the hosted backend: connect + migrate on first load. */
if (S.onboarded && S.brand && !(S.hosted && S.hosted.token)) connectBackend();
