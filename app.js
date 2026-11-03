/* =========================================================
   Pari tenu — interface
   Les données passent par window.api (Supabase ou mode démo).
   ========================================================= */

const TYPES = {
  poids: { emoji: '⚖️', label: 'Perte de poids', unite: 'kg' },
  sport: { emoji: '🏋️', label: 'Salle de sport', unite: 'séances / sem.' },
  tabac: { emoji: '🚭', label: 'Arrêter de fumer', unite: 'cigarettes / jour' },
  autre: { emoji: '✨', label: 'Défi libre', unite: 'fois' },
};
const VISI = {
  prive: { emoji: '🔒', label: 'Privé', aide: 'Visible uniquement par les membres et les potes invités' },
  public: { emoji: '🌍', label: 'Public', aide: 'Visible par tous les inscrits, qui peuvent le rejoindre' },
};
const HINTS = {
  poids: 'Départ = ton poids de départ, Cible = le poids visé.',
  sport: 'Cible = nombre de séances par semaine.',
  tabac: 'Cible = nombre max de cigarettes par jour (0 = arrêt total).',
  autre: 'Cible = nombre de fois à réaliser sur toute la période.',
};

// Comment on suit un défi
const SUIVIS = {
  jour: { label: 'Je note chaque jour', aide: "Tu enregistres ta journée (séance, pesée, journée clean…). L'appli te le rappelle chaque jour." },
  semaine: { label: 'Je note chaque semaine', aide: 'Un point par semaine suffit, idéal pour une pesée hebdo.' },
  mois: { label: 'Je note chaque mois', aide: 'Un seul point par mois, pour les défis au long cours (pesée mensuelle, budget…).' },
  ecarts: { label: 'Je signale seulement quand je craque', aide: "Rien à faire au quotidien : chaque jour sans écart compte comme réussi. Tu déclares juste « J'ai flanché » quand ça arrive." },
};
const modeEcarts = (d) => d.frequence_saisie === 'ecarts';

let ME = null;
let cleanup = null; // arrête l'écoute du chat quand on change de page

/* ---------- Utilitaires ---------- */
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parseISO = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const clamp = (x) => Math.max(0, Math.min(1, isFinite(x) ? x : 0));
const fmtDate = (s) => s ? parseISO(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const num = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
// Accord selon le sexe : H → masculin, F → féminin, N → formulation neutre
const acc = (sexe, h, f, n) => (sexe === 'H' ? h : sexe === 'F' ? f : n);
const SEXES = [['F', 'Femme'], ['H', 'Homme'], ['N', 'Je préfère ne pas le dire']];
const mmjj = (dateIso) => String(dateIso || '').slice(5, 10);
function profilFields(sexe = '', naissance = '', partage = false) {
  const max = today();
  return `<div class="field help-field">
      <div class="lbl-row"><label for="f-naissance">Date de naissance</label>${helpBtn('aide-naissance')}</div>
      <input type="date" id="f-naissance" name="naissance" max="${max}" min="1900-01-01" value="${esc(naissance || '')}" required>
      <p class="help-text" id="aide-naissance" hidden>Pour te souhaiter ton anniversaire 🎂. Ta date de naissance reste privée : personne d'autre ne la voit.</p>
      <label class="toggle"><input type="checkbox" name="partage_anniv" ${partage ? 'checked' : ''}><span class="toggle-ui" aria-hidden="true"></span>
        <span>Prévenir mes amis le jour de mon anniversaire<small>Ils verront seulement « c'est ton anniversaire » ce jour-là, jamais ta date ni ton âge.</small></span></label>
    </div>
    <div class="field help-field">
      <div class="lbl-row"><span class="lbl">Tu es</span>${helpBtn('aide-sexe')}</div>
      <div class="chips pick sexe-pick">${SEXES.map(([k, l]) => `<label class="chip pick-chip"><input type="radio" name="sexe" value="${k}" ${sexe === k ? 'checked' : ''} required><span>${l}</span></label>`).join('')}</div>
      <p class="help-text" id="aide-sexe" hidden>Pour que les messages de l'appli soient bien écrits (« il a flanché », « elle a flanché », « ton ami », « ton amie »…).</p>
    </div>`;
}
const go = (h) => { if (location.hash === h) render(); else location.hash = h; };

function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}

// Exécute une action, affiche l'erreur éventuelle, puis rafraîchit
async function act(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(typeof okMsg === 'string' ? okMsg : r); await render(); return true; }
  catch (e) { toast(e.message, true); return false; }
}

function dialog(html, setup) {
  return new Promise((resolve) => {
    const dlg = $('#dlg'), form = $('#dlg-form');
    form.innerHTML = html;
    if (setup) setup(form);
    dlg.returnValue = '';
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? new FormData(form) : null);
    dlg.showModal();
  });
}
const confirmDlg = async (title, text, label = 'Confirmer') => !!(await dialog(`<h3>${esc(title)}</h3><p>${esc(text)}</p>
  <div class="actions"><button class="btn rose" value="ok">${esc(label)}</button><button class="btn ghost" value="cancel" formnovalidate>Annuler</button></div>`));


/* ---------- Temps ---------- */
function timeInfo(d) {
  const t = today();
  const total = Math.max(1, daysBetween(d.date_debut, d.date_fin));
  const elapsed = Math.max(0, Math.min(total, daysBetween(d.date_debut, t)));
  const remaining = Math.max(0, daysBetween(t, d.date_fin));
  let status = 'en cours';
  if (t < d.date_debut) status = 'à venir';
  else if (t > d.date_fin) status = 'terminé';
  return { total, elapsed, remaining, status, pct: elapsed / total, startsIn: daysBetween(t, d.date_debut) };
}

/* ---------- Statistiques par type de défi ---------- */
function stats(d, m, entries, ecarts) {
  const e = entries.filter((x) => x.user_id === m.user_id).sort((a, b) => String(a.date).localeCompare(b.date));
  const t = today();
  const ti = timeInfo(d);
  const last = e[e.length - 1];
  const sinceLast = last ? daysBetween(last.date, t) : Infinity;
  const due = d.frequence_saisie === 'mois' ? sinceLast >= 30 : d.frequence_saisie === 'semaine' ? sinceLast >= 7 : sinceLast >= 1;
  const freqTxt = d.frequence_saisie === 'mois' ? 'du mois' : d.frequence_saisie === 'semaine' ? 'de la semaine' : 'du jour';
  const unite = m.unite || TYPES[d.type]?.unite || '';
  const s = { pct: 0, big: '', sub: '', extra: '', atteint: false, todo: '' };

  // Mode « je signale seulement mes écarts » : un jour sans écart = un jour réussi
  if (modeEcarts(d)) {
    const autorises = num(m.valeur_cible) ?? 0;
    const jours = new Set(ecarts.filter((x) => x.joueur === m.user_id && x.date >= d.date_debut && x.date <= d.date_fin).map((x) => String(x.date).slice(0, 10)));
    const n = jours.size;
    const ecoules = ti.status === 'à venir' ? 0 : Math.min(ti.elapsed + 1, ti.total + 1);   // jours déjà vécus du défi
    const clean = Math.max(0, ecoules - [...jours].filter((x) => x <= t).length);
    const lastBad = [...jours].sort().pop();
    const fin = t > d.date_fin ? d.date_fin : t;
    const serie = ti.status === 'à venir' ? 0 : Math.max(0, lastBad ? daysBetween(lastBad, fin) : daysBetween(d.date_debut, fin) + 1);
    s.pct = clamp(clean / (ti.total + 1));
    s.atteint = n <= autorises;
    s.big = `${serie} <small>jour${serie > 1 ? 's' : ''} sans craquer</small>`;
    s.sub = `${n} écart${n > 1 ? 's' : ''} · ${autorises} autorisé${autorises > 1 ? 's' : ''} sur le défi${n > autorises ? ' · <b>limite dépassée</b>' : ''}`;
    return s;
  }

  if (d.type === 'poids') {
    const dep = num(m.valeur_depart) ?? (e[0] ? Number(e[0].valeur) : null);
    const cible = num(m.valeur_cible);
    const cur = last ? Number(last.valeur) : dep;
    if (dep != null && cible != null && cur != null) {
      s.pct = clamp((dep - cur) / (dep - cible));
      s.atteint = dep >= cible ? cur <= cible : cur >= cible;
      const diff = +(cur - dep).toFixed(1);
      s.big = `${cur} <small>${esc(unite)}</small>`;
      s.sub = `Départ ${dep} → objectif ${cible} ${esc(unite)} · <b>${diff > 0 ? '+' : ''}${diff} ${esc(unite)}</b>`;
    } else { s.big = cur != null ? `${cur} <small>${esc(unite)}</small>` : '—'; s.sub = 'Objectif pas encore renseigné'; }
    s.extra = sparkline(e.map((x) => Number(x.valeur)), cible);
    if (due && ti.status === 'en cours') s.todo = `Pesée ${freqTxt} à faire`;
  } else if (d.type === 'sport') {
    const cible = num(m.valeur_cible) || 3;
    const weeks = Math.max(1, Math.ceil(ti.total / 7));
    const total = e.reduce((a, x) => a + (num(x.valeur) ?? 1), 0);
    const weekIdx = Math.floor(Math.max(0, daysBetween(d.date_debut, t)) / 7);
    const thisWeek = e.filter((x) => Math.floor(daysBetween(d.date_debut, x.date) / 7) === weekIdx).reduce((a, x) => a + (num(x.valeur) ?? 1), 0);
    s.pct = clamp(total / (cible * weeks));
    s.atteint = total >= cible * weeks;
    s.big = `${thisWeek}/${cible} <small>cette semaine</small>`;
    s.sub = `${total} séance${total > 1 ? 's' : ''} au total · objectif ${cible * weeks} sur le défi`;
    s.extra = `<div class="dots">${Array.from({ length: cible }, (_, i) => `<i class="${i < thisWeek ? 'on' : ''}"></i>`).join('')}</div>`;
    if (thisWeek < cible && ti.status === 'en cours') s.todo = `Encore ${cible - thisWeek} séance${cible - thisWeek > 1 ? 's' : ''} cette semaine`;
  } else if (d.type === 'tabac') {
    const cible = num(m.valeur_cible) ?? 0;
    const badDates = e.filter((x) => Number(x.valeur) > cible).map((x) => x.date)
      .concat(ecarts.filter((x) => x.joueur === m.user_id).map((x) => x.date)).sort();
    const lastBad = badDates[badDates.length - 1];
    const ref = lastBad && lastBad >= d.date_debut ? lastBad : null;
    const end = t > d.date_fin ? d.date_fin : t;
    const streak = Math.max(0, ref ? daysBetween(ref, end) : daysBetween(d.date_debut, end) + 1);
    const badCount = new Set(badDates.filter((x) => x >= d.date_debut)).size;
    s.pct = clamp(Math.max(0, ti.elapsed + 1 - badCount) / (ti.total + 1));
    s.atteint = badCount === 0;
    s.big = `${streak} <small>jour${streak > 1 ? 's' : ''} tenu${streak > 1 ? 's' : ''} d'affilée</small>`;
    s.sub = `Max ${cible} ${esc(unite)} · ${badCount} jour${badCount > 1 ? 's' : ''} d'écart`;
    if (due && ti.status === 'en cours') s.todo = `Point ${freqTxt} à faire`;
  } else {
    const cible = num(m.valeur_cible) || ti.total;
    const done = e.reduce((a, x) => a + (num(x.valeur) ?? 1), 0);
    s.pct = clamp(done / cible);
    s.atteint = done >= cible;
    s.big = `${done}/${cible} <small>${esc(unite || 'fois')}</small>`;
    s.sub = `${Math.max(0, cible - done)} restant${cible - done > 1 ? 's' : ''}`;
    if (due && ti.status === 'en cours') s.todo = `À cocher ${freqTxt}`;
  }
  return s;
}

function sparkline(values, cible) {
  if (values.length < 2) return '';
  const w = 300, h = 70, p = 6;
  const all = cible != null ? [...values, cible] : values;
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1;
  const x = (i) => p + (i * (w - 2 * p)) / (values.length - 1);
  const y = (v) => p + ((max - v) * (h - 2 * p)) / span;
  const goal = cible != null ? `<line x1="${p}" x2="${w - p}" y1="${y(cible)}" y2="${y(cible)}" stroke="#E9A1B6" stroke-dasharray="4 4"/>` : '';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${goal}
    <polyline points="${values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" fill="none" stroke="#2F5B4A" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(values.length - 1)}" cy="${y(values[values.length - 1])}" r="4" fill="#B54C70"/></svg>`;
}

/* ---------- Navigation ---------- */
const TABS = [
  { view: '', icon: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', label: 'Accueil', also: [] },
  { view: 'defis', icon: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>', label: 'Défis', also: ['defi', 'modifier', 'objectif', 'idees'] },
  { view: 'nouveau', icon: '<path d="M12 5v14M5 12h14"/>', label: 'Nouveau défi', also: [], plus: true },
  { view: 'chat', icon: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>', label: 'Chat', also: [] },
  { view: 'amis', icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M15.5 14.3A5 5 0 0 1 21.5 19.5"/>', label: 'Amis', also: ['ajouter'], badge: 'amis' },
];

function renderNav() {
  $('#usernav').innerHTML = ME ? `<a class="navlink bell-btn ${location.hash.startsWith('#/notifs') ? 'on' : ''}" href="#/notifs" title="Notifications" aria-label="Notifications">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><i class="bell-dot" hidden></i></a>
    ${ME.role === 'admin' ? `<a class="navlink admin-btn ${location.hash.startsWith('#/admin') ? 'on' : ''}" href="#/admin" title="Administration" aria-label="Administration">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg></a>` : ''}
    <a class="navlink pseudo" href="#/compte" title="Mon profil">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>${esc(ME.pseudo)}</a>` : '';
  const bar = $('#tabbar');
  document.body.classList.toggle('has-tabbar', !!ME);
  if (!ME) { bar.hidden = true; return; }
  const view = location.hash.replace(/^#\/?/, '').split('/')[0];
  bar.hidden = false;
  bar.innerHTML = TABS.map((t) => {
    const on = t.view === view || t.also.includes(view);
    return `<a href="#/${t.view}" class="tab ${on ? 'on' : ''} ${t.plus ? 'plus' : ''}" ${t.badge ? `data-badge="${t.badge}"` : ''}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg>
      <span>${t.label}</span></a>`;
  }).join('');
  majCloche();
  // pastille sur « Amis » quand une demande attend
  api.listAmis().then((A) => {
    const t = bar.querySelector('[data-badge="amis"]');
    if (t && A.recues.length) t.insertAdjacentHTML('beforeend', `<i class="tab-dot">${A.recues.length}</i>`);
  }).catch(() => {});
}

async function render() {
  renderNav();
  const [view, id, id2] = location.hash.replace(/^#\/?/, '').split('/');
  const app = $('#app');
  app.onclick = null;
  if (cleanup) { cleanup(); cleanup = null; }
  if (ME) {
    ecouterNotifs();
    if (['defi', 'chat', 'amis', ''].includes(view) && !(view === 'chat' && !id)) {
      const lien = view === '' ? '#/' : location.hash;
      api.lireNotifsLien(lien).then(majCloche).catch(() => {});
    }
  }
  document.body.classList.remove('chat-mode');
  if (!ME) return view === 'inscription' ? renderSignup() : renderLogin();
  try {
    if (view === 'defi') await renderDefi(id);
    else if (view === 'nouveau') await renderForm(null, id);
    else if (view === 'idees') renderIdees();
    else if (view === 'amis' || view === 'ajouter') await renderAmis();
    else if (view === 'modifier') await renderForm(id);
    else if (view === 'objectif') await renderObjectif(id);
    else if (view === 'admin') await renderAdmin();
    else if (view === 'compte') renderCompte();
    else if (view === 'notifs') await renderNotifs();
    else if (view === 'defis') await renderHome();
    else if (view === 'chat' && id2) await renderChat(id, id2);
    else if (view === 'chat' && id) await renderChat('d', id);
    else if (view === 'chat') await renderChatList();
    else await renderDashboard();
    if (!ME.tuto_vu && !document.body.classList.contains('chat-mode')) setTimeout(startTuto, 350);
  } catch (e) {
    app.innerHTML = `<div class="card empty mt"><h3>Oups</h3><p>${esc(e.message)}</p><a class="btn ghost" href="#/">Retour</a></div>`;
  }
}

/* ---------- Connexion / inscription ---------- */
const heroHome = (sub = '') => `<section class="hero"><h1>Pari<span class="l2">tenu</span></h1>
  <span class="kicker">On y arrive mieux en équipe</span>${sub}</section>`;

function renderLogin() {
  $('#app').innerHTML = `${heroHome()}
    <form class="card narrow" id="login">
      <h3>Connexion</h3>
      <label class="field">Email<input type="email" name="email" required autocomplete="email"></label>
      <label class="field">Mot de passe<input type="password" name="password" required autocomplete="current-password"></label>
      <div class="actions"><button class="btn rose">Se connecter</button>
        <button type="button" class="btn ghost small" id="forgot">Mot de passe oublié</button></div>
      <p class="mt center">Pas encore de compte ? <a href="#/inscription"><b>Créer un compte</b></a></p>
    </form>`;
  const f = $('#login');
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await api.signIn(f.email.value, f.password.value); ME = await api.session(); go('#/'); }
    catch (err) { toast(err.message, true); }
  };
  $('#forgot').onclick = async () => {
    if (!f.email.value) return toast("Écris d'abord ton email", true);
    try { await api.resetPassword(f.email.value); toast('Email de réinitialisation envoyé'); } catch (err) { toast(err.message, true); }
  };
}

function renderSignup() {
  $('#app').innerHTML = `${heroHome()}
    <form class="card narrow" id="signup">
      <h3>Créer un compte</h3>
      <label class="field">Pseudo (c'est avec lui que tes potes t'invitent)<input name="pseudo" required minlength="2" maxlength="30"></label>
      <label class="field">Email<input type="email" name="email" required autocomplete="email"></label>
      <label class="field">Mot de passe (6 caractères min.)<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
      <label class="field">Confirmer le mot de passe<input type="password" name="password2" required minlength="6" autocomplete="new-password"></label>
      ${profilFields()}
      <button class="btn rose">C'est parti</button>
      <p class="mt center">Tu as déjà un compte ? <a href="#/"><b>Se connecter</b></a></p>
    </form>`;
  const f = $('#signup');
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.password.value !== f.password2.value) return toast('Les mots de passe ne correspondent pas', true);
    try {
      const r = await api.signUp(f.email.value.trim(), f.password.value, f.pseudo.value.trim(), f.sexe.value || 'N', f.naissance.value || null, f.partage_anniv.checked);
      if (r.needsConfirm) {
        $('#app').innerHTML = `${heroHome()}<div class="card narrow center"><h3>Vérifie tes mails 📩</h3>
          <p>Clique sur le lien reçu à <b>${esc(f.email.value)}</b> pour activer ton compte, puis connecte-toi.</p>
          <a class="btn ghost" href="#/">Se connecter</a></div>`;
        return;
      }
      ME = await api.session(); toast(`Bienvenue ${ME.pseudo} ✿`); go('#/');
    } catch (err) { toast(err.message, true); }
  };
}

function renderCompte() {
  $('#app').innerHTML = `<section class="hero small"><h1>Mon compte</h1></section>
    <form class="card narrow" id="compte">
      <p class="muted">${esc(ME.email || '')} · ${ME.role === 'admin' ? acc(ME.sexe, 'Administrateur', 'Administratrice', 'Admin') : acc(ME.sexe, 'Joueur', 'Joueuse', 'Membre')}</p>
      <label class="field">Pseudo<input name="pseudo" required minlength="2" maxlength="30" value="${esc(ME.pseudo)}"></label>
      ${profilFields(ME.sexe, ME.naissance, ME.partage_anniv)}
      <div class="actions"><button class="btn">Enregistrer</button>
        <button type="button" class="btn rose" id="logout">Se déconnecter</button></div>
      <a class="btn ghost mt" href="#/notifs">Notifications du téléphone</a>
      <button type="button" class="btn ghost mt" id="replay-tuto">Revoir le tuto</button>
      ${api.mode === 'demo' ? '<button type="button" class="btn danger small mt" id="reset">Réinitialiser les données de démo</button>' : ''}
    </form>`;
  $('#compte').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await api.updateProfil({ pseudo: f.pseudo.value.trim(), sexe: f.sexe.value || 'N', naissance: f.naissance.value || null, partage_anniv: f.partage_anniv.checked }); ME = await api.session(); toast('Profil mis à jour'); renderNav(); }
    catch (err) { toast(err.message, true); }
  };
  $('#replay-tuto').onclick = () => { go('#/'); setTimeout(startTuto, 400); };
  $('#logout').onclick = async () => { await api.signOut(); ME = null; arreterNotifs(); try { navigator.clearAppBadge?.(); } catch {} go('#/'); };
  const r = $('#reset');
  if (r) r.onclick = async () => { if (await confirmDlg('Réinitialiser ?', 'Toutes les données de démo seront remises à zéro.')) { await api.resetDemo(); ME = null; go('#/'); } };
}

/* ---------- Accueil ---------- */
function defiCard(d, extra = '') {
  const ti = timeInfo(d);
  const tp = TYPES[d.type] || TYPES.autre;
  const v = VISI[d.visibilite] || VISI.prive;
  const when = ti.status === 'à venir' ? `Commence dans ${ti.startsIn} j` : ti.status === 'terminé' ? 'Terminé' : `Jour ${ti.elapsed + 1} / ${ti.total + 1}`;
  return `<a class="card defi-card" href="#/defi/${encodeURIComponent(d.id)}">
    <div class="badges"><span class="badge ${ti.status === 'en cours' ? 'vert' : ti.status === 'terminé' ? 'gris' : ''}">${tp.emoji} ${tp.label}</span>
      <span class="badge contour">${d.solo ? 'Solo' : `${v.emoji} ${v.label}`}</span></div>
    <h3>${esc(d.nom)}</h3>
    <div class="meta"><span>${when}</span>${ti.status === 'en cours' ? `<b>J-${ti.remaining}</b>` : ''}</div>
    <div class="bar"><i style="width:${ti.pct * 100}%"></i></div>
    <div class="chips">${d.membres.map((m) => `<span class="chip ${m.user_id === ME.id ? 'moi' : ''}">${esc(m.pseudo)}</span>`).join('')}</div>
    ${extra}
  </a>`;
}

async function renderHome() {
  const [defis, invs] = await Promise.all([api.listDefis(), api.myInvitations()]);
  defis.sort((a, b) => String(b.date_debut).localeCompare(a.date_debut));
  const isMine = (d) => d.membres.some((m) => m.user_id === ME.id);
  const invited = new Set(invs.map((i) => i.defi_id));
  const mine = defis.filter(isMine);
  const publics = defis.filter((d) => !isMine(d) && d.visibilite === 'public');
  const autres = defis.filter((d) => !isMine(d) && d.visibilite !== 'public' && !invited.has(d.id));

  $('#app').innerHTML = `<section class="hero small"><h1>Les défis</h1><span class="kicker">Les tiens et ceux ouverts à tous</span></section>
    <a class="idee-link card-like" href="#/idees">${ico('ampoule')}<span><b>Idées de défis</b><small>Santé, sport, habitudes… lance-toi en un clic</small></span><i>›</i></a>
    ${invitationsHtml(invs)}
    <h2 class="section-title">Mes défis</h2>
    ${mine.length ? `<div class="grid">${mine.map((d) => defiCard(d)).join('')}</div>`
      : `<div class="card empty">Tu n'as pas encore de défi. Crée-en un ou rejoins un défi public 👇</div>`}
    <h2 class="section-title">Défis publics</h2>
    ${publics.length ? `<div class="grid">${publics.map((d) => defiCard(d, '<span class="join-hint">Voir et rejoindre →</span>')).join('')}</div>`
      : `<div class="card empty muted">Aucun défi public pour le moment.</div>`}
    ${autres.length && ME.role === 'admin' ? `<h2 class="section-title">Défis privés (vue admin)</h2><div class="grid">${autres.map((d) => defiCard(d)).join('')}</div>` : ''}`;

  $('#app').onclick = onInvitationClick;
}

function invitationsHtml(invs) {
  return invs.length ? `<div class="card invit">
      <h3>📩 Invitation${invs.length > 1 ? 's' : ''}</h3>
      ${invs.map((i) => `<div class="inv-row">
        <span><b>${esc(i.from_pseudo)}</b> t'invite à <a href="#/defi/${encodeURIComponent(i.defi_id)}"><b>${esc(i.defi_nom)}</b></a> ${TYPES[i.type]?.emoji || ''}</span>
        <span class="actions"><button class="btn small" data-inv="${esc(i.id)}" data-ok="1">Accepter</button>
        <button class="btn ghost small" data-inv="${esc(i.id)}" data-ok="0">Refuser</button></span></div>`).join('')}
    </div>` : '';
}
function onInvitationClick(e) {
  const b = e.target.closest('[data-inv]');
  if (b) act(() => api.respond(b.dataset.inv, b.dataset.ok === '1'), b.dataset.ok === '1' ? 'Bienvenue dans le défi ! Pense à écrire ton objectif.' : 'Invitation refusée');
}

/* ---------- Tableau de bord ---------- */
async function renderDashboard() {
  const [defis, invs, A, rooms, annivs] = await Promise.all([api.listDefis(), api.myInvitations(), api.listAmis(), api.listConversations(), api.anniversairesAmis(mmjj(today())).catch(() => [])]);
  const monAnniv = ME.naissance && mmjj(ME.naissance) === mmjj(today());
  const moments = rooms.flatMap((r) => r.messages.filter((m) => m.type === 'proposition' && m.data?.statut === 'booké' && m.data.date >= today()).map((m) => ({ m, r })))
    .sort((a, b) => (a.m.data.date + a.m.data.heure).localeCompare(b.m.data.date + b.m.data.heure));
  const mine = defis.filter((d) => d.membres.some((m) => m.user_id === ME.id) && timeInfo(d).status !== 'terminé');
  const bundles = await Promise.all(mine.map((d) => api.getDefi(d.id)));

  const todos = [], votes = [], rows = [];
  for (const B of bundles) {
    const { defi: d, membres, suivi, ecarts } = B;
    const m = membres.find((x) => x.user_id === ME.id);
    const s = stats(d, m, suivi, ecarts);
    const ti = timeInfo(d);
    const link = `#/defi/${encodeURIComponent(d.id)}`;
    if (s.todo) todos.push({ link, txt: s.todo, nom: d.nom, emoji: TYPES[d.type]?.emoji });
    ecarts.filter((e) => e.statut !== 'faite' && (!e.sanction || !(e.valide_par || []).includes(ME.id)))
      .forEach((e) => votes.push({ link, nom: d.nom, qui: B.pseudos[e.joueur] || '?', propose: !!e.sanction }));
    rows.push({ d, s, ti, link });
  }
  const mesEcarts = bundles.reduce((a, B) => a + B.ecarts.filter((e) => e.joueur === ME.id).length, 0);

  $('#app').innerHTML = `
    <section class="hero small dash-hero"><span class="kicker">Salut ${esc(ME.pseudo)} ✿</span><h1>Pari<span class="l2">tenu</span></h1></section>

    <div class="kpis kpis-3">
      <div class="card kpi"><b>${mine.length}</b><small>défi${mine.length > 1 ? 's' : ''} en cours</small></div>
      <div class="card kpi"><b>${todos.length}</b><small>à faire</small></div>
      <div class="card kpi"><b>${mesEcarts}</b><small>écart${mesEcarts > 1 ? 's' : ''} perso</small></div>
    </div>

    ${monAnniv ? `<div class="card anniv-card"><span class="ico-bubble rose big">${ico('gateau')}</span>
      <div><b>Joyeux anniversaire ${esc(ME.pseudo)} !</b><p>Toute la team Pari tenu te souhaite une super journée. Aujourd'hui, une part de gâteau ne compte pas comme un écart 😉</p></div></div>` : ''}

    ${invitationsHtml(invs)}

    <div class="card">
      <h3>Aujourd'hui</h3>
      ${todos.length || votes.length || A.recues.length || annivs.length ? `<ul class="todo-list">
        ${annivs.map((a) => `<li><a href="#/amis" data-dm="${esc(a.user_id)}"><span class="mom"><span class="ico-bubble sm rose">${ico('gateau')}</span><span>C'est l'anniversaire de <b>${esc(a.pseudo)}</b> ! Écris-lui un petit mot</span></span><i>›</i></a></li>`).join('')}
        ${A.recues.map((r) => `<li><a href="#/amis"><span>👋 <b>${esc(r.pseudo)}</b> veut être ${acc(r.sexe, 'ton ami', 'ton amie', 'dans tes amis')}</span><i>›</i></a></li>`).join('')}
        ${todos.map((t) => `<li><a href="${t.link}"><span>${t.emoji} <b>${esc(t.nom)}</b> · ${esc(t.txt)}</span><i>›</i></a></li>`).join('')}
        ${votes.map((v) => `<li><a href="${v.link}"><span>⚖️ <b>${esc(v.nom)}</b> · ${v.propose ? 'Valider' : 'Proposer'} la sanction de ${esc(v.qui)}</span><i>›</i></a></li>`).join('')}
      </ul>` : `<p class="muted">Rien à faire, tout est à jour 🌿</p>`}
    </div>

    ${moments.length ? `<div class="card"><h3>Moments bookés</h3><ul class="todo-list">${moments.map(({ m, r }) => `<li><a href="#/chat/${r.kind}/${encodeURIComponent(r.id)}">
        <span class="mom"><span class="ico-bubble sm">${ico(ACTIVITES[m.data.activite]?.icon || 'autre')}</span><span><b>${esc(m.data.titre)}</b> · ${parseISO(m.data.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}${m.data.heure ? ' ' + m.data.heure.replace(':', 'h') : ''}
        <small class="muted"> · avec ${esc(roomTitle(r))}</small></span></span><i>›</i></a></li>`).join('')}</ul></div>` : ''}

    <div class="card">
      <h3>Mes progrès</h3>
      ${rows.length ? rows.map(({ d, s, ti, link }) => `<a class="prog-row" href="${link}">
        <div class="prog-head"><span>${TYPES[d.type]?.emoji} <b>${esc(d.nom)}</b></span><span class="muted">${ti.status === 'à venir' ? `dans ${ti.startsIn} j` : `J-${ti.remaining}`}</span></div>
        <div class="bar"><i style="width:${s.pct * 100}%"></i></div>
        <div class="prog-foot"><span>${Math.round(s.pct * 100)} % de mon objectif</span><span>${Math.round(ti.pct * 100)} % du temps</span></div>
      </a>`).join('') : `<p class="muted">Aucun défi en cours.</p><a class="btn rose" href="#/nouveau">Lancer un défi</a>`}
    </div>

    ${bundles.length ? `<div class="card"><h3>Mon calendrier</h3><div class="cal" id="dash-cal"></div></div>` : ''}`;
  const dc = $('#dash-cal');
  if (dc) mountDashCalendar(dc, bundles);
  $('#app').onclick = async (e) => {
    const dm = e.target.closest('[data-dm]');
    if (dm) {
      e.preventDefault();
      try { const cid = await api.creerConversation([dm.dataset.dm]); go(`#/chat/c/${encodeURIComponent(cid)}`); } catch (err) { toast(err.message, true); }
      return;
    }
    onInvitationClick(e);
  };
  if (monAnniv && ME.tuto_vu) popupAnniv();
}

/* ---------- Page d'un défi ---------- */
async function renderDefi(id) {
  const B = await api.getDefi(id);
  const { defi: d, membres, suivi, ecarts, invitations, pseudos } = B;
  const ti = timeInfo(d);
  const tp = TYPES[d.type] || TYPES.autre;
  const v = VISI[d.visibilite] || VISI.prive;
  const fini = ti.status === 'terminé';
  const amMember = membres.some((m) => m.user_id === ME.id);
  const isCreator = d.created_by === ME.id;
  const canEdit = isCreator || ME.role === 'admin';
  const myInvite = !amMember && (await api.myInvitations()).find((i) => i.defi_id === d.id);
  const amisDispo = amMember ? (await api.listAmis()).amis.filter((a) => !membres.some((m) => m.user_id === a.user_id) && !invitations.some((i) => i.to_user === a.user_id)) : [];
  const P = (u) => esc(pseudos[u] || '?');

  const myM = membres.find((m) => m.user_id === ME.id);
  const needsObjectif = myM && !myM.objectif && myM.valeur_cible == null;

  const playerCards = membres.map((m) => {
    const s = stats(d, m, suivi, ecarts);
    const isMe = m.user_id === ME.id;
    const nbE = ecarts.filter((e) => e.joueur === m.user_id).length;
    return `<div class="card player ${isMe ? 'me-card' : ''}">
      <div class="head"><h3>${esc(m.pseudo)}${isMe ? ' <span class="badge">moi</span>' : ''}${m.user_id === d.created_by ? ` <span class="badge vert">${acc(m.sexe, 'créateur', 'créatrice', 'création')}</span>` : ''}</h3>
        <span class="muted">${nbE} écart${nbE > 1 ? 's' : ''}</span></div>
      <p class="obj">« ${esc(m.objectif || "Pas encore d'objectif écrit")} »</p>
      <div class="big">${s.big}</div>
      <div class="muted">${s.sub}</div>
      ${s.extra}
      <div class="bar mt"><i style="width:${s.pct * 100}%"></i></div>
      <div class="muted" style="margin-top:4px">${Math.round(s.pct * 100)} % ${modeEcarts(d) ? 'du défi tenu sans écart' : "de l'objectif"}</div>
      ${s.todo && isMe ? `<div class="todo mt">● ${s.todo}</div>` : ''}
      ${fini ? `<p class="mt ${s.atteint ? 'ok' : 'todo'}">${s.atteint ? '🎉 Objectif atteint → récompense !' : '✗ Objectif raté → sanction finale'}</p>` : ''}
      ${!fini && isMe ? `<div class="actions">${inputFor(d, m)}</div>` : ''}
      ${!fini && amMember ? `<div class="actions">
        ${isMe ? `<button class="btn rose small" data-act="flanche" data-u="${esc(m.user_id)}">J'ai flanché…</button>
                  <a class="btn ghost small" href="#/objectif/${encodeURIComponent(d.id)}">Modifier mon objectif</a>`
               : `<button class="btn ghost small" data-act="flanche" data-u="${esc(m.user_id)}">${acc(m.sexe, "Signaler qu'il a flanché", "Signaler qu'elle a flanché", 'Signaler un écart')}</button>`}
        ${!isMe && canEdit ? `<button class="btn danger small" data-act="retirer" data-u="${esc(m.user_id)}">Retirer</button>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');

  const ecartsHtml = ecarts.length ? ecarts.sort((a, b) => String(b.date).localeCompare(a.date)).map((e) => {
    const vals = e.valide_par || [];
    const missing = membres.filter((m) => !vals.includes(m.user_id));
    const self = e.signale_par === e.joueur;
    return `<div class="ecart">
      <div><span class="who">${P(e.joueur)}</span> a flanché le ${fmtDate(e.date)}
        <span class="badge ${e.statut === 'faite' ? 'vert' : e.statut === 'décidée' ? '' : 'gris'}">${esc(e.statut)}</span></div>
      <div class="muted">${self ? `Avoué par ${P(e.joueur)} 🙏` : `Signalé par ${P(e.signale_par)}`}${e.description ? ` — « ${esc(e.description)} »` : ''}</div>
      <div class="mt">Sanction : <b>${esc(e.sanction || 'pas encore proposée')}</b></div>
      ${e.sanction ? `<div class="validations">Validée par : ${vals.length ? vals.map(P).join(', ') : 'personne'}${missing.length ? ' · en attente de ' + missing.map((m) => esc(m.pseudo)).join(', ') : ' ✓'}</div>` : ''}
      ${amMember && e.statut !== 'faite' ? `<div class="actions">
        <input placeholder="Proposer une sanction" data-sanction="${esc(e.id)}" style="flex:1;min-width:160px">
        <button class="btn ghost small" data-act="propose" data-id="${esc(e.id)}">Proposer</button>
        ${e.sanction && !vals.includes(ME.id) ? `<button class="btn small" data-act="valide" data-id="${esc(e.id)}">Je valide</button>` : ''}
        ${e.statut === 'décidée' ? `<button class="btn vert small" data-act="faite" data-id="${esc(e.id)}">Sanction faite ✓</button>` : ''}
      </div>` : ''}
      ${e.signale_par === ME.id || ME.role === 'admin' ? `<button class="btn danger small mt" data-act="suppr" data-id="${esc(e.id)}">Supprimer</button>` : ''}
    </div>`;
  }).join('') : `<p class="muted">Aucun écart pour l'instant. Bravo l'équipe 💪</p>`;

  const soloHtml = d.solo && isCreator && !fini ? `<div class="card center solo-card">
      <p>${ico('solo')} <b>Défi solo</b> — tu le relèves ${acc(ME.sexe, 'seul', 'seule', 'en solo')}. Envie de motivation ?</p>
      <button class="btn ghost small" data-act="ouvrir">Inviter des potes à ce défi</button></div>` : '';
  const inviteHtml = amMember && !fini && !d.solo ? `<div class="card">
      <h3>Inviter des potes</h3>
      ${amisDispo.length ? `<p class="muted">Tes amis :</p><div class="chips">${amisDispo.map((a) =>
        `<button type="button" class="chip add-chip" data-act="inviter-ami" data-p="${esc(a.pseudo)}">+ ${esc(a.pseudo)}</button>`).join('')}</div>
        <p class="muted mt">Ou par pseudo :</p>` : ''}
      <form class="actions" id="invite-form">
        <input name="pseudo" placeholder="Pseudo de ton pote" required style="flex:1;min-width:160px">
        <button class="btn rose small">Inviter</button>
      </form>
      ${invitations.length ? `<p class="muted mt">En attente de réponse :</p><div class="chips">${invitations.map((i) =>
        `<span class="chip">${esc(i.pseudo)} <button class="x" data-act="annuler-inv" data-id="${esc(i.id)}" title="Annuler">✕</button></span>`).join('')}</div>` : ''}
      <p class="muted mt">${v.emoji} Ce défi est <b>${v.label.toLowerCase()}</b> : ${v.aide.toLowerCase()}.</p>
    </div>` : '';

  const joinHtml = !amMember && !fini ? (myInvite
    ? `<div class="card center invit"><p><b>${esc(myInvite.from_pseudo)}</b> t'invite à ce défi !</p>
        <div class="actions" style="justify-content:center"><button class="btn rose" data-act="accepter" data-id="${esc(myInvite.id)}">Accepter</button>
        <button class="btn ghost" data-act="refuser" data-id="${esc(myInvite.id)}">Refuser</button></div></div>`
    : d.visibilite === 'public' ? `<div class="card center"><p>Ce défi est public, tu peux le rejoindre et fixer ton propre objectif.</p>
        <button class="btn rose" data-act="rejoindre">Rejoindre le défi</button></div>` : '') : '';

  $('#app').innerHTML = `
    <section class="hero small">
      <div class="badges center-badges"><span class="badge">${tp.emoji} ${tp.label}</span>${d.solo ? '<span class="badge contour">Solo</span>' : `<span class="badge contour">${v.emoji} ${v.label}</span>`}</div>
      <h1 class="defi-title">${esc(d.nom)}</h1>
      <span class="kicker">${fmtDate(d.date_debut)} → ${fmtDate(d.date_fin)}</span>
    </section>

    ${joinHtml}
    ${needsObjectif ? `<div class="card invit center"><p>Bienvenue ! Écris ton objectif perso pour ce défi.</p><a class="btn rose" href="#/objectif/${encodeURIComponent(d.id)}">Définir mon objectif</a></div>` : ''}

    <div class="card">
      <div class="countdown">
        <div><b>${ti.status === 'à venir' ? 0 : ti.elapsed}</b><small>jours écoulés</small></div>
        <div><b>${ti.status === 'à venir' ? ti.startsIn : ti.remaining}</b><small>${ti.status === 'à venir' ? 'avant le début' : 'jours restants'}</small></div>
        <div><b>${ti.total}</b><small>jours au total</small></div>
      </div>
      <div class="bar"><i style="width:${ti.pct * 100}%"></i></div>
      <p class="muted center">${modeEcarts(d) ? 'On signale seulement les écarts' : 'Saisie ' + ({ semaine: 'chaque semaine', mois: 'chaque mois' }[d.frequence_saisie] || 'chaque jour')} · défi ${ti.status}</p>
    </div>

    <div class="card">
      <h3>À la clé</h3>
      <div class="stakes">
        <div class="stake reward"><span class="kicker">Si objectif atteint</span>${esc(d.recompense || 'À définir ensemble')}</div>
        <div class="stake penalty"><span class="kicker">Si objectif raté</span>${esc(d.sanction_finale || 'À définir ensemble')}</div>
      </div>
      ${fini ? `<h3 class="mt">Bilan final</h3><ul>${membres.map((m) => {
        const s = stats(d, m, suivi, ecarts);
        return `<li><b>${esc(m.pseudo)}</b> : ${s.atteint ? `🎉 ${esc(d.recompense || 'récompense')}` : `😬 ${esc(d.sanction_finale || 'sanction')}`}</li>`;
      }).join('')}</ul>` : ''}
    </div>

    ${membres.length ? `<div class="card">
      <h3>Calendrier</h3>
      ${membres.length > 1 ? `<div class="chips cal-who">${membres.map((m) => `<button type="button" class="chip ${m.user_id === (amMember ? ME.id : membres[0].user_id) ? 'moi' : ''}" data-cal="${esc(m.user_id)}">${esc(m.pseudo)}</button>`).join('')}</div>` : ''}
      <div class="cal" id="defi-cal"></div>
    </div>` : ''}

    ${playerCards || '<div class="card empty muted">Personne dans ce défi pour l\'instant.</div>'}

    <div class="card">
      <h3>Écarts & sanctions</h3>
      <p class="muted">${d.solo ? "Note tes écarts et fixe-toi une sanction : personne d'autre ne les verra." : 'Chaque sanction doit être validée par tous les membres du défi.'}</p>
      ${ecartsHtml}
    </div>

    ${soloHtml}
    ${inviteHtml}

    <div class="actions" style="justify-content:center;margin-bottom:20px">
      <a class="btn ghost" href="#/defis">← Tous les défis</a>
      ${amMember && !d.solo ? `<a class="btn rose" href="#/chat/d/${encodeURIComponent(d.id)}">💬 Discuter</a>` : ''}
      ${canEdit ? `<a class="btn ghost" href="#/modifier/${encodeURIComponent(d.id)}">Modifier le défi</a>` : ''}
      ${amMember && !isCreator ? `<button class="btn danger" data-act="quitter">Quitter le défi</button>` : ''}
    </div>`;

  const app = $('#app');
  const calEl = $('#defi-cal');
  if (calEl) {
    mountDefiCalendar(calEl, B, amMember ? ME.id : membres[0].user_id);
    document.querySelectorAll('[data-cal]').forEach((c) => {
      c.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('[data-cal]').forEach((x) => x.classList.toggle('moi', x === c));
        mountDefiCalendar(calEl, B, c.dataset.cal);
      };
    });
  }
  const inv = $('#invite-form');
  if (inv) inv.onsubmit = (e) => { e.preventDefault(); act(() => api.invite(d.id, inv.pseudo.value.trim()), true); };

  app.onclick = async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const { act: a, id: bid, u } = b.dataset;
    const me = ME.id;
    switch (a) {
      case 'saisie': {
        const val = num(app.querySelector('[data-in]').value);
        if (val == null) return toast('Entre une valeur', true);
        const date = app.querySelector('[data-date]')?.value || today();
        const ok = await act(() => api.addSuivi(d.id, date, val, d.type === 'poids' || d.type === 'tabac'), 'Enregistré ✓');
        const cible = num(myM?.valeur_cible) ?? 0;
        if (ok && d.type === 'tabac' && val > cible) flanche(d, me, `${val} cigarette(s) le ${fmtDate(date)}`, ME.pseudo, membres.length);
        return;
      }
      case 'plus1': return act(() => api.addSuivi(d.id, app.querySelector('[data-date]')?.value || today(), 1, false), 'Bravo ✓');
      case 'zero': return act(() => api.addSuivi(d.id, today(), 0, true), 'Journée clean ✓');
      case 'flanche': return flanche(d, u, '', pseudos[u], membres.length);
      case 'propose': {
        const val = app.querySelector(`[data-sanction="${CSS.escape(bid)}"]`).value.trim();
        if (!val) return toast('Écris une sanction', true);
        return act(() => api.updateEcart(bid, { sanction: val, valide_par: [me], statut: membres.length <= 1 ? 'décidée' : 'à décider' }), 'Sanction proposée');
      }
      case 'valide': {
        const e = ecarts.find((x) => x.id === bid);
        const vals = [...new Set([...(e.valide_par || []), me])];
        const all = membres.every((m) => vals.includes(m.user_id));
        return act(() => api.updateEcart(bid, { valide_par: vals, statut: all ? 'décidée' : 'à décider' }), all ? 'Sanction décidée !' : 'Vote enregistré');
      }
      case 'faite': return act(() => api.updateEcart(bid, { statut: 'faite' }), 'Sanction faite ✓');
      case 'suppr': if (await confirmDlg('Supprimer cet écart ?', 'Il disparaîtra pour tout le monde.', 'Supprimer')) act(() => api.deleteEcart(bid), 'Écart supprimé'); return;
      case 'ouvrir':
        if (await confirmDlg('Passer en défi entre potes ?', 'Tu pourras inviter tes amis. Ton objectif et ton historique sont gardés.', "C'est parti")) {
          act(() => api.saveDefi({ ...d, solo: false }), 'Tu peux maintenant inviter tes potes');
        }
        return;
      case 'inviter-ami': return act(() => api.invite(d.id, b.dataset.p), true);
      case 'annuler-inv': return act(() => api.cancelInvitation(bid), 'Invitation annulée');
      case 'rejoindre': return act(() => api.join(d.id), 'Tu as rejoint le défi !');
      case 'accepter': return act(() => api.respond(bid, true), 'Bienvenue dans le défi !');
      case 'refuser': return act(() => api.respond(bid, false), 'Invitation refusée').then(() => go('#/'));
      case 'quitter':
        if (await confirmDlg('Quitter le défi ?', 'Tes saisies restent mais tu ne feras plus partie du défi.', 'Quitter')) {
          try { await api.leave(d.id); toast('Tu as quitté le défi'); go('#/'); } catch (e) { toast(e.message, true); }
        }
        return;
      case 'retirer':
        if (await confirmDlg(`Retirer ${pseudos[u]} ?`, 'Cette personne ne fera plus partie du défi.', 'Retirer')) act(() => api.removeMember(d.id, u), 'Membre retiré');
        return;
    }
  };
}

function inputFor(d, m) {
  if (modeEcarts(d)) return `<span class="muted no-saisie">${ico('check', 'sm')}Rien à noter : tu signales seulement si tu craques.</span>`;
  if (d.type === 'poids') return `<input type="number" step="0.1" placeholder="${esc(m.unite || 'kg')}" data-in>
      <input type="date" value="${today()}" data-date>
      <button class="btn small" data-act="saisie">Enregistrer la pesée</button>`;
  if (d.type === 'sport') return `<input type="date" value="${today()}" data-date>
      <button class="btn vert small" data-act="plus1">+1 séance ✓</button>`;
  if (d.type === 'tabac') return `<button class="btn vert small" data-act="zero">Journée clean ✓</button>
      <input type="number" min="0" placeholder="nb cigarettes" data-in>
      <button class="btn small" data-act="saisie">Enregistrer</button>`;
  return `<input type="date" value="${today()}" data-date>
      <button class="btn vert small" data-act="plus1">C'est fait ✓</button>`;
}

async function flanche(d, joueurId, desc = '', pseudo = ME.pseudo, nbMembres = 2) {
  const self = joueurId === ME.id;
  const f = await dialog(`
    <h3>${self ? "J'ai flanché…" : `${esc(pseudo)} a flanché ?`}</h3>
    <p class="muted">${self ? "Pas grave, l'honnêteté c'est la base 🌸" : 'Les autres membres verront ton signalement.'}</p>
    <label class="field">Quand ?<input type="date" name="date" value="${today()}"></label>
    <label class="field">Qu'est-ce qui s'est passé ?<textarea name="desc">${esc(desc)}</textarea></label>
    <label class="field">Sanction proposée (optionnel)<input name="sanction" placeholder="ex : payer les croissants"></label>
    <div class="actions"><button class="btn rose" value="ok">Déclarer l'écart</button><button class="btn ghost" value="cancel" formnovalidate>Annuler</button></div>`);
  if (!f) return;
  const sanction = (f.get('sanction') || '').trim();
  act(() => api.addEcart({
    defi_id: d.id, joueur: joueurId, date: f.get('date') || today(),
    description: (f.get('desc') || '').trim(), sanction, valide_par: sanction ? [ME.id] : [], statut: sanction && nbMembres <= 1 ? 'décidée' : 'à décider',
  }), 'Écart déclaré');
}


/* ---------- Icônes (trait fin, couleurs du site) ---------- */
const ICONS = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  calendarPlus: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  maybe: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.4v.5M12 17h.01"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  poll: '<path d="M5 20V11M12 20V5M19 20v-6"/><path d="M3 20h18"/>',
  resto: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1.5-3 4-3 7h3"/>',
  verre: '<path d="M7 3h10l-1 7a4 4 0 0 1-8 0zM12 14v7M8.5 21h7M7.5 7h9"/>',
  sport: '<path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11"/>',
  cine: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 6l2 4M12 6l2 4M17 6l2 4"/>',
  balade: '<path d="M12 21v-6M12 15c-4 0-6-2.5-6-5.5S8.5 3 12 3s6 3.5 6 6.5-2 5.5-6 5.5z"/><path d="M12 11l2.5-2M12 13l-2.5-2"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>',
  gateau: '<path d="M4 21h16M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7M5 16.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0M12 12V8.5M12 6c.9-.8.9-1.8 0-3-.9 1.2-.9 2.2 0 3z"/>',
  ampoule: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  balance: '<path d="M12 4v16M7 20h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  nosmoke: '<rect x="3" y="12" width="14" height="4" rx="1"/><path d="M19 12v4M21.5 12v4M17 8c0-2-2-2-2-4M3 3l18 18"/>',
  eau: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9 14.5a3 3 0 0 0 3 3"/>',
  feuille: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19c3-4 6-7 10-9"/>',
  pas: '<path d="M8 3c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM16 9c2 0 3 2 3 5s-1 5-3 5-3-2-3-5 1-5 3-5zM6 16h4v3a2 2 0 0 1-4 0zM14 22h4"/>',
  course: '<circle cx="15" cy="4.5" r="2"/><path d="M6 21l3.5-6 3 2.5V21M8 11l3-3.5 4 2 2 3h3M11 7.5l-2.5 4.5"/>',
  livre: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7"/>',
  lune: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  tel: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  euro: '<path d="M18 6.5A7 7 0 1 0 18 17.5M4 10h10M4 14h10"/>',
  amis: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.8"/><path d="M15.5 14.3A5 5 0 0 1 21.5 19.5"/>',
  solo: '<circle cx="12" cy="7.5" r="3.8"/><path d="M5 21a7 7 0 0 1 14 0"/>',
  autre: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
};
const ico = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/* ---------- Chat en direct ---------- */
const LAST_READ = 'pt-lu-';
const lastRead = (k) => { try { return localStorage.getItem(LAST_READ + k) || ''; } catch { return ''; } };
const markRead = (k) => { try { localStorage.setItem(LAST_READ + k, new Date().toISOString()); } catch {} };
const hhmm = (s) => new Date(s).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
function dayLabel(s) {
  const d = iso(new Date(s)), t = today();
  if (d === t) return "Aujourd'hui";
  if (daysBetween(d, t) === 1) return 'Hier';
  return new Date(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
const shortWhen = (s) => (iso(new Date(s)) === today() ? hhmm(s) : dayLabel(s));
const ACTIVITES = {
  resto: { icon: 'resto', label: 'Resto' }, verre: { icon: 'verre', label: 'Un verre' }, sport: { icon: 'sport', label: 'Sport' },
  cine: { icon: 'cine', label: 'Ciné' }, balade: { icon: 'balade', label: 'Balade' }, autre: { icon: 'autre', label: 'Autre' },
};
const DISPO = { oui: { icon: 'check', label: 'Dispo' }, 'peut-etre': { icon: 'maybe', label: 'Peut-être' }, non: { icon: 'cross', label: 'Pas dispo' } };

function roomTitle(r) {
  if (r.kind === 'd') return `${TYPES[r.type]?.emoji || '🏆'} ${r.nom}`;
  if (r.nom) return r.nom;
  return r.membres.filter((m) => m.user_id !== ME.id).map((m) => m.pseudo).join(', ') || 'Conversation';
}
function roomIcon(r) {
  if (r.kind === 'd') return TYPES[r.type]?.emoji || '🏆';
  const autres = r.membres.filter((m) => m.user_id !== ME.id);
  return r.nom || autres.length > 1 ? '👥' : `<span class="avatar">${esc((autres[0]?.pseudo || '?').slice(0, 1).toUpperCase())}</span>`;
}
function previewOf(m) {
  if (m.type === 'proposition') return `Sortie · ${m.data?.titre || ACTIVITES[m.data?.activite]?.label || ''}`;
  if (m.type === 'sondage') return `Sondage · ${m.data?.question || ''}`;
  return m.contenu;
}

async function renderChatList() {
  const rooms = await api.listConversations();
  rooms.sort((a, b) => String(b.messages[0]?.created_at || '').localeCompare(a.messages[0]?.created_at || ''));
  const item = (r) => {
    const last = r.messages[0];
    const unread = r.messages.filter((m) => m.user_id !== ME.id && m.created_at > lastRead(r.kind + r.id)).length;
    return `<a class="conv" href="#/chat/${r.kind}/${encodeURIComponent(r.id)}">
      <span class="conv-ico">${r.kind === 'd' ? roomIcon(r) : roomIcon(r)}</span>
      <span class="conv-main"><b>${esc(r.kind === 'd' ? r.nom : roomTitle(r))}</b>
        <span class="muted">${last ? `${last.user_id === ME.id ? 'Toi' : esc(last.pseudo)} : ${esc(previewOf(last).slice(0, 60))}` : 'Aucun message, lance la discussion !'}</span></span>
      <span class="conv-side">${last ? `<small>${shortWhen(last.created_at)}</small>` : ''}${unread ? `<i class="unread">${unread}</i>` : ''}</span>
    </a>`;
  };
  const convs = rooms.filter((r) => r.kind === 'c'), defs = rooms.filter((r) => r.kind === 'd');
  $('#app').innerHTML = `<section class="hero small"><h1>Chat</h1><span class="kicker">Tes potes, en direct</span></section>
    <div class="center" style="margin-bottom:16px"><button class="btn rose" id="new-conv">+ Nouvelle conversation</button></div>
    <h2 class="section-title">Conversations</h2>
    ${convs.length ? `<div class="card conv-list">${convs.map(item).join('')}</div>` : `<div class="card empty muted">Écris à un ami ou crée un groupe 👆</div>`}
    <h2 class="section-title">Salons des défis</h2>
    ${defs.length ? `<div class="card conv-list">${defs.map(item).join('')}</div>` : `<div class="card empty muted">Rejoins un défi pour avoir son salon.</div>`}`;
  $('#new-conv').onclick = newConversation;
}

async function newConversation(preselect = null) {
  const { amis } = await api.listAmis();
  if (!amis.length) {
    if (await confirmDlg("Pas encore d'amis", "Ajoute des amis pour pouvoir discuter avec eux.", 'Ajouter des amis')) go('#/amis');
    return;
  }
  const f = await dialog(`<h3>Nouvelle conversation</h3>
    <p class="muted">Un ami = conversation privée. Plusieurs = un groupe.</p>
    <div class="chips pick">${amis.map((a) => `<label class="chip pick-chip"><input type="checkbox" name="u" value="${esc(a.user_id)}" ${a.user_id === preselect ? 'checked' : ''}><span>${esc(a.pseudo)}</span></label>`).join('')}</div>
    <label class="field">Nom du groupe (optionnel)<input name="nom" maxlength="40" placeholder="ex : Les sportifs du dimanche"></label>
    <div class="actions"><button class="btn rose" value="ok">C'est parti</button><button class="btn ghost" value="cancel" formnovalidate>Annuler</button></div>`);
  if (!f) return;
  const ids = f.getAll('u');
  if (!ids.length) return toast('Choisis au moins un ami', true);
  try { const cid = await api.creerConversation(ids, String(f.get('nom') || '')); go(`#/chat/c/${encodeURIComponent(cid)}`); }
  catch (e) { toast(e.message, true); }
}

function msgHtml(m, room) {
  const mine = m.user_id === ME.id;
  const pseudoOf = (u) => room.membres.find((x) => x.user_id === u)?.pseudo || '?';
  const rep = (m.reponses || []);
  const myRep = rep.find((r) => r.user_id === ME.id)?.valeur;
  if (m.type === 'proposition') {
    const d = m.data || {};
    const act = ACTIVITES[d.activite] || ACTIVITES.autre;
    const quand = d.date ? `${parseISO(d.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}${d.heure ? ' à ' + d.heure.replace(':', 'h') : ''}` : '';
    const st = d.statut || 'ouvert';
    return `<div class="card-msg prop ${st}">
      <div class="cm-top">${st === 'booké' ? `<span class="booked">${ico('check')} C'est booké !</span>` : st === 'annulé' ? '<span class="cancelled">Annulé</span>' : '<span class="cm-kicker">Qui est dispo ?</span>'}</div>
      <div class="cm-head"><span class="ico-bubble">${ico(act.icon)}</span>
        <div><div class="cm-act">${act.label}</div><div class="cm-title"><b>${esc(d.titre || act.label)}</b></div></div></div>
      ${quand ? `<div class="cm-line">${ico('calendar', 'sm')} ${esc(quand)}</div>` : ''}
      ${d.lieu ? `<div class="cm-line">${ico('pin', 'sm')} ${esc(d.lieu)}</div>` : ''}
      <div class="dispo-btns">${Object.entries(DISPO).map(([k, v]) => {
        const who = rep.filter((r) => r.valeur === k);
        return `<button type="button" class="dispo ${myRep === k ? 'on' : ''}" data-rep="${esc(m.id)}" data-v="${k}" ${st === 'annulé' ? 'disabled' : ''}>
          <span class="d-ico d-${k}">${ico(v.icon)}</span><span class="d-lbl">${v.label}</span><b>${who.length}</b></button>`;
      }).join('')}</div>
      ${rep.length ? `<div class="cm-who">${Object.entries(DISPO).map(([k, v]) => {
        const who = rep.filter((r) => r.valeur === k).map((r) => esc(pseudoOf(r.user_id)));
        return who.length ? `<span><span class="d-ico mini d-${k}">${ico(v.icon)}</span>${who.join(', ')}</span>` : '';
      }).join('')}</div>` : ''}
      ${mine && st === 'ouvert' ? `<div class="actions"><button class="btn vert small" data-book="${esc(m.id)}">Booker ✓</button><button class="btn danger small" data-cancel="${esc(m.id)}">Annuler</button></div>` : ''}
      ${mine && st !== 'ouvert' ? `<div class="actions"><button class="btn ghost small" data-reopen="${esc(m.id)}">Rouvrir</button></div>` : ''}
    </div>`;
  }
  if (m.type === 'sondage') {
    const d = m.data || {};
    const opts = d.options || [];
    const total = rep.length;
    return `<div class="card-msg poll">
      <div class="cm-head"><span class="ico-bubble rose">${ico('poll')}</span>
        <div><div class="cm-act">Sondage${d.ferme ? ' · clos' : ''}</div><div class="cm-title"><b>${esc(d.question || '')}</b></div></div></div>
      ${opts.map((o, i) => {
        const who = rep.filter((r) => r.valeur === String(i));
        const pct = total ? Math.round((who.length / total) * 100) : 0;
        return `<button type="button" class="poll-opt ${myRep === String(i) ? 'on' : ''}" data-rep="${esc(m.id)}" data-v="${i}" ${d.ferme ? 'disabled' : ''}>
          <i style="width:${pct}%"></i><span class="po-label">${myRep === String(i) ? ico('check', 'sm') : ''}${esc(o)}</span><span class="po-pct">${pct} %</span>
          ${who.length ? `<small>${who.map((r) => esc(pseudoOf(r.user_id))).join(', ')}</small>` : ''}</button>`;
      }).join('')}
      <div class="cm-line muted">${total} vote${total > 1 ? 's' : ''}${myRep != null ? ' · touche ton choix pour l\'annuler' : ''}</div>
      ${mine ? `<div class="actions"><button class="btn ghost small" data-close="${esc(m.id)}">${d.ferme ? 'Rouvrir' : 'Clore le sondage'}</button></div>` : ''}
    </div>`;
  }
  return `<div class="bubble">${esc(m.contenu)}<small>${hhmm(m.created_at)}</small></div>`;
}

async function renderChat(kind, id) {
  const room = await api.getRoom(kind, id);
  const amMember = room.membres.some((m) => m.user_id === ME.id);
  const key = kind + id;
  document.body.classList.add('chat-mode');
  window.scrollTo(0, 0);
  const sizeChat = () => {
    const r = document.documentElement.style;
    r.setProperty('--chrome-top', document.querySelector('.topbar').getBoundingClientRect().bottom + 'px');
    r.setProperty('--chrome-bottom', ($('#tabbar').offsetHeight || 0) + 'px');
  };
  sizeChat();
  window.addEventListener('resize', sizeChat);

  $('#app').innerHTML = `<div class="chat-wrap">
    <div class="chat-head">
      <a href="#/chat" class="chat-back" aria-label="Retour">‹</a>
      <a ${kind === 'd' ? `href="#/defi/${encodeURIComponent(id)}"` : ''} class="chat-title"><b>${esc(roomTitle(room))}</b>
        <small>${room.membres.map((m) => esc(m.pseudo)).join(', ')}</small></a>
      <span class="live"><i></i>en direct</span>
    </div>
    <div class="chat-log" id="log"></div>
    ${amMember ? `<div class="chat-menu" id="chat-menu" hidden>
        <button type="button" data-new="proposition"><span class="ico-bubble">${ico('calendarPlus')}</span><b>Proposer un moment</b><small>Resto, activité… qui est dispo ?</small></button>
        <button type="button" data-new="sondage"><span class="ico-bubble rose">${ico('poll')}</span><b>Créer un sondage</b><small>Une question, plusieurs choix</small></button>
      </div>
      <form class="chat-input" id="chat-form">
        <button type="button" class="btn ghost plus-btn" id="plus" aria-label="Plus d'options"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
        <textarea name="msg" rows="1" maxlength="1000" placeholder="Écris à tes potes…"></textarea>
        <button class="btn rose send" aria-label="Envoyer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg></button>
      </form>` : `<p class="muted center">Seuls les membres peuvent écrire ici.</p>`}
  </div>`;

  const log = $('#log');
  const draw = (msgs, forceBottom) => {
    const nearBottom = forceBottom || log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    const prevTop = log.scrollTop;
    let lastDay = '', lastUser = '', html = '';
    for (const m of msgs) {
      const day = iso(new Date(m.created_at));
      if (day !== lastDay) { html += `<div class="day-sep"><span>${dayLabel(m.created_at)}</span></div>`; lastDay = day; lastUser = ''; }
      const mine = m.user_id === ME.id;
      const special = m.type !== 'texte';
      const showName = !mine && (lastUser !== m.user_id || special);
      html += `<div class="msg ${mine ? 'mine' : ''} ${lastUser === m.user_id && !special ? 'cont' : ''} ${special ? 'wide' : ''}">
        ${showName ? `<span class="who">${esc(m.pseudo)}</span>` : ''}${msgHtml(m, room)}</div>`;
      lastUser = special ? '' : m.user_id;
    }
    log.innerHTML = html || '<p class="muted center chat-empty">Pas encore de message. Dis bonjour 👋</p>';
    log.scrollTop = nearBottom ? log.scrollHeight : prevTop;
  };
  const reload = async (forceBottom = false) => {
    try { draw(await api.getMessages(kind, id), forceBottom); markRead(key); api.lireNotifsLien(`#/chat/${kind}/${id}`).then(majCloche).catch(() => {}); } catch (e) { toast(e.message, true); }
  };
  await reload(true);

  let pending = null;
  const stop = api.subscribe(kind, id, () => { clearTimeout(pending); pending = setTimeout(() => reload(), 120); });
  cleanup = () => { stop && stop(); clearTimeout(pending); window.removeEventListener('resize', sizeChat); };

  // Réponses aux propositions / sondages, booking
  log.onclick = async (e) => {
    const r = e.target.closest('[data-rep]'), bk = e.target.closest('[data-book]'), cc = e.target.closest('[data-cancel]'),
      ro = e.target.closest('[data-reopen]'), cl = e.target.closest('[data-close]');
    const msgs = await api.getMessages(kind, id);
    const find = (mid) => msgs.find((x) => x.id === mid);
    try {
      if (r && !r.disabled) {
        if (!amMember) return toast('Seuls les membres peuvent répondre', true);
        const m = find(r.dataset.rep);
        const mine = m.reponses.find((x) => x.user_id === ME.id)?.valeur;
        await api.repondre(m.id, mine === r.dataset.v ? null : r.dataset.v);
      }
      if (bk) { const m = find(bk.dataset.book); await api.updateMessageData(m.id, { ...m.data, statut: 'booké' }); toast("C'est booké ! 🎉"); }
      if (cc) { const m = find(cc.dataset.cancel); await api.updateMessageData(m.id, { ...m.data, statut: 'annulé' }); }
      if (ro) { const m = find(ro.dataset.reopen); await api.updateMessageData(m.id, { ...m.data, statut: 'ouvert' }); }
      if (cl) { const m = find(cl.dataset.close); await api.updateMessageData(m.id, { ...m.data, ferme: !m.data.ferme }); }
      if (r || bk || cc || ro || cl) await reload();
    } catch (err) { toast(err.message, true); }
  };

  const f = $('#chat-form');
  if (!f) return;
  const ta = f.msg;
  const menu = $('#chat-menu');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; };
  ta.oninput = grow;
  ta.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } };
  $('#plus').onclick = () => { menu.hidden = !menu.hidden; $('#plus').classList.toggle('open', !menu.hidden); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const txt = ta.value.trim();
    if (!txt) return;
    ta.value = ''; grow();
    try { await api.sendMessage(kind, id, txt); await reload(true); } catch (err) { ta.value = txt; toast(err.message, true); }
    ta.focus();
  };
  menu.onclick = async (e) => {
    const b = e.target.closest('[data-new]');
    if (!b) return;
    menu.hidden = true; $('#plus').classList.remove('open');
    const ok = b.dataset.new === 'proposition' ? await proposerMoment(kind, id) : await creerSondage(kind, id);
    if (ok) await reload(true);
  };
}

async function proposerMoment(kind, id) {
  const demain = iso(new Date(Date.now() + 86400000));
  const f = await dialog(`<h3>Proposer un moment</h3>
    <div class="chips pick act-pick">${Object.entries(ACTIVITES).map(([k, a], i) => `<label class="chip pick-chip"><input type="radio" name="activite" value="${k}" ${i === 0 ? 'checked' : ''}><span>${ico(a.icon, 'sm')} ${a.label}</span></label>`).join('')}</div>
    <label class="field">Quoi ?<input name="titre" maxlength="60" placeholder="ex : Pizza chez Luigi" required></label>
    <label class="field">Où ? (optionnel)<input name="lieu" maxlength="80" placeholder="ex : 12 rue de la Paix"></label>
    <div class="row2"><label class="field">Jour<input type="date" name="date" value="${demain}" min="${today()}" required></label>
      <label class="field">Heure<input type="time" name="heure" value="20:00" required></label></div>
    <div class="actions"><button class="btn rose" value="ok">Envoyer</button><button class="btn ghost" value="cancel" formnovalidate>Annuler</button></div>`);
  if (!f) return false;
  const data = { activite: f.get('activite') || 'autre', titre: String(f.get('titre') || '').trim(), lieu: String(f.get('lieu') || '').trim(),
    date: f.get('date'), heure: f.get('heure'), statut: 'ouvert' };
  if (!data.titre || !data.date) { toast('Indique quoi et quand', true); return false; }
  try { await api.sendMessage(kind, id, '', 'proposition', data); await api.repondre((await api.getMessages(kind, id)).filter((m) => m.user_id === ME.id && m.type === 'proposition').pop().id, 'oui'); return true; }
  catch (e) { toast(e.message, true); return false; }
}

async function creerSondage(kind, id) {
  const f = await dialog(`<h3>Créer un sondage</h3>
    <label class="field">Question<input name="question" maxlength="120" placeholder="ex : On se voit quel soir ?" required></label>
    <div id="opts">${[1, 2, 3].map((n) => `<label class="field">Choix ${n}<input name="opt" maxlength="60" ${n <= 2 ? 'required' : ''}></label>`).join('')}</div>
    <button type="button" class="btn ghost small" id="add-opt">+ Ajouter un choix</button>
    <div class="actions mt"><button class="btn rose" value="ok">Envoyer</button><button class="btn ghost" value="cancel" formnovalidate>Annuler</button></div>`,
  () => {
    $('#add-opt').onclick = () => {
      const n = document.querySelectorAll('#opts input').length + 1;
      if (n > 8) return;
      $('#opts').insertAdjacentHTML('beforeend', `<label class="field">Choix ${n}<input name="opt" maxlength="60"></label>`);
    };
  });
  if (!f) return false;
  const question = String(f.get('question') || '').trim();
  const options = f.getAll('opt').map((x) => String(x).trim()).filter(Boolean);
  if (!question || options.length < 2) { toast('Il faut une question et au moins 2 choix', true); return false; }
  try { await api.sendMessage(kind, id, '', 'sondage', { question, options, ferme: false }); return true; }
  catch (e) { toast(e.message, true); return false; }
}

/* ---------- Calendrier ---------- */
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// Statut d'un jour pour un membre d'un défi : ok (objectif tenu / saisie faite), bad (écart), ou rien
function dayStatus(d, m, suivi, ecarts, day) {
  if (modeEcarts(d)) {
    const ec = ecarts.filter((x) => x.joueur === m.user_id && String(x.date).slice(0, 10) === day);
    if (ec.length) return { st: 'bad', txt: ec.map((x) => `Écart${x.description ? ' : ' + x.description : ''}`) };
    return day <= today() && day >= d.date_debut ? { st: 'ok', txt: ['Aucun écart, journée réussie'] } : { st: '', txt: [] };
  }
  const e = suivi.filter((x) => x.user_id === m.user_id && String(x.date).slice(0, 10) === day);
  const ec = ecarts.filter((x) => x.joueur === m.user_id && String(x.date).slice(0, 10) === day);
  const unite = m.unite || TYPES[d.type]?.unite || '';
  let st = '', txt = [];
  if (e.length) {
    const tot = e.reduce((a, x) => a + (num(x.valeur) ?? 1), 0);
    if (d.type === 'poids') { st = 'ok'; txt.push(`Pesée : ${e[e.length - 1].valeur} ${unite}`); }
    else if (d.type === 'sport') { st = tot > 0 ? 'ok' : ''; txt.push(`${tot} séance${tot > 1 ? 's' : ''}`); }
    else if (d.type === 'tabac') {
      const cible = num(m.valeur_cible) ?? 0;
      st = tot <= cible ? 'ok' : 'bad';
      txt.push(tot === 0 ? 'Journée clean' : `${tot} cigarette${tot > 1 ? 's' : ''}`);
    } else { st = 'ok'; txt.push('Fait ✓'); }
  }
  if (ec.length) { st = 'bad'; ec.forEach((x) => txt.push(`Écart${x.description ? ' : ' + x.description : ''}`)); }
  return { st, txt };
}

function mountCalendar(el, { start, end, dayFn, legend }) {
  const t = today();
  const ref = t < start ? start : t > end ? end : t;
  let y = parseISO(ref).getFullYear(), mo = parseISO(ref).getMonth();
  let picked = null;
  const draw = () => {
    const first = new Date(y, mo, 1);
    const lead = (first.getDay() + 6) % 7; // semaine qui commence le lundi
    const nb = new Date(y, mo + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="cal-blank"></span>';
    for (let n = 1; n <= nb; n++) {
      const day = `${y}-${pad(mo + 1)}-${pad(n)}`;
      const inP = day >= start && day <= end;
      const info = inP ? dayFn(day) : { cls: [], dots: [] };
      const cls = ['cal-day', ...(info.cls || [])];
      if (!inP) cls.push('out');
      if (day === t) cls.push('today');
      if (day > t) cls.push('future');
      if (day === picked) cls.push('picked');
      cells += `<button type="button" class="${cls.join(' ')}" data-day="${day}" ${inP ? '' : 'disabled'}>
        <span>${n}</span>${info.flag ? `<em>${info.flag}</em>` : ''}
        ${info.dots?.length ? `<i class="dots-mini">${info.dots.map((c) => `<b class="${c}"></b>`).join('')}</i>` : ''}</button>`;
    }
    const detail = picked ? dayFn(picked).detail : '';
    el.innerHTML = `<div class="cal-head">
        <button type="button" class="cal-nav" data-nav="-1" aria-label="Mois précédent">‹</button>
        <b>${MOIS[mo]} ${y}</b>
        <button type="button" class="cal-nav" data-nav="1" aria-label="Mois suivant">›</button></div>
      <div class="cal-grid">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((x) => `<span class="cal-wd">${x}</span>`).join('')}${cells}</div>
      <div class="cal-legend">${legend}</div>
      ${picked ? `<div class="cal-detail"><b>${fmtDate(picked)}</b>${detail || '<p class="muted">Rien ce jour-là.</p>'}</div>` : ''}`;
  };
  el.onclick = (e) => {
    e.stopPropagation();
    const nav = e.target.closest('[data-nav]');
    if (nav) { mo += Number(nav.dataset.nav); if (mo < 0) { mo = 11; y--; } if (mo > 11) { mo = 0; y++; } draw(); return; }
    const c = e.target.closest('[data-day]');
    if (c && !c.disabled) { picked = picked === c.dataset.day ? null : c.dataset.day; draw(); }
  };
  draw();
}

const LEGEND = `<span><b class="sw ok"></b>objectif tenu</span><span><b class="sw bad"></b>écart</span><span><b class="sw today"></b>aujourd'hui</span><span>🏁 fin</span>`;

// Calendrier d'un défi, pour un membre donné
function mountDefiCalendar(el, B, userId) {
  const { defi: d, membres, suivi, ecarts } = B;
  const m = membres.find((x) => x.user_id === userId) || membres[0];
  if (!m) return;
  mountCalendar(el, {
    start: d.date_debut, end: d.date_fin, legend: LEGEND,
    dayFn: (day) => {
      const { st, txt } = dayStatus(d, m, suivi, ecarts, day);
      return {
        cls: st ? [st] : [], flag: day === d.date_fin ? '🏁' : day === d.date_debut ? '🚩' : '',
        detail: txt.length ? `<ul>${txt.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '',
      };
    },
  });
}

// Calendrier de l'accueil : tous mes défis, un point par défi
function mountDashCalendar(el, bundles) {
  if (!bundles.length) return;
  const start = bundles.map((B) => B.defi.date_debut).sort()[0];
  const end = bundles.map((B) => B.defi.date_fin).sort().slice(-1)[0];
  mountCalendar(el, {
    start, end, legend: LEGEND,
    dayFn: (day) => {
      const dots = [], lines = [];
      let flag = '';
      for (const B of bundles) {
        const d = B.defi;
        if (day < d.date_debut || day > d.date_fin) continue;
        if (day === d.date_fin) flag = '🏁';
        const m = B.membres.find((x) => x.user_id === ME.id);
        const { st, txt } = dayStatus(d, m, B.suivi, B.ecarts, day);
        if (st) dots.push(st);
        if (txt.length || day === d.date_fin) lines.push(`<li>${TYPES[d.type]?.emoji} <b>${esc(d.nom)}</b>${day === d.date_fin ? ' · dernier jour 🏁' : ''}${txt.length ? ' · ' + txt.map(esc).join(', ') : ''}</li>`);
      }
      const cls = dots.includes('bad') ? ['bad'] : dots.length ? ['ok'] : [];
      return { cls, dots: dots.length > 1 ? dots : [], flag, detail: lines.length ? `<ul>${lines.join('')}</ul>` : '' };
    },
  });
}


/* ---------- Amis ---------- */
async function renderAmis() {
  const A = await api.listAmis();
  $('#app').innerHTML = `<section class="hero small"><h1>Amis</h1><span class="kicker">Ta team pour tenir tes paris</span></section>

    <div class="card">
      <h3>Ajouter un ami</h3>
      <form class="actions" id="ami-form">
        <input name="pseudo" placeholder="Pseudo de ton pote" required autocomplete="off" style="flex:1;min-width:160px">
        <button class="btn rose small">Ajouter</button>
      </form>
      <p class="muted mt">Ton pseudo à partager : <b>${esc(ME.pseudo)}</b></p>
    </div>

    ${A.recues.length ? `<div class="card invit"><h3>Demandes reçues</h3>
      ${A.recues.map((r) => `<div class="inv-row"><span>👋 <b>${esc(r.pseudo)}</b> veut être ${acc(r.sexe, 'ton ami', 'ton amie', 'dans tes amis')}</span>
        <span class="actions"><button class="btn small" data-ami="${esc(r.id)}" data-ok="1">Accepter</button>
        <button class="btn ghost small" data-ami="${esc(r.id)}" data-ok="0">Refuser</button></span></div>`).join('')}
    </div>` : ''}

    <div class="card">
      <h3>Mes amis <span class="count">${A.amis.length}</span></h3>
      ${A.amis.length ? `<div class="friends">${A.amis.map((a) => `<div class="friend">
          <span class="avatar">${esc(a.pseudo.slice(0, 1).toUpperCase())}</span><b>${esc(a.pseudo)}</b>
          <button class="x-btn dm" data-dm="${esc(a.user_id)}" title="Écrire">💬</button><button class="x-btn" data-suppr="${esc(a.id)}" data-p="${esc(a.pseudo)}" title="Retirer">✕</button></div>`).join('')}</div>`
        : `<p class="muted">Pas encore d'amis. Ajoute-les avec leur pseudo 👆</p>`}
      ${A.envoyees.length ? `<p class="muted mt">En attente : ${A.envoyees.map((e) => `<span class="chip">${esc(e.pseudo)} <button class="x" data-suppr="${esc(e.id)}" data-p="${esc(e.pseudo)}" data-annul="1" title="Annuler">✕</button></span>`).join(' ')}</p>` : ''}
    </div>`;

  const f = $('#ami-form');
  f.onsubmit = (e) => { e.preventDefault(); act(() => api.demanderAmi(f.pseudo.value.trim()), true); };
  $('#app').onclick = async (e) => {
    const dm = e.target.closest('[data-dm]');
    if (dm) { try { const cid = await api.creerConversation([dm.dataset.dm]); go(`#/chat/c/${encodeURIComponent(cid)}`); } catch (err) { toast(err.message, true); } return; }
    const r = e.target.closest('[data-ami]'), x = e.target.closest('[data-suppr]');
    if (r) act(() => api.repondreAmi(r.dataset.ami, r.dataset.ok === '1'), r.dataset.ok === '1' ? 'Vous êtes maintenant amis 🎉' : 'Demande refusée');
    if (x) {
      if (x.dataset.annul || await confirmDlg(`Retirer ${x.dataset.p} ?`, 'Vous ne serez plus amis (les défis en commun ne changent pas).', 'Retirer')) {
        act(() => api.supprimerAmi(x.dataset.suppr), x.dataset.annul ? 'Demande annulée' : 'Ami retiré');
      }
    }
  };
}

/* ---------- Mon objectif ---------- */
async function renderObjectif(id) {
  const { defi: d, membres } = await api.getDefi(id);
  const m = membres.find((x) => x.user_id === ME.id);
  if (!m) throw new Error("Tu ne fais pas partie de ce défi");
  $('#app').innerHTML = `<section class="hero small"><h1>Mon objectif</h1><span class="kicker">${esc(d.nom)}</span></section>
    <form class="card narrow" id="obj">
      <p class="muted center">${TYPES[d.type]?.emoji || ''} ${TYPES[d.type]?.label || ''}</p>
      ${objectifFields(d.type, m, d.frequence_saisie)}
      <div class="actions"><button class="btn rose">Enregistrer</button><a class="btn ghost" href="#/defi/${encodeURIComponent(d.id)}">Annuler</a></div>
    </form>`;
  $('#obj').onsubmit = async (e) => {
    e.preventDefault();
    try { await api.updateMembership(d.id, readObjectif(e.target)); toast('Objectif enregistré'); go('#/defi/' + encodeURIComponent(d.id)); }
    catch (err) { toast(err.message, true); }
  };
}

// Champs de l'objectif, adaptés au type de défi, avec une aide « ? » sur chacun
const OBJ_CHAMPS = {
  poids: {
    phrase: "ex : perdre 4 kg avant l'été",
    depart: { label: 'Mon poids aujourd\'hui', ph: 'ex : 68', aide: "Ton poids au début du défi. Il sert de point de départ pour calculer tes progrès." },
    cible: { label: 'Poids visé', ph: 'ex : 64', aide: "Le poids que tu veux atteindre à la fin du défi. Ta barre de progression arrive à 100 % quand tu l'atteins." },
    unite: { label: 'Unité', aide: 'En général « kg ». Tu peux mettre « lb » si tu te pèses en livres.' },
  },
  sport: {
    phrase: 'ex : 3 séances par semaine',
    cible: { label: 'Séances par semaine', ph: 'ex : 3', aide: "Combien de fois tu veux faire du sport chaque semaine. Tu cocheras « +1 séance » à chaque fois que tu y vas." },
  },
  tabac: {
    phrase: 'ex : zéro cigarette',
    cible: { label: 'Cigarettes max par jour', ph: 'ex : 0', aide: "Mets 0 si tu arrêtes complètement. Si tu veux juste réduire, mets le nombre maximum autorisé par jour : au-dessus, c'est un écart." },
  },
  autre: {
    phrase: 'ex : méditer 20 fois ce mois-ci',
    cible: { label: 'Nombre de fois à faire', ph: 'ex : 20', aide: "Combien de fois tu dois réaliser ton défi sur toute sa durée. Tu cocheras « C'est fait » à chaque fois." },
    unite: { label: 'Unité', aide: 'Le mot affiché à côté du nombre : « fois », « livres », « km »… ' },
  },
};

function helpBtn(id) {
  return `<button type="button" class="help-btn" data-help="${id}" aria-label="Aide" aria-expanded="false">?</button>`;
}
function champ(name, conf, val, type = 'number') {
  const id = 'aide-' + name;
  return `<div class="field help-field">
      <div class="lbl-row"><label for="f-${name}">${conf.label}</label>${helpBtn(id)}</div>
      <input id="f-${name}" name="${name}" ${type === 'number' ? 'type="number" step="0.1" inputmode="decimal"' : ''} value="${esc(val ?? '')}" placeholder="${esc(conf.ph || '')}">
      <p class="help-text" id="${id}" hidden>${conf.aide}</p>
    </div>`;
}

function objectifFields(type, m = {}, mode = '') {
  const c = mode === 'ecarts' ? {
    phrase: 'ex : zéro sucre pendant 3 semaines',
    cible: { label: 'Écarts autorisés sur tout le défi', ph: 'ex : 0', aide: "Combien de fois tu as le droit de craquer avant que le défi soit raté. Mets 0 pour être strict, ou 2-3 pour te laisser un peu de marge." },
  } : (OBJ_CHAMPS[type] || OBJ_CHAMPS.autre);
  const nums = [c.depart && champ('valeur_depart', c.depart, m.valeur_depart), champ('valeur_cible', c.cible, m.valeur_cible)].filter(Boolean);
  return `<div class="field help-field">
      <div class="lbl-row"><label for="f-objectif">Mon objectif en une phrase</label>${helpBtn('aide-objectif')}</div>
      <input id="f-objectif" name="objectif" value="${esc(m.objectif || '')}" placeholder="${esc(c.phrase)}">
      <p class="help-text" id="aide-objectif" hidden>Ce que tu veux réussir, en quelques mots. Tes potes le verront sur ta carte dans le défi.</p>
    </div>
    <div class="${nums.length > 1 ? 'row2' : ''}">${nums.join('')}</div>
    ${c.unite ? champ('unite', c.unite, m.unite || TYPES[type]?.unite, 'text') : `<input type="hidden" name="unite" value="${esc(mode === 'ecarts' ? 'écarts' : TYPES[type]?.unite || '')}">`}`;
}
const readObjectif = (f) => ({
  objectif: f.objectif.value.trim(),
  valeur_depart: f.valeur_depart ? num(f.valeur_depart.value) : null,
  valeur_cible: num(f.valeur_cible.value),
  unite: f.unite.value.trim(),
});

// Ouvre / ferme l'aide d'un champ (un seul à la fois)
document.addEventListener('click', (e) => {
  const b = e.target.closest('.help-btn');
  if (!b) return;
  e.preventDefault();
  const t = document.getElementById(b.dataset.help);
  if (!t) return;
  const open = t.hidden;
  document.querySelectorAll('.help-text').forEach((x) => { x.hidden = true; });
  document.querySelectorAll('.help-btn').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-expanded', 'false'); });
  t.hidden = !open;
  b.classList.toggle('on', open);
  b.setAttribute('aria-expanded', String(open));
});


/* ---------- Idées de défis ---------- */
const IDEES_CATS = [
  { key: 'forme', label: 'Forme & santé' },
  { key: 'sport', label: 'Sport' },
  { key: 'zen', label: 'Bien-être' },
  { key: 'habitudes', label: 'Bonnes habitudes' },
];
const IDEES = [
  { key: 'moins-3kg', cat: 'forme', icon: 'balance', titre: 'Objectif -3 kg', desc: 'Pesée chaque semaine pendant 2 mois.', type: 'poids', jours: 56, freq: 'semaine', cible: null, unite: 'kg', objectif: 'Perdre 3 kg', recompense: 'Une nouvelle tenue', sanction: 'Payer le resto aux autres' },
  { key: 'zero-clope', cat: 'forme', icon: 'nosmoke', titre: 'Zéro cigarette', desc: "Un mois sans fumer, jour après jour.", type: 'tabac', jours: 30, freq: 'jour', cible: 0, unite: 'cigarettes / jour', objectif: 'Zéro cigarette pendant 1 mois', recompense: "S'offrir ce qu'on a économisé", sanction: 'Don de 30 € à une asso' },
  { key: 'moins-clope', cat: 'forme', icon: 'nosmoke', titre: 'Réduire la cigarette', desc: '5 cigarettes max par jour pendant 3 semaines.', type: 'tabac', jours: 21, freq: 'jour', cible: 5, unite: 'cigarettes / jour', objectif: 'Pas plus de 5 par jour', recompense: 'Un ciné', sanction: 'Faire la vaisselle une semaine' },
  { key: 'sans-alcool', cat: 'forme', icon: 'verre', titre: '1 mois sans alcool', desc: 'Tu signales seulement si tu bois un verre.', type: 'autre', jours: 30, freq: 'ecarts', cible: 0, unite: 'jours', objectif: '30 jours sans alcool', recompense: 'Un brunch de luxe', sanction: 'Payer la tournée de softs' },
  { key: 'eau', cat: 'forme', icon: 'eau', titre: "Boire 1,5 L d'eau", desc: 'Tous les jours pendant 3 semaines.', type: 'autre', jours: 21, freq: 'jour', cible: 21, unite: 'jours', objectif: "1,5 L d'eau par jour", recompense: 'Une jolie gourde', sanction: 'Porter les courses des autres' },
  { key: 'sucre', cat: 'forme', icon: 'feuille', titre: 'Zéro sucre ajouté', desc: '3 semaines sans bonbons ni sodas, 1 écart autorisé.', type: 'autre', jours: 21, freq: 'ecarts', cible: 1, unite: 'jours', objectif: '21 jours sans sucre ajouté', recompense: 'Un dessert de pâtissier', sanction: 'Cuisiner un repas healthy pour tout le monde' },
  { key: 'salle-3', cat: 'sport', icon: 'sport', titre: '3 séances par semaine', desc: 'Salle, course, vélo… 3 fois par semaine.', type: 'sport', jours: 30, freq: 'jour', cible: 3, unite: 'séances / sem.', objectif: '3 séances par semaine', recompense: 'Des nouvelles baskets', sanction: "Payer 1 mois d'abonnement aux autres" },
  { key: 'pas', cat: 'sport', icon: 'pas', titre: '10 000 pas par jour', desc: 'Coche chaque jour où tu atteins 10 000 pas.', type: 'autre', jours: 30, freq: 'jour', cible: 25, unite: 'jours', objectif: '10 000 pas au moins 25 jours sur 30', recompense: 'Une rando entre potes', sanction: 'Monter à pied partout pendant une semaine' },
  { key: 'pompes', cat: 'sport', icon: 'sport', titre: '50 pompes par jour', desc: 'Un mois de pompes, sans excuse.', type: 'autre', jours: 30, freq: 'jour', cible: 30, unite: 'jours', objectif: '50 pompes chaque jour', recompense: 'Un massage', sanction: '100 pompes devant tout le monde' },
  { key: 'course', cat: 'sport', icon: 'course', titre: 'Courir 2 fois par semaine', desc: 'Même 20 minutes, ça compte.', type: 'sport', jours: 42, freq: 'jour', cible: 2, unite: 'séances / sem.', objectif: '2 sorties running par semaine', recompense: 'S’inscrire à une course ensemble', sanction: 'Faire la course avec un déguisement' },
  { key: 'mediter', cat: 'zen', icon: 'feuille', titre: 'Méditer 10 minutes', desc: 'Un petit moment pour soi chaque jour.', type: 'autre', jours: 30, freq: 'jour', cible: 25, unite: 'fois', objectif: 'Méditer 10 min, 25 fois ce mois-ci', recompense: 'Un week-end détente', sanction: 'Se lever à 6 h un dimanche' },
  { key: 'lire', cat: 'zen', icon: 'livre', titre: 'Lire 10 pages par jour', desc: 'Moins de scroll, plus de livres.', type: 'autre', jours: 30, freq: 'jour', cible: 25, unite: 'jours', objectif: '10 pages par jour', recompense: 'Un livre offert par les autres', sanction: 'Résumer un livre à tout le monde' },
  { key: 'ecran', cat: 'zen', icon: 'lune', titre: 'Pas d’écran avant de dormir', desc: "1 h sans téléphone avant d'aller au lit.", type: 'autre', jours: 21, freq: 'jour', cible: 18, unite: 'soirs', objectif: '1 h sans écran avant de dormir', recompense: 'Un pyjama tout doux', sanction: 'Une journée sans réseaux sociaux' },
  { key: 'dodo', cat: 'zen', icon: 'lune', titre: 'Au lit avant minuit', desc: 'Retrouver un vrai rythme de sommeil.', type: 'autre', jours: 30, freq: 'jour', cible: 25, unite: 'soirs', objectif: 'Au lit avant minuit', recompense: 'Une grasse mat’ sans culpabilité', sanction: 'Préparer le petit-déj des autres' },
  { key: 'reseaux', cat: 'habitudes', icon: 'tel', titre: 'Moins de réseaux sociaux', desc: 'Moins de 1 h par jour, tu signales les dérapages.', type: 'autre', jours: 30, freq: 'ecarts', cible: 3, unite: 'jours', objectif: 'Moins de 1 h de réseaux par jour', recompense: 'Une sortie sans téléphone', sanction: 'Poster une photo gênante choisie par les autres' },
  { key: 'cuisine', cat: 'habitudes', icon: 'resto', titre: 'Cuisiner maison', desc: '4 repas faits maison par semaine.', type: 'sport', jours: 28, freq: 'jour', cible: 4, unite: 'repas / sem.', objectif: '4 repas maison par semaine', recompense: 'Un resto étoilé', sanction: 'Cuisiner pour toute la bande' },
  { key: 'epargne', cat: 'habitudes', icon: 'euro', titre: 'Pas d’achats inutiles', desc: 'Tu signales seulement les achats craquage.', type: 'autre', jours: 30, freq: 'ecarts', cible: 2, unite: 'jours', objectif: 'Zéro achat impulsif', recompense: 'Se faire plaisir avec les économies', sanction: 'Mettre 20 € dans la cagnotte commune' },
  { key: 'langue', cat: 'habitudes', icon: 'livre', titre: 'Apprendre une langue', desc: '15 minutes de pratique par jour.', type: 'autre', jours: 30, freq: 'jour', cible: 25, unite: 'jours', objectif: '15 min de langue par jour', recompense: 'Un voyage dans le pays de la langue (un jour !)', sanction: 'Parler cette langue tout un dîner' },
];

function renderIdees() {
  $('#app').innerHTML = `<section class="hero small"><h1>Idées</h1><span class="kicker">Des défis tout prêts, à ajuster</span></section>
    <div class="idee-filtres" role="tablist">
      <button type="button" class="chip on" data-cat="">Toutes</button>
      ${IDEES_CATS.map((c) => `<button type="button" class="chip" data-cat="${c.key}">${c.label}</button>`).join('')}
    </div>
    ${IDEES_CATS.map((c) => `<section class="idee-cat" data-c="${c.key}">
      <h2 class="section-title">${c.label}</h2>
      <div class="idee-grid">${IDEES.filter((i) => i.cat === c.key).map((i) => `<a class="card idee" href="#/nouveau/${i.key}">
        <span class="ico-bubble ${i.cat === 'zen' || i.cat === 'habitudes' ? 'rose' : ''}">${ico(i.icon)}</span>
        <span class="idee-body"><b>${esc(i.titre)}</b><small>${esc(i.desc)}</small>
          <span class="idee-meta">${i.freq === 'ecarts' ? 'Écarts seulement' : TYPES[i.type].label} · ${i.jours % 7 === 0 ? i.jours / 7 + ' semaines' : i.jours + ' jours'}</span></span>
        <i>›</i></a>`).join('')}</div>
    </section>`).join('')}`;
  $('#app').onclick = (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    document.querySelectorAll('.idee-filtres .chip').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.idee-cat').forEach((sec) => { sec.hidden = !!b.dataset.cat && sec.dataset.c !== b.dataset.cat; });
  };
}

/* ---------- Création / modification d'un défi ---------- */
async function renderForm(id, ideeKey) {
  const edit = !!id;
  const idee = !edit && IDEES.find((x) => x.key === ideeKey);
  const d = edit ? (await api.getDefi(id)).defi : idee ? {
    nom: idee.titre, type: idee.type, date_debut: today(), date_fin: iso(new Date(Date.now() + idee.jours * 86400000)),
    frequence_saisie: idee.freq, recompense: idee.recompense, sanction_finale: idee.sanction, visibilite: 'prive', solo: false,
  } : {
    nom: '', type: 'poids', date_debut: today(), date_fin: iso(new Date(Date.now() + 30 * 86400000)),
    frequence_saisie: 'semaine', recompense: '', sanction_finale: '', visibilite: 'prive', solo: false,
  };
  const objIdee = idee ? { objectif: idee.objectif, valeur_cible: idee.cible, unite: idee.unite } : {};
  const startSolo = edit ? !!d.solo : location.hash.includes('solo');
  if (edit && d.created_by !== ME.id && ME.role !== 'admin') throw new Error('Seul le créateur du défi peut le modifier');
  const amis = edit ? [] : (await api.listAmis()).amis;

  $('#app').innerHTML = `
    <section class="hero small"><h1>${edit ? 'Modifier' : 'Nouveau'}<span class="l2">défi</span></h1></section>
    <form class="card ${startSolo ? 'is-solo' : ''}" id="defi-form">
      ${edit ? '' : `<div class="mode-switch" role="radiogroup" aria-label="Avec qui ?">
        <label class="mode-opt"><input type="radio" name="mode" value="potes" ${startSolo ? '' : 'checked'}>
          <span>${ico('amis')}<b>Avec des potes</b><small>On se motive à plusieurs</small></span></label>
        <label class="mode-opt"><input type="radio" name="mode" value="solo" ${startSolo ? 'checked' : ''}>
          <span>${ico('solo')}<b>${acc(ME.sexe, 'Seul', 'Seule', 'En solo')}</b><small>Un défi rien que pour moi</small></span></label>
      </div>`}
      ${edit && d.solo ? '<p class="muted center">Défi solo</p>' : ''}
      ${edit ? '' : idee ? `<div class="idee-pick"><span class="ico-bubble sm">${ico(idee.icon)}</span><span>Idée choisie : <b>${esc(idee.titre)}</b><small>Tout est pré-rempli, ajuste ce que tu veux.</small></span><a href="#/idees" class="btn ghost small">Changer</a></div>`
        : `<a class="idee-link" href="#/idees">${ico('ampoule')}<span><b>Besoin d'une idée ?</b><small>Pioche un défi tout prêt</small></span><i>›</i></a>`}
      <label class="field">Nom du défi<input name="nom" required maxlength="80" value="${esc(d.nom)}" placeholder="ex : Objectif été"></label>
      <div class="row2">
        <label class="field">Type de défi<select name="type">
          ${Object.entries(TYPES).map(([k, t]) => `<option value="${k}" ${k === d.type ? 'selected' : ''}>${t.emoji} ${t.label}</option>`).join('')}
        </select></label>
        <label class="field">Début<input type="date" name="date_debut" required value="${esc(d.date_debut)}"></label>
        <label class="field">Fin<input type="date" name="date_fin" required value="${esc(d.date_fin)}"></label>
      </div>
      <div class="field help-field">
        <div class="lbl-row"><span class="lbl">Comment tu suis ton défi ?</span>${helpBtn('aide-suivi')}</div>
        <div class="suivi-pick">${Object.entries(SUIVIS).map(([k, v]) => `<label class="suivi-opt"><input type="radio" name="frequence_saisie" value="${k}" ${d.frequence_saisie === k ? 'checked' : ''}><span>${v.label}</span></label>`).join('')}</div>
        <p class="help-text" id="aide-suivi" hidden>${Object.values(SUIVIS).map((v) => `<b>${v.label}</b> : ${v.aide}`).join('<br>')}</p>
      </div>
      <label class="field">Récompense si objectifs atteints<input name="recompense" value="${esc(d.recompense)}" placeholder="ex : resto tous ensemble"></label>
      <label class="field">Sanction si objectif raté<input name="sanction_finale" value="${esc(d.sanction_finale)}" placeholder="ex : faire le ménage chez l'autre"></label>

      <div class="field only-potes">Visibilité</div>
      <div class="visi only-potes">
        ${Object.entries(VISI).map(([k, v]) => `<label class="visi-opt"><input type="radio" name="visibilite" value="${k}" ${d.visibilite === k ? 'checked' : ''}>
          <span><b>${v.emoji} ${v.label}</b><small>${v.aide}</small></span></label>`).join('')}
      </div>

      ${edit ? '' : `<h3 class="mt">Mon objectif</h3><div id="obj-fields">${objectifFields(d.type, objIdee, d.frequence_saisie)}</div>
        <div class="only-potes"><h3 class="mt">Inviter des potes</h3>
        ${amis.length ? `<div class="chips pick">${amis.map((a) => `<label class="chip pick-chip"><input type="checkbox" name="amis" value="${esc(a.pseudo)}"><span>${esc(a.pseudo)}</span></label>`).join('')}</div>`
          : `<p class="muted">Tu n'as pas encore d'amis dans l'app. <a href="#/amis"><b>Ajoute-les ici</b></a>.</p>`}
        <label class="field">Autres pseudos (séparés par des virgules)<input name="invites" placeholder="ex : Camille, Hugo"></label></div>`}

      <div class="actions mt">
        <button class="btn rose" type="submit">${edit ? 'Enregistrer' : 'Lancer le défi'}</button>
        <a class="btn ghost" href="${edit ? '#/defi/' + encodeURIComponent(id) : '#/defis'}">Annuler</a>
        ${edit ? `<button type="button" class="btn danger" id="del-defi">Supprimer le défi</button>` : ''}
      </div>
    </form>`;

  const form = $('#defi-form');
  const setMode = () => {
    const solo = form.mode ? form.mode.value === 'solo' : !!d.solo;
    form.classList.toggle('is-solo', solo);
    form.recompense.placeholder = solo ? "ex : m'offrir un massage" : 'ex : resto tous ensemble';
    form.sanction_finale.placeholder = solo ? 'ex : donner 20 € à une asso' : "ex : faire le ménage chez l'autre";
  };
  form.querySelectorAll('[name=mode]').forEach((r) => { r.onchange = setMode; });
  setMode();
  const refreshObj = () => {
    const box = $('#obj-fields');
    const mode = form.querySelector('[name=frequence_saisie]:checked')?.value;
    if (box) box.innerHTML = objectifFields(form.type.value, { objectif: form.objectif.value }, mode);
  };
  form.type.onchange = refreshObj;
  form.querySelectorAll('[name=frequence_saisie]').forEach((r) => { r.onchange = refreshObj; });
  if (edit) $('#del-defi').onclick = async () => {
    if (!(await confirmDlg('Supprimer ce défi ?', 'Toutes ses données seront perdues pour tout le monde.', 'Supprimer'))) return;
    try { await api.deleteDefi(id); toast('Défi supprimé'); go('#/'); } catch (e) { toast(e.message, true); }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    if (f.get('date_fin') < f.get('date_debut')) return toast('La date de fin doit être après la date de début', true);
    const defi = { id: edit ? id : undefined };
    for (const c of ['nom', 'type', 'date_debut', 'date_fin', 'frequence_saisie', 'recompense', 'sanction_finale', 'visibilite']) defi[c] = String(f.get(c) || '').trim();
    defi.solo = edit ? !!d.solo : f.get('mode') === 'solo';
    if (defi.solo) defi.visibilite = 'prive';
    try {
      const newId = await api.saveDefi(defi, edit ? null : readObjectif(form));
      if (!edit) {
        const names = defi.solo ? [] : [...new Set([...f.getAll('amis'), ...String(f.get('invites') || '').split(',')].map((x) => String(x).trim()).filter(Boolean))];
        const errs = [];
        for (const n of names) { try { await api.invite(newId, n); } catch (err) { errs.push(err.message); } }
        if (errs.length) toast(errs.join(' · '), true);
        else toast(defi.solo ? 'Défi solo lancé, à toi de jouer 💪' : names.length ? `Défi lancé, ${names.length} invitation${names.length > 1 ? 's' : ''} envoyée${names.length > 1 ? 's' : ''} !` : 'Défi lancé !');
      } else toast('Défi mis à jour');
      go('#/defi/' + encodeURIComponent(newId));
    } catch (err) { toast(err.message, true); }
  };
}

/* ---------- Administration ---------- */
async function renderAdmin() {
  if (ME.role !== 'admin') throw new Error('Page réservée aux admins');
  const [users, defis] = await Promise.all([api.adminUsers(), api.listDefis()]);
  const nbAdmins = users.filter((u) => u.role === 'admin').length;
  const nbBloques = users.filter((u) => u.bloque).length;
  const actifs = defis.filter((d) => timeInfo(d).status === 'en cours').length;
  const fmt = (s) => s ? new Date(s).toLocaleDateString('fr-FR') : '—';

  $('#app').innerHTML = `
    <section class="hero small"><h1>Admin</h1><span class="kicker">Gestion des utilisateurs et des défis</span></section>
    <div class="kpis">
      <div class="card kpi"><b>${users.length}</b><small>inscrits</small></div>
      <div class="card kpi"><b>${defis.length}</b><small>défis</small></div>
      <div class="card kpi"><b>${actifs}</b><small>en cours</small></div>
      <div class="card kpi"><b>${nbAdmins}</b><small>admin${nbAdmins > 1 ? 's' : ''}</small></div>
    </div>

    <div class="card">
      <div class="head-row"><h3>Utilisateurs</h3>
        <input id="user-search" placeholder="Rechercher…" style="max-width:200px"></div>
      ${nbBloques ? `<p class="muted">${nbBloques} compte${nbBloques > 1 ? 's' : ''} bloqué${nbBloques > 1 ? 's' : ''}</p>` : ''}
      <div id="users">${users.map((u) => `<div class="user-row" data-search="${esc((u.pseudo + ' ' + u.email).toLowerCase())}">
        <div class="user-info">
          <b>${esc(u.pseudo)}</b> ${u.role === 'admin' ? '<span class="badge">admin</span>' : ''} ${u.bloque ? '<span class="badge gris">bloqué</span>' : ''}
          <div class="muted">${esc(u.email)} · ${acc(u.sexe, 'inscrit', 'inscrite', 'inscription')} le ${fmt(u.created_at)} · ${u.nb_defis} défi${u.nb_defis > 1 ? 's' : ''}${u.last_sign_in_at ? ' · vu le ' + fmt(u.last_sign_in_at) : ''}</div>
        </div>
        ${u.id === ME.id ? '<span class="muted">c\'est toi</span>' : `<div class="actions">
          <button class="btn ghost small" data-role="${esc(u.id)}" data-v="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'Retirer admin' : 'Passer admin'}</button>
          <button class="btn ${u.bloque ? 'vert' : 'ghost'} small" data-block="${esc(u.id)}" data-v="${u.bloque ? '0' : '1'}">${u.bloque ? 'Débloquer' : 'Bloquer'}</button>
          <button class="btn danger small" data-deluser="${esc(u.id)}" data-p="${esc(u.pseudo)}">Supprimer</button>
        </div>`}
      </div>`).join('')}</div>
    </div>

    <div class="card">
      <h3>Tous les défis</h3>
      ${defis.map((d) => {
        const ti = timeInfo(d);
        return `<div class="user-row">
          <div class="user-info"><a href="#/defi/${encodeURIComponent(d.id)}"><b>${esc(d.nom)}</b></a>
            <span class="badge contour">${VISI[d.visibilite]?.emoji} ${VISI[d.visibilite]?.label}</span>
            <div class="muted">${TYPES[d.type]?.emoji} ${TYPES[d.type]?.label} · ${d.membres.length} membre${d.membres.length > 1 ? 's' : ''} · ${ti.status} · créé par ${esc(users.find((u) => u.id === d.created_by)?.pseudo || '?')}</div></div>
          <button class="btn danger small" data-del="${esc(d.id)}" data-nom="${esc(d.nom)}">Supprimer</button>
        </div>`;
      }).join('') || '<p class="muted">Aucun défi.</p>'}
    </div>`;

  $('#user-search').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#users .user-row').forEach((r) => { r.hidden = !r.dataset.search.includes(q); });
  };
  $('#app').onclick = async (e) => {
    const r = e.target.closest('[data-role]'), b = e.target.closest('[data-block]'), del = e.target.closest('[data-del]');
    const du = e.target.closest('[data-deluser]');
    if (du) {
      const f = await dialog(`<h3>Supprimer ${esc(du.dataset.p)} ?</h3>
        <p>Le compte sera <b>définitivement effacé</b>, avec ses saisies, ses messages, ses amitiés et les défis qu'il a créés.</p>
        <label class="field">Pour confirmer, écris son pseudo<input name="conf" autocomplete="off" placeholder="${esc(du.dataset.p)}"></label>
        <div class="actions"><button class="btn danger" value="ok">Supprimer définitivement</button><button class="btn ghost" value="cancel" formnovalidate>Annuler</button></div>`);
      if (!f) return;
      if (String(f.get('conf') || '').trim().toLowerCase() !== du.dataset.p.toLowerCase()) return toast('Le pseudo ne correspond pas, rien n\'a été supprimé', true);
      return act(() => api.adminDeleteUser(du.dataset.deluser), `Compte de ${du.dataset.p} supprimé`);
    }
    if (r) act(() => api.adminSetRole(r.dataset.role, r.dataset.v), r.dataset.v === 'admin' ? 'Promu admin' : 'Rôle admin retiré');
    if (b) {
      const bloquer = b.dataset.v === '1';
      if (!bloquer || await confirmDlg('Bloquer ce compte ?', "Cette personne ne pourra plus se connecter ni voir les défis.", 'Bloquer')) {
        act(() => api.adminSetBlocked(b.dataset.block, bloquer), bloquer ? 'Compte bloqué' : 'Compte débloqué');
      }
    }
    if (del && await confirmDlg(`Supprimer « ${del.dataset.nom} » ?`, 'Le défi et toutes ses données seront effacés.', 'Supprimer')) {
      act(() => api.deleteDefi(del.dataset.del), 'Défi supprimé');
    }
  };
}



/* ---------- Notifications : cloche, page, téléphone ---------- */
const VAPID_PUBLIC_KEY = (window.APP_CONFIG && window.APP_CONFIG.VAPID_PUBLIC_KEY) || 'BMBQtgtaDuK3xChkXlHWexK_C_huOtIz5-G6KfjTS7D_i6ab2pZLQGk1sStbbYBzalQWLDo2fdzxxagCRfRRq2M';
const NOTIF_ICONS = { invitation: 'calendarPlus', ami: 'amis', membre: 'amis', ecart: 'cross', sanction: 'balance', message: 'chat', booke: 'check', rappel: 'clock', anniv: 'gateau' };
let stopNotifs = null;

async function majCloche() {
  if (!ME) return;
  let n = 0;
  try { n = await api.nbNotifsNonLues(); } catch { return; }
  const dot = document.querySelector('.bell-dot');
  if (dot) { dot.hidden = !n; dot.textContent = n > 9 ? '9+' : String(n); }
  try { if (n) navigator.setAppBadge?.(n); else navigator.clearAppBadge?.(); } catch {}
}
function ecouterNotifs() {
  if (stopNotifs || !api.subscribeNotifs) return;
  stopNotifs = api.subscribeNotifs(() => {
    majCloche();
    if (location.hash.startsWith('#/notifs')) render();
  });
}
function arreterNotifs() { if (stopNotifs) { stopNotifs(); stopNotifs = null; } }

function ilYa(dateIso) {
  const min = Math.round((Date.now() - new Date(dateIso)) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? 'hier' : j < 7 ? `il y a ${j} jours` : new Date(dateIso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// État des notifications sur CE téléphone
async function etatPush() {
  if (!api.pushDispo) return 'demo';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installee = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return ios && !installee ? 'ios-installer' : 'non-supporte';
  if (Notification.permission === 'denied') return 'refuse';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    return sub ? 'actif' : 'inactif';
  } catch { return 'inactif'; }
}
function cartePush(etat) {
  const t = {
    demo: ['Notifications du téléphone', "Elles marcheront une fois l'appli branchée sur Supabase (pas en mode démo).", ''],
    'ios-installer': ['Reçois les notifs sur ton iPhone', "Sur iPhone, ajoute d'abord l'appli à ton écran d'accueil : bouton Partager ⬆️ puis « Sur l'écran d'accueil ». Ouvre-la ensuite depuis l'icône et reviens ici.", ''],
    'non-supporte': ['Notifications du téléphone', "Ce navigateur ne permet pas les notifications. Essaie avec Chrome (Android) ou depuis l'icône sur l'écran d'accueil (iPhone).", ''],
    refuse: ['Notifications bloquées', "Tu as refusé les notifications. Pour les réactiver, va dans les réglages de ton téléphone (Notifications → Pari tenu) ou du navigateur.", ''],
    inactif: ['Active les notifs sur ce téléphone', 'Invitations, écarts, messages, rappels… même quand l\'appli est fermée.', '<button class="btn rose small" data-push="on">Activer</button>'],
    actif: ['Notifications activées ✓', 'Tu les reçois sur ce téléphone, même appli fermée.', '<button class="btn ghost small" data-push="off">Désactiver</button>'],
  }[etat];
  return `<div class="card push-card ${etat === 'actif' ? 'on' : ''}"><span class="ico-bubble ${etat === 'actif' ? '' : 'rose'}">${ico('tel')}</span>
    <div><b>${t[0]}</b><p>${t[1]}</p>${t[2]}</div></div>`;
}
function b64VersOctets(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function activerPush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error("Tu n'as pas autorisé les notifications");
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('sw.js'));
    await Promise.race([navigator.serviceWorker.ready, new Promise((_, ko) => setTimeout(() => ko(new Error("Le fichier sw.js ne démarre pas : vérifie qu'il est bien à jour sur GitHub, puis ferme et rouvre l'appli")), 8000))]);
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64VersOctets(VAPID_PUBLIC_KEY) }));
  await api.savePushSub(sub.toJSON());
}
async function desactiverPush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) { await api.deletePushSub(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
}

async function renderNotifs() {
  const [liste, etat] = await Promise.all([api.listNotifs(), etatPush()]);
  const nouvelles = liste.filter((n) => !n.lu), vues = liste.filter((n) => n.lu);
  const item = (n) => `<a class="notif ${n.lu ? '' : 'new'}" href="${esc(n.lien || '#/')}" data-nid="${esc(n.id)}">
      <span class="ico-bubble sm ${['ecart', 'sanction', 'anniv', 'invitation'].includes(n.type) ? 'rose' : ''}">${ico(NOTIF_ICONS[n.type] || 'autre')}</span>
      <span class="nt-main"><b>${esc(n.titre)}</b><span>${esc(n.texte)}</span><small>${ilYa(n.created_at)}</small></span>
      ${n.lu ? '' : '<i class="nt-dot"></i>'}</a>`;
  $('#app').innerHTML = `<section class="hero small"><h1>Notifs</h1><span class="kicker">Ce qui s'est passé</span></section>
    ${cartePush(etat)}
    <div class="card">
      <div class="head-row"><h3>Nouvelles</h3>${nouvelles.length ? '<button class="btn ghost small" id="tout-lire">Tout marquer comme lu</button>' : ''}</div>
      ${nouvelles.length ? `<div class="notif-list">${nouvelles.map(item).join('')}</div>` : '<p class="muted">Rien de nouveau. Tout est à jour 🌿</p>'}
    </div>
    ${vues.length ? `<div class="card"><h3>Déjà vues</h3><div class="notif-list">${vues.map(item).join('')}</div></div>` : ''}`;

  $('#app').onclick = async (e) => {
    const a = e.target.closest('[data-nid]');
    if (a) { api.lireNotif(a.dataset.nid).then(majCloche).catch(() => {}); return; }   // le lien s'ouvre normalement
    const b = e.target.closest('[data-push]');
    if (b) {
      b.disabled = true;
      try {
        if (b.dataset.push === 'on') { await activerPush(); toast('Notifications activées 🔔'); }
        else { await desactiverPush(); toast('Notifications désactivées sur ce téléphone'); }
      } catch (err) { toast(err.message || 'Impossible pour le moment', true); }
      render();
    }
  };
  const tl = $('#tout-lire');
  if (tl) tl.onclick = (e) => { e.stopPropagation(); act(() => api.toutLire(), 'Tout est lu').then(majCloche); };
}

/* ---------- Message d'anniversaire ---------- */
function popupAnniv() {
  const key = `pt-anniv-${ME.id}-${new Date().getFullYear()}`;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch {}
  const age = ME.naissance ? new Date().getFullYear() - Number(ME.naissance.slice(0, 4)) : null;
  dialog(`<div class="center anniv-pop">
      <div class="confettis" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
      <span class="ico-bubble rose big">${ico('gateau')}</span>
      <h3>Joyeux anniversaire ${esc(ME.pseudo)} !</h3>
      <p>${age && age > 0 && age < 120 ? `${age} ans, ça se fête 🎉 ` : ''}Toute la team Pari tenu te souhaite une journée géniale. Continue de tenir tes paris !</p>
      <div class="actions" style="justify-content:center"><button class="btn rose" value="ok">Merci !</button></div>
    </div>`);
}

/* ---------- Tutoriel de bienvenue ---------- */
const TUTO = [
  { titre: 'Bienvenue sur Pari tenu !', icon: 'autre',
    texte: "Ici, on se lance des défis entre potes et on s'y tient <b>ensemble</b> : perte de poids, sport, arrêter de fumer… Petit tour de l'app en 1 minute ?" },
  { target: '.tab:nth-child(1)', titre: 'Accueil', icon: TABS[0].icon, raw: true,
    texte: "Ton tableau de bord : ce qu'il y a à faire aujourd'hui, tes progrès sur chaque défi et ton calendrier." },
  { target: '.tab.plus', titre: 'Nouveau défi', icon: TABS[2].icon, raw: true,
    texte: "En solo ou avec tes potes : choisis le type de défi, les dates, la <b>récompense</b> si c'est réussi et la <b>sanction</b> si c'est raté. Mets-le en privé ou en public, et invite tes amis." },
  { target: '.tab:nth-child(2)', titre: 'Tes défis', icon: TABS[1].icon, raw: true,
    texte: "Dans chaque défi, note ta pesée, ta séance ou ta journée. Tu as craqué ? Appuie sur <b>« J'ai flanché »</b>. Un pote a craqué ? Tu peux le <b>signaler</b>, et la sanction est votée par tout le groupe." },
  { target: '.tab:nth-child(4)', titre: 'Chat', icon: TABS[3].icon, raw: true,
    texte: "Discute en direct avec tes potes, propose un <b>moment</b> (resto, ciné, sport…) pour voir qui est dispo, ou lance un <b>sondage</b>." },
  { target: '.tab:nth-child(5)', titre: 'Amis', icon: TABS[4].icon, raw: true,
    texte: "Ajoute tes potes avec leur <b>pseudo</b>. Ensuite tu pourras les inviter à tes défis en un clic." },
  { target: '.navlink.pseudo', titre: 'Ton profil', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', raw: true, top: true,
    texte: "Ton pseudo, la déconnexion… et tu pourras <b>revoir ce tuto</b> ici quand tu veux. À toi de jouer 🤝" },
];

function startTuto() {
  if (document.querySelector('.tuto')) return;
  let i = 0;
  const el = document.createElement('div');
  el.className = 'tuto';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  document.body.appendChild(el);

  const finish = async () => {
    el.remove();
    window.removeEventListener('resize', draw);
    try { await api.setTutoVu(true); ME.tuto_vu = true; } catch {}
    if (ME.naissance && mmjj(ME.naissance) === mmjj(today()) && location.hash.replace(/^#\/?/, '') === '') popupAnniv();
  };
  function draw() {
    const st = TUTO[i];
    const last = i === TUTO.length - 1;
    const target = st.target && document.querySelector(st.target);
    let hole = '', pos = 'center';
    if (target && target.offsetParent !== null) {
      const r = target.getBoundingClientRect(), pad = 6;
      hole = `<div class="tuto-hole" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>`;
      pos = st.top ? 'below' : 'above';
    }
    const svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${st.raw ? st.icon : ICONS[st.icon]}</svg>`;
    el.className = 'tuto' + (hole ? '' : ' dim');
    el.innerHTML = `${hole}
      <div class="tuto-card ${pos}">
        <div class="tuto-ico">${svg}</div>
        <span class="tuto-step">Étape ${i + 1} / ${TUTO.length}</span>
        <h3>${st.titre}</h3>
        <p>${st.texte}</p>
        <div class="tuto-dots">${TUTO.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="tuto-actions">
          ${last ? '<span></span>' : '<button type="button" class="btn ghost small" data-t="skip">Passer le tuto</button>'}
          <span class="tuto-nav">
            ${i > 0 ? '<button type="button" class="btn ghost small" data-t="prev" aria-label="Précédent">‹</button>' : ''}
            <button type="button" class="btn rose small" data-t="next">${i === 0 ? 'Montre-moi' : last ? "C'est parti !" : 'Suivant'}</button>
          </span>
        </div>
        ${i === 0 ? '<p class="tuto-note">Tu pourras le revoir depuis ton profil.</p>' : ''}
      </div>`;
  }
  el.onclick = (e) => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    if (b.dataset.t === 'skip') return finish();
    if (b.dataset.t === 'prev') { i = Math.max(0, i - 1); return draw(); }
    if (i === TUTO.length - 1) return finish();
    i++; draw();
  };
  window.addEventListener('resize', draw);
  draw();
}

/* ---------- Démarrage ---------- */
async function boot() {
  if (!window.api) { $('#app').innerHTML = '<div class="card empty mt">Erreur de chargement des scripts.</div>'; return; }
  $('#demo-banner').hidden = api.mode !== 'demo';
  try { ME = await api.session(); } catch (e) { ME = null; toast(e.message, true); }
  window.addEventListener('hashchange', render);
  render();
}

if ('serviceWorker' in navigator && location.protocol === 'https:' && !location.hostname.endsWith('claude.ai')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();