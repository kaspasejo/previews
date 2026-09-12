/* Pointed preview app: state, onboarding, review queue, voice learning, audit.
   Everything runs client-side. State persists in localStorage under pointed.state.v1. */

const LS_KEY = 'pointed.state.v1';
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
    onboarded: false
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(LS_KEY)) || freshState(); } catch (e) { S = freshState(); }
const save = () => localStorage.setItem(LS_KEY, JSON.stringify(S));
const log = (action, detail) => { S.audit.unshift({ id: uid(), time: new Date().toISOString(), actor: 'you', action, detail }); };

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
function buildPack() {
  const kept = S.signals.filter(s => s.status === 'kept');
  const name = S.brand.name;
  const sents = S.sample && S.sample.text ? sentences(S.sample.text) : [];
  const opener = sents.length ? sents.reduce((a, b) => (a.split(/\s+/).length <= b.split(/\s+/).length ? a : b)) : '';
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
  const listen = {
    id: uid(), channel: 'Listening', kind: 'Connection needed', state: 'blocked', slot: null,
    title: 'Your listening lane is empty',
    body: 'Pointed watches communities you opt into and ranks conversations worth joining, with the source link and the reason. Connect a source in Signals to fill this lane.',
    why: 'No listening source connected.',
    evidence: []
  };
  S.drafts = [post, outline, listen];
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
      buildPack(); save();
      showStep(3); renderPack();
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

$('#onb-signals-done').addEventListener('click', () => {
  buildPack();
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
});

/* ---------- workspace ---------- */

const app = $('#app');
let view = 'today';

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
  const d = new Date();
  $('#ws-date').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  const h = d.getHours();
  $('#ws-greeting').textContent = h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.';
  const ready = S.drafts.filter(x => x.state === 'ready').length;
  const nc = $('#nav-count'); nc.hidden = !ready; nc.textContent = ready;
  ['today', 'review', 'signals', 'calendar', 'voice', 'results', 'health'].forEach(v => { $('#view-' + v).hidden = v !== view; });
  ({ today: renderToday, review: renderReview, signals: renderSignals, calendar: renderCalendar, voice: renderVoice, results: renderResults, health: renderHealth })[view]();
}

const stateChip = s => ({ ready: '<span class="st ready">Ready for you</span>', approved: '<span class="st approved">Approved</span>', edited: '<span class="st edited">Edited</span>', sentback: '<span class="st sentback">Sent back</span>', blocked: '<span class="st blocked">Connection needed</span>' }[s] || '');

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
  $$('[data-review]', el).forEach(b => b.addEventListener('click', () => { view = 'review'; renderAll(); }));
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
      </footer>` : d.state === 'approved' ? `<footer><span class="muted">Approved by you. It sits in the Calendar as approved, never auto-published.</span></footer>` : ''}
    </article>`).join('')}
  </div>`;
  $$('.rev-card button', el).forEach(b => b.addEventListener('click', () => {
    const card = b.closest('.rev-card');
    const d = S.drafts.find(x => x.id === card.dataset.id);
    const act = b.dataset.act;
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
}

/* ----- Signals ----- */
function renderSignals() {
  const el = $('#view-signals');
  const comps = S.competitors.map((c, i) => `<div class="check-row"><i class="ok"></i><span>${esc(c)}</span><em><button class="linklike" data-rmcomp="${i}">Remove</button></em></div>`).join('');
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">SIGNALS</span><h2>Sources you choose. Nothing watched in secret.</h2></div></div>
    <div class="sig-sources">
      <article><span class="provider comp">↗</span><div><b>Competitors</b><small>Up to 3 sites. Pointed proposes a keyword map you review.</small></div></article>
      <form id="comp-form" class="comp-form"><input id="comp-url" type="url" placeholder="https://competitor.com" ${S.competitors.length >= 3 ? 'disabled' : ''} required><button ${S.competitors.length >= 3 ? 'disabled' : ''}>Add</button></form>
      ${comps || '<p class="muted">No competitors yet.</p>'}
      <article class="src-off"><span class="provider google">G</span><div><b>Google Search Console</b><small>OAuth read access. Property picker appears after sign-in.</small></div><em>Hosted build only</em></article>
      <article class="src-off"><span class="provider slack">R</span><div><b>Reddit listening</b><small>Opt-in communities, ranked conversations, source links.</small></div><em>Hosted build only</em></article>
    </div>
    <div class="kw-map"><span class="eyebrow">KEYWORD MAP</span><p class="muted">${S.competitors.length ? 'Proposed after the first research run. Runs live on the hosted backend; this preview records your competitors so the map has somewhere to start.' : 'Add at least one competitor and Pointed has somewhere to start.'}</p></div>
  </div>`;
  const f = $('#comp-form');
  if (f) f.addEventListener('submit', e => {
    e.preventDefault();
    try {
      const u = new URL($('#comp-url').value.startsWith('http') ? $('#comp-url').value : 'https://' + $('#comp-url').value);
      S.competitors.push(u.hostname.replace(/^www\./, ''));
      log('competitor added', u.hostname);
      save(); renderAll();
    } catch (err) { $('#comp-url').setCustomValidity('Enter a valid URL'); $('#comp-url').reportValidity(); }
  });
  $$('[data-rmcomp]', el).forEach(b => b.addEventListener('click', () => {
    const [removed] = S.competitors.splice(+b.dataset.rmcomp, 1);
    log('competitor removed', removed);
    save(); renderAll();
  }));
}

/* ----- Calendar ----- */
function renderCalendar() {
  const el = $('#view-calendar');
  const sched = S.drafts.filter(d => d.state !== 'blocked');
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">CALENDAR</span><h2>Planned work, honest states.</h2></div></div>
    ${sched.length ? sched.map(d => `
      <div class="cal-row"><div class="cal-day"><b>${esc(d.slot || 'Unscheduled')}</b><small>${esc(d.channel)}</small></div>
      <div class="cal-main"><b>${esc(d.title)}</b><small>${esc(d.kind)}</small></div>${stateChip(d.state)}</div>`).join('')
      : '<p class="muted">Nothing planned. Build a first pack from onboarding.</p>'}
    <p class="muted small">Approved means approved. Publishing happens through a connected CMS or by hand, never silently.</p>
  </div>`;
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
    ['Listening', ['off', 'Not connected'], 'Add a source in Signals'],
    ['Publishing', ['off', 'Draft-only'], 'Connect a CMS to export'],
  ];
  el.innerHTML = `<div class="review-wrap">
    <div class="section-head"><div><span class="eyebrow">SYSTEM HEALTH</span><h2>Every routine shows its state.</h2></div></div>
    <div class="routine-list">${routines.map(([name, [cls, st], note]) => `
      <div class="routine"><i class="${cls}"></i><div><b>${name}</b><small>${note}</small></div><em class="${cls === 'warn' ? 'needs-you' : ''}">${st}</em></div>`).join('')}</div>
    <h3 class="group-h">Activity</h3>
    <p class="muted small">Everything you approve, edit, reject or roll back is recorded here. Newest first.</p>
    <div class="audit-list">${S.audit.length ? S.audit.map(a => `
      <div class="audit-row"><div><b>${esc(a.action)}</b>${a.detail ? `<small>${esc(a.detail)}</small>` : ''}</div>
      <time>${new Date(a.time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></div>`).join('')
      : '<p class="muted">Nothing recorded yet.</p>'}</div>
  </div>`;
}

/* ---------- boot ---------- */
renderBrand();
if (location.hash === '#workspace') openApp();
