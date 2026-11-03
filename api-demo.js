/* Couche de données — MODE DÉMO
   Utilisé quand config.js est vide. Tout est stocké dans le navigateur,
   avec quelques comptes de test. Même interface que api-supabase.js. */
(function () {
  if (window.api) return; // Supabase est configuré

  const DB_KEY = 'dep-demo-db-v2';
  const SESSION_KEY = 'dep-demo-session';
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const pad = (n) => String(n).padStart(2, '0');
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const err = (m) => { throw new Error(m); };

  function seed() {
    const u = (id, pseudo, email, role = 'user') => ({ id, pseudo, email, password: 'demo', role, bloque: false, created_at: day(-40) });
    const profiles = [
      u('u1', 'Léonie', 'leonie@demo.fr', 'admin'), u('u2', 'Camille', 'camille@demo.fr'),
      u('u3', 'Hugo', 'hugo@demo.fr'), u('u4', 'Inès', 'ines@demo.fr'),
    ];
    profilsDemo(profiles);
    const defis = [
      { id: 'd1', nom: 'Objectif été', type: 'poids', date_debut: day(-35), date_fin: day(55), frequence_saisie: 'semaine', recompense: 'Week-end spa toutes les deux', sanction_finale: "Faire le ménage chez l'autre pendant 1 mois", visibilite: 'prive', created_by: 'u1' },
      { id: 'd2', nom: 'Salle 3x par semaine', type: 'sport', date_debut: day(-10), date_fin: day(50), frequence_saisie: 'jour', recompense: 'Resto japonais', sanction_finale: "Payer 1 mois d'abonnement à l'autre", visibilite: 'public', created_by: 'u3' },
      { id: 'd3', nom: 'Stop clope', type: 'tabac', date_debut: day(-12), date_fin: day(78), frequence_saisie: 'jour', recompense: 'Concert au choix', sanction_finale: 'Don de 50 € à une asso', visibilite: 'prive', created_by: 'u3' },
    ];
    const mb = (defi_id, user_id, objectif, valeur_depart, valeur_cible, unite) => ({ defi_id, user_id, objectif, valeur_depart, valeur_cible, unite, joined_at: day(-30) });
    const membres = [
      mb('d1', 'u1', "Perdre 4 kg avant l'été", 64, 60, 'kg'), mb('d1', 'u2', 'Perdre 6 kg', 72, 66, 'kg'),
      mb('d2', 'u3', '4 séances par semaine', null, 4, 'séances / sem.'), mb('d2', 'u2', '3 séances par semaine', null, 3, 'séances / sem.'),
      mb('d3', 'u3', 'Zéro cigarette', null, 0, 'cigarettes / jour'), mb('d3', 'u4', 'Max 2 cigarettes par jour', null, 2, 'cigarettes / jour'),
    ];
    const s = (defi_id, user_id, date, valeur) => ({ id: newId(), defi_id, user_id, date, valeur, note: '' });
    const suivi = [
      ...[64, 63.6, 63.1, 62.9, 62.2].map((v, i) => s('d1', 'u1', day(-35 + 7 * i), v)),
      ...[72, 71.2, 70.8, 71.0, 70.1].map((v, i) => s('d1', 'u2', day(-35 + 7 * i), v)),
      ...[-10, -8, -6, -4, -3, -1].map((n) => s('d2', 'u3', day(n), 1)),
      ...[-9, -5, -2].map((n) => s('d2', 'u2', day(n), 1)),
      ...Array.from({ length: 12 }, (_, i) => s('d3', 'u3', day(i - 12), 0)),
      ...Array.from({ length: 12 }, (_, i) => s('d3', 'u4', day(i - 12), i === 8 ? 3 : 1)),
    ];
    const ecarts = [
      { id: 'e1', defi_id: 'd1', joueur: 'u2', signale_par: 'u1', date: day(-9), description: 'Pizza + tiramisu à 23h 🍕', sanction: 'Payer le petit-déj du dimanche', valide_par: ['u1', 'u2'], statut: 'décidée' },
      { id: 'e2', defi_id: 'd3', joueur: 'u4', signale_par: 'u4', date: day(-4), description: 'Soirée, 3 cigarettes', sanction: 'Faire 30 min de course', valide_par: ['u4'], statut: 'à décider' },
    ];
    const invitations = [{ id: 'i1', defi_id: 'd3', from_user: 'u3', to_user: 'u1', statut: 'en attente', created_at: day(-1) }];
    return { profiles, defis, membres, suivi, ecarts, invitations, messages: seedMessages(), amities: seedAmities(), conversations: seedConversations(), notifications: seedNotifs() };
  }

  // Sexe et date de naissance des comptes de test (Camille fête son anniversaire aujourd'hui)
  function profilsDemo(profiles) {
    const t = new Date();
    const infos = { u1: ['F', '2004-03-14'], u2: ['F', `2003-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`], u3: ['H', '2002-07-21'], u4: ['F', '2004-12-02'] };
    profiles.forEach((p) => { if (infos[p.id] && !p.sexe) { p.sexe = infos[p.id][0]; p.naissance = infos[p.id][1]; p.partage_anniv = p.id === 'u2'; } });
  }

  function seedAmities() {
    const a = (demandeur, destinataire, statut) => ({ id: newId(), demandeur, destinataire, statut });
    return [a('u1', 'u2', 'acceptée'), a('u3', 'u2', 'acceptée'), a('u3', 'u4', 'acceptée'), a('u4', 'u1', 'en attente'), a('u3', 'u1', 'en attente')];
  }

  function seedMessages() {
    const at = (j, h, mn) => { const d = new Date(); d.setDate(d.getDate() + j); d.setHours(h, mn, 0, 0); return d.toISOString(); };
    const msg = (room, user_id, contenu, created_at, type = 'texte', data = {}, reponses = []) => ({
      id: newId(), defi_id: room.startsWith('d') ? room : null, conv_id: room.startsWith('c') ? room : null,
      user_id, contenu, created_at, type, data, reponses });
    return [
      msg('d1', 'u2', "Pesée faite, -0,9 kg cette semaine 💪", at(-1, 8, 12)),
      msg('d1', 'u1', 'Bravo !! Moi -0,7, on lâche rien', at(-1, 8, 40)),
      msg('d1', 'u2', 'Par contre la pizza de mardi… je sais 🙈', at(0, 9, 5)),
      msg('d2', 'u3', "Qui vient à la salle ce soir ? 18h30", at(0, 12, 20)),
      msg('d2', 'u2', 'Moi ! Jambes au programme 🦵', at(0, 12, 31)),
      msg('d3', 'u3', '13 jours sans clope 🚭', at(0, 10, 2)),
      msg('d3', 'u4', "Respect. Moi c'est dur le soir…", at(0, 10, 15)),
      msg('c1', 'u2', 'On se fait un truc cette semaine ?', at(0, 14, 0)),
      msg('c1', 'u2', '', at(0, 14, 1), 'proposition',
        { activite: 'resto', titre: 'Sushi', lieu: 'Rue Sainte-Anne', date: day(5), heure: '20:00', statut: 'ouvert' },
        [{ user_id: 'u2', valeur: 'oui' }]),
      msg('c2', 'u3', '', at(0, 11, 0), 'sondage',
        { question: 'On fête la fin du défi où ?', options: ['Bowling', 'Karaoké', 'Brunch'] },
        [{ user_id: 'u3', valeur: '1' }, { user_id: 'u2', valeur: '1' }]),
    ];
  }

  function seedNotifs() {
    const il = (min) => new Date(Date.now() - min * 60000).toISOString();
    const n = (user_id, type, titre, texte, lien, min, lu = false) => ({ id: newId(), user_id, type, titre, texte, lien, lu, created_at: il(min) });
    return [
      n('u1', 'invitation', 'Invitation à un défi', 'Hugo t\'invite à « Stop clope »', '#/defi/d3', 60),
      n('u1', 'ami', "Demande d'ami", "Inès veut t'ajouter en ami", '#/amis', 140),
      n('u1', 'ami', "Demande d'ami", "Hugo veut t'ajouter en ami", '#/amis', 300),
      n('u1', 'message', 'Camille', "Camille : qui est dispo ? Sushi", '#/chat/c/c1', 25),
      n('u1', 'anniv', 'Anniversaire 🎂', "C'est l'anniversaire de Camille aujourd'hui !", '#/amis', 400),
      n('u1', 'membre', 'Nouveau dans le défi', 'Camille a rejoint « Objectif été »', '#/defi/d1', 60 * 24 * 3, true),
      n('u3', 'anniv', 'Anniversaire 🎂', "C'est l'anniversaire de Camille aujourd'hui !", '#/amis', 400),
      n('u3', 'sanction', 'Sanction à valider', 'Pour Inès : Faire 30 min de course', '#/defi/d3', 90),
      n('u2', 'anniv', 'Joyeux anniversaire Camille ! 🎂', 'Toute la team Pari tenu te souhaite une super journée', '#/', 420),
    ];
  }

  function seedConversations() {
    return [
      { id: 'c1', nom: '', created_by: 'u2', membres: ['u1', 'u2'] },
      { id: 'c2', nom: 'La team 💚', created_by: 'u3', membres: ['u1', 'u2', 'u3'] },
    ];
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(DB_KEY)) || seed(); } catch { db = seed(); }
  if (!db.messages) db.messages = seedMessages();
  if (!db.amities) db.amities = seedAmities();
  profilsDemo(db.profiles);
  if (!db.conversations) { db.conversations = seedConversations(); db.messages = seedMessages(); }
  if (!db.notifications) db.notifications = seedNotifs();
  db.messages.forEach((m) => { m.type = m.type || 'texte'; m.data = m.data || {}; m.reponses = m.reponses || []; });
  const save = () => { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch {} };
  save();

  let sessionId = null;
  try { sessionId = localStorage.getItem(SESSION_KEY); } catch {}
  const setSession = (id) => { sessionId = id; try { id ? localStorage.setItem(SESSION_KEY, id) : localStorage.removeItem(SESSION_KEY); } catch {} };

  // Diffusion locale des changements du chat (et entre onglets via BroadcastChannel)
  const listeners = new Set();
  let bc = null;
  try {
    bc = new BroadcastChannel('pari-tenu-demo');
    bc.onmessage = () => { try { db = JSON.parse(localStorage.getItem(DB_KEY)) || db; } catch {} listeners.forEach((f) => f()); };
  } catch {}
  function emit() { listeners.forEach((f) => f()); try { bc && bc.postMessage(1); } catch {} }
  // Notifications de démo (mêmes règles que les déclencheurs de la base)
  const notifListeners = new Set();
  function notify(dest, type, titre, texte, lien, fusion = false) {
    if (!dest) return;
    const p = db.profiles.find((x) => x.id === dest);
    if (!p || p.bloque) return;
    const now = new Date().toISOString();
    const ex = fusion && db.notifications.find((x) => x.user_id === dest && x.type === type && x.lien === lien && !x.lu);
    if (ex) Object.assign(ex, { titre, texte, created_at: now });
    else db.notifications.push({ id: newId(), user_id: dest, type, titre, texte: String(texte).slice(0, 240), lien, lu: false, created_at: now });
    notifListeners.forEach((f) => f());
  }
  const membresDe = (defiId) => db.membres.filter((m) => m.defi_id === defiId).map((m) => m.user_id);
  const roomOf = (m) => (m.defi_id ? 'd' + m.defi_id : 'c' + m.conv_id);
  const canWrite = (kind, id) => (kind === 'd' ? isMember(id) : !!db.conversations.find((c) => c.id === id && c.membres.includes(sessionId)));

  function salonDe(m) {
    if (m.defi_id) return { lien: '#/chat/d/' + m.defi_id, titre: getD(m.defi_id)?.nom, dests: membresDe(m.defi_id) };
    const c = db.conversations.find((x) => x.id === m.conv_id);
    return { lien: '#/chat/c/' + m.conv_id, titre: c?.nom || '', dests: c ? c.membres : [] };
  }
  function notifierMessage(m) {
    const { lien, titre, dests } = salonDe(m);
    const auteur = pseudoOf(m.user_id);
    const texte = auteur + ' : ' + (m.type === 'proposition' ? 'qui est dispo ? ' + (m.data?.titre || '') : m.type === 'sondage' ? 'nouveau sondage : ' + (m.data?.question || '') : m.contenu);
    dests.filter((u) => u !== m.user_id).forEach((u) => notify(u, 'message', titre || auteur, texte, lien, true));
  }

  // Démo : les potes « répondent » tout seuls pour montrer le direct
  function simuler(kind, id, m) {
    const autres = (kind === 'd' ? db.membres.filter((x) => x.defi_id === id).map((x) => x.user_id)
      : db.conversations.find((c) => c.id === id).membres).filter((x) => x !== m.user_id);
    if (!autres.length) return;
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    autres.forEach((who, i) => {
      setTimeout(() => {
        if (m.type === 'proposition') { m.reponses.push({ user_id: who, valeur: pick(['oui', 'oui', 'peut-etre', 'non']) }); }
        else if (m.type === 'sondage') { m.reponses.push({ user_id: who, valeur: String(Math.floor(Math.random() * m.data.options.length)) }); }
        else if (i === 0 && Math.random() < 0.7) {
          db.messages.push({ id: newId(), defi_id: m.defi_id, conv_id: m.conv_id, user_id: who, type: 'texte', data: {}, reponses: [],
            contenu: pick(['Haha grave 😂', 'On lâche rien 💪', 'Je valide !', "T'es chaud(e) 🔥", 'Ok pour moi', 'Pari tenu 🤝', 'Je te surveille 👀']),
            created_at: new Date().toISOString() });
          notifierMessage(db.messages[db.messages.length - 1]);
        } else return;
        save(); emit();
      }, 1500 + i * 1200 + Math.random() * 1500);
    });
  }

  const me = () => db.profiles.find((p) => p.id === sessionId && !p.bloque);
  const meId = () => me()?.id || err('Connecte-toi');
  const isAdmin = () => me()?.role === 'admin';
  const isMember = (d, u = sessionId) => db.membres.some((m) => m.defi_id === d && m.user_id === u);
  const sexeOf = (id) => db.profiles.find((p) => p.id === id)?.sexe || 'N';
  const pseudoOf = (id) => db.profiles.find((p) => p.id === id)?.pseudo || '?';
  const getD = (id) => db.defis.find((d) => d.id === id);
  const canSee = (id) => {
    const d = getD(id);
    return !!d && !!me() && (isAdmin() || d.visibilite === 'public' || d.created_by === sessionId || isMember(id)
      || db.invitations.some((i) => i.defi_id === id && i.to_user === sessionId && i.statut === 'en attente'));
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const byPseudo = (p) => db.profiles.find((x) => x.pseudo.toLowerCase() === String(p).trim().toLowerCase());

  window.api = {
    mode: 'demo',
    async resetDemo() { db = seed(); save(); setSession(null); },

    async session() {
      const p = me();
      return p ? { id: p.id, pseudo: p.pseudo, role: p.role, bloque: p.bloque, email: p.email, tuto_vu: !!p.tuto_vu, sexe: p.sexe || 'N', naissance: p.naissance || null, partage_anniv: !!p.partage_anniv } : null;
    },
    async signUp(email, password, pseudo, sexe = 'N', naissance = null, partageAnniv = false) {
      if (password.length < 6) err('Le mot de passe doit faire au moins 6 caractères');
      if (byPseudo(pseudo)) err('Ce pseudo est déjà pris');
      if (db.profiles.some((p) => p.email.toLowerCase() === email.toLowerCase())) err('Un compte existe déjà avec cet email');
      const p = { id: newId(), pseudo: pseudo.trim(), email, password, role: 'user', bloque: false, created_at: day(0), sexe, naissance, partage_anniv: !!partageAnniv };
      db.profiles.push(p); save(); setSession(p.id);
      return { needsConfirm: false };
    },
    async signIn(email, password) {
      const p = db.profiles.find((x) => x.email.toLowerCase() === email.toLowerCase().trim() && x.password === password);
      if (!p) err('Email ou mot de passe incorrect');
      if (p.bloque) err('Ton compte a été bloqué par un admin');
      setSession(p.id);
    },
    async signOut() { setSession(null); },
    async resetPassword() { err('En mode démo, le mot de passe des comptes de test est « demo »'); },

    async listDefis() {
      return clone(db.defis.filter((d) => canSee(d.id)).map((d) => ({
        ...d, membres: db.membres.filter((m) => m.defi_id === d.id).map((m) => ({ user_id: m.user_id, pseudo: pseudoOf(m.user_id) })),
      })));
    },
    async getDefi(id) {
      if (!canSee(id)) err('Ce défi est introuvable ou privé');
      const membres = db.membres.filter((m) => m.defi_id === id).map((m) => ({ ...m, pseudo: pseudoOf(m.user_id), sexe: sexeOf(m.user_id) }));
      const ecarts = db.ecarts.filter((e) => e.defi_id === id);
      const pseudos = {};
      [...membres.map((m) => m.user_id), ...ecarts.flatMap((e) => [e.joueur, e.signale_par])].forEach((u) => { pseudos[u] = pseudoOf(u); });
      return clone({
        defi: getD(id), membres, ecarts, pseudos,
        suivi: db.suivi.filter((s) => s.defi_id === id),
        invitations: db.invitations.filter((i) => i.defi_id === id && i.statut === 'en attente').map((i) => ({ id: i.id, to_user: i.to_user, pseudo: pseudoOf(i.to_user) })),
      });
    },
    async saveDefi(defi, monObjectif) {
      const uid = meId();
      if (defi.id) {
        const d = getD(defi.id);
        if (!d || (d.created_by !== uid && !isAdmin())) err("Seul le créateur du défi peut le modifier");
        Object.assign(d, defi, { created_by: d.created_by });
      } else {
        defi = { ...defi, id: newId(), created_by: uid };
        db.defis.push(defi);
        db.membres.push({ defi_id: defi.id, user_id: uid, joined_at: day(0), ...monObjectif });
      }
      save(); return defi.id;
    },
    async deleteDefi(id) {
      const d = getD(id);
      if (!d || (d.created_by !== meId() && !isAdmin())) err('Action non autorisée');
      db.defis = db.defis.filter((x) => x.id !== id);
      for (const t of ['membres', 'suivi', 'ecarts', 'invitations']) db[t] = db[t].filter((x) => x.defi_id !== id);
      save();
    },
    async updateMembership(defiId, fields) {
      const m = db.membres.find((x) => x.defi_id === defiId && x.user_id === meId());
      if (!m) err("Tu ne fais pas partie de ce défi");
      Object.assign(m, fields); save();
    },
    async join(defiId) {
      const d = getD(defiId);
      if (!d || d.visibilite !== 'public') err('Ce défi est privé : il faut une invitation');
      if (!isMember(defiId)) {
        membresDe(defiId).forEach((u) => notify(u, 'membre', 'Nouveau dans le défi', `${me().pseudo} a rejoint « ${d.nom} »`, '#/defi/' + defiId));
        db.membres.push({ defi_id: defiId, user_id: meId(), objectif: '', valeur_depart: null, valeur_cible: null, unite: '', joined_at: day(0) });
      }
      db.invitations.filter((i) => i.defi_id === defiId && i.to_user === sessionId).forEach((i) => { i.statut = 'acceptée'; });
      save();
    },
    async leave(defiId) { const u = meId(); db.membres = db.membres.filter((m) => !(m.defi_id === defiId && m.user_id === u)); save(); },
    async removeMember(defiId, userId) {
      const d = getD(defiId);
      if (d.created_by !== meId() && !isAdmin()) err('Action non autorisée');
      db.membres = db.membres.filter((m) => !(m.defi_id === defiId && m.user_id === userId)); save();
    },

    async invite(defiId, pseudo) {
      if (!isMember(defiId)) err("Tu dois faire partie du défi pour inviter quelqu'un");
      if (getD(defiId)?.solo) err("C'est un défi solo : passe-le en défi entre potes pour inviter quelqu'un");
      const cible = byPseudo(pseudo);
      if (!cible || cible.bloque) err(`Aucun compte avec le pseudo « ${pseudo} »`);
      if (isMember(defiId, cible.id)) err(`${cible.pseudo} fait déjà partie du défi`);
      const ex = db.invitations.find((i) => i.defi_id === defiId && i.to_user === cible.id);
      if (ex) Object.assign(ex, { statut: 'en attente', from_user: sessionId });
      else db.invitations.push({ id: newId(), defi_id: defiId, from_user: sessionId, to_user: cible.id, statut: 'en attente', created_at: day(0) });
      notify(cible.id, 'invitation', 'Invitation à un défi', `${me().pseudo} t'invite à « ${getD(defiId)?.nom} »`, '#/defi/' + defiId);
      save(); return 'Invitation envoyée';
    },
    async cancelInvitation(id) { db.invitations = db.invitations.filter((i) => i.id !== id); save(); },
    async myInvitations() {
      const u = meId();
      return db.invitations.filter((i) => i.to_user === u && i.statut === 'en attente').map((i) => ({
        id: i.id, defi_id: i.defi_id, defi_nom: getD(i.defi_id)?.nom, type: getD(i.defi_id)?.type, from_pseudo: pseudoOf(i.from_user),
      }));
    },
    async respond(id, accept) {
      const i = db.invitations.find((x) => x.id === id && x.to_user === meId() && x.statut === 'en attente');
      if (!i) err('Invitation introuvable');
      i.statut = accept ? 'acceptée' : 'refusée';
      if (accept && !isMember(i.defi_id)) {
        membresDe(i.defi_id).forEach((u) => notify(u, 'membre', 'Nouveau dans le défi', `${me().pseudo} a rejoint « ${getD(i.defi_id)?.nom} »`, '#/defi/' + i.defi_id));
        db.membres.push({ defi_id: i.defi_id, user_id: sessionId, objectif: '', valeur_depart: null, valeur_cible: null, unite: '', joined_at: day(0) });
      }
      save();
    },

    async addSuivi(defiId, date, valeur, remplacer) {
      const u = meId();
      if (!isMember(defiId)) err("Tu ne fais pas partie de ce défi");
      if (remplacer) db.suivi = db.suivi.filter((s) => !(s.defi_id === defiId && s.user_id === u && s.date === date));
      db.suivi.push({ id: newId(), defi_id: defiId, user_id: u, date, valeur, note: '' }); save();
    },
    async addEcart(e) {
      if (!isMember(e.defi_id) || !isMember(e.defi_id, e.joueur)) err('Seuls les membres du défi peuvent déclarer un écart');
      db.ecarts.push({ id: newId(), signale_par: meId(), sanction: '', valide_par: [], statut: 'à décider', ...e });
      const nomD = getD(e.defi_id)?.nom, lienD = '#/defi/' + e.defi_id;
      if (e.joueur !== sessionId) notify(e.joueur, 'ecart', 'Écart signalé', `${me().pseudo} a signalé un écart pour toi dans « ${nomD} »`, lienD);
      membresDe(e.defi_id).filter((u) => u !== e.joueur && u !== sessionId).forEach((u) => notify(u, 'ecart', "Quelqu'un a flanché", `${pseudoOf(e.joueur)} a flanché dans « ${nomD} »`, lienD));
      save();
    },
    async updateEcart(id, fields) {
      const e = db.ecarts.find((x) => x.id === id);
      if (!e || !isMember(e.defi_id)) err('Action réservée aux membres du défi');
      const avant = { ...e };
      Object.assign(e, fields);
      const lienD = '#/defi/' + e.defi_id;
      if (e.sanction && e.sanction !== avant.sanction) membresDe(e.defi_id).filter((u) => u !== sessionId).forEach((u) => notify(u, 'sanction', 'Sanction à valider', `Pour ${pseudoOf(e.joueur)} : ${e.sanction}`, lienD));
      if (e.statut === 'décidée' && avant.statut !== 'décidée') notify(e.joueur, 'sanction', 'Ta sanction est décidée', e.sanction, lienD);
      save();
    },
    async deleteEcart(id) {
      const e = db.ecarts.find((x) => x.id === id);
      if (!e || (e.signale_par !== meId() && !isAdmin())) err("Seule la personne qui l'a déclaré peut le supprimer");
      db.ecarts = db.ecarts.filter((x) => x.id !== id); save();
    },
    async setTutoVu(v = true) { me().tuto_vu = v; save(); },
    async updateProfil({ pseudo, sexe, naissance, partage_anniv = false }) {
      const ex = byPseudo(pseudo);
      if (ex && ex.id !== meId()) err('Ce pseudo est déjà pris');
      Object.assign(me(), { pseudo: pseudo.trim(), sexe, naissance: naissance || null, partage_anniv: !!partage_anniv }); save();
    },
    async anniversairesAmis(mmjj) {
      const u = meId();
      const amis = db.amities.filter((a) => a.statut === 'acceptée' && (a.demandeur === u || a.destinataire === u)).map((a) => (a.demandeur === u ? a.destinataire : a.demandeur));
      return db.profiles.filter((p) => amis.includes(p.id) && !p.bloque && p.partage_anniv && p.naissance && p.naissance.slice(5) === mmjj)
        .map((p) => ({ user_id: p.id, pseudo: p.pseudo, sexe: p.sexe || 'N' }));
    },

    // ----- Amis -----
    async listAmis() {
      const u = meId();
      const out = { amis: [], recues: [], envoyees: [] };
      for (const a of db.amities.filter((x) => x.demandeur === u || x.destinataire === u)) {
        const other = a.demandeur === u ? a.destinataire : a.demandeur;
        const item = { id: a.id, user_id: other, pseudo: pseudoOf(other), sexe: sexeOf(other) };
        if (a.statut === 'acceptée') out.amis.push(item);
        else if (a.destinataire === u) out.recues.push(item);
        else out.envoyees.push(item);
      }
      out.amis.sort((x, y) => x.pseudo.localeCompare(y.pseudo));
      return out;
    },
    async demanderAmi(pseudo) {
      const u = meId();
      const c = byPseudo(pseudo);
      if (!c || c.bloque) err(`Aucun compte avec le pseudo « ${pseudo} »`);
      if (c.id === u) err("Tu ne peux pas t'ajouter toi-même 😉");
      const a = db.amities.find((x) => (x.demandeur === u && x.destinataire === c.id) || (x.demandeur === c.id && x.destinataire === u));
      if (!a) { db.amities.push({ id: newId(), demandeur: u, destinataire: c.id, statut: 'en attente' }); notify(c.id, 'ami', "Demande d'ami", `${me().pseudo} veut t'ajouter en ami`, '#/amis'); save(); return 'Demande envoyée'; }
      if (a.statut === 'acceptée') err('Vous êtes déjà amis');
      if (a.destinataire === u) { a.statut = 'acceptée'; notify(a.demandeur, 'ami', 'Nouvel ami 🎉', `${me().pseudo} a accepté ta demande`, '#/amis'); save(); return 'Vous êtes maintenant amis 🎉'; }
      err('Demande déjà envoyée');
    },
    async repondreAmi(id, accept) {
      const a = db.amities.find((x) => x.id === id && x.destinataire === meId() && x.statut === 'en attente');
      if (!a) err('Demande introuvable');
      if (accept) { a.statut = 'acceptée'; notify(a.demandeur, 'ami', 'Nouvel ami 🎉', `${me().pseudo} a accepté ta demande`, '#/amis'); } else db.amities = db.amities.filter((x) => x.id !== id);
      save();
    },
    async supprimerAmi(id) { const u = meId(); db.amities = db.amities.filter((x) => !(x.id === id && (x.demandeur === u || x.destinataire === u))); save(); },

    // ----- Notifications -----
    pushDispo: false,
    async listNotifs() {
      const u = meId();
      return clone(db.notifications.filter((n) => n.user_id === u).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 80));
    },
    async nbNotifsNonLues() { const u = meId(); return db.notifications.filter((n) => n.user_id === u && !n.lu).length; },
    async lireNotif(id) { const n = db.notifications.find((x) => x.id === id && x.user_id === meId()); if (n) n.lu = true; save(); },
    async lireNotifsLien(lien) { const u = meId(); db.notifications.forEach((n) => { if (n.user_id === u && n.lien === lien) n.lu = true; }); save(); },
    async toutLire() { const u = meId(); db.notifications.forEach((n) => { if (n.user_id === u) n.lu = true; }); save(); },
    subscribeNotifs(cb) { notifListeners.add(cb); return () => notifListeners.delete(cb); },
    async savePushSub() { err('Les notifications sur le téléphone marcheront une fois Supabase branché'); },
    async deletePushSub() {},

    // ----- Chat (démo : synchronisé entre onglets du même navigateur + réponses simulées) -----
    async listConversations() {
      const u = meId();
      const rooms = [
        ...db.membres.filter((m) => m.user_id === u && !getD(m.defi_id)?.solo).map((m) => ({ kind: 'd', id: m.defi_id, nom: getD(m.defi_id)?.nom, type: getD(m.defi_id)?.type,
          membres: db.membres.filter((x) => x.defi_id === m.defi_id).map((x) => ({ user_id: x.user_id, pseudo: pseudoOf(x.user_id) })) })),
        ...db.conversations.filter((c) => c.membres.includes(u)).map((c) => ({ kind: 'c', id: c.id, nom: c.nom,
          membres: c.membres.map((x) => ({ user_id: x, pseudo: pseudoOf(x) })) })),
      ];
      rooms.forEach((r) => {
        r.messages = db.messages.filter((x) => roomOf(x) === r.kind + r.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((x) => ({ ...x, pseudo: pseudoOf(x.user_id) }));
      });
      return clone(rooms);
    },
    async getRoom(kind, id) {
      if (kind === 'd') {
        const B = await this.getDefi(id);
        return { kind, id, nom: B.defi.nom, type: B.defi.type, membres: B.membres.map((m) => ({ user_id: m.user_id, pseudo: m.pseudo })) };
      }
      const c = db.conversations.find((x) => x.id === id && x.membres.includes(meId()));
      if (!c) err('Conversation introuvable');
      return { kind, id, nom: c.nom, membres: c.membres.map((x) => ({ user_id: x, pseudo: pseudoOf(x) })) };
    },
    async getMessages(kind, id) {
      if (!canWrite(kind, id) && !(kind === 'd' && isAdmin())) err('Ce salon est réservé à ses membres');
      return clone(db.messages.filter((x) => roomOf(x) === kind + id).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-150)
        .map((x) => ({ ...x, pseudo: pseudoOf(x.user_id) })));
    },
    async sendMessage(kind, id, contenu, type = 'texte', data = {}) {
      if (!canWrite(kind, id)) err('Rejoins le défi pour écrire ici');
      const m = { id: newId(), defi_id: kind === 'd' ? id : null, conv_id: kind === 'c' ? id : null, user_id: meId(),
        contenu, type, data, reponses: [], created_at: new Date().toISOString() };
      db.messages.push(m);
      notifierMessage(m);
      save(); emit();
      simuler(kind, id, m);
    },
    async repondre(messageId, valeur) {
      const m = db.messages.find((x) => x.id === messageId);
      const [k, i] = [m?.defi_id ? 'd' : 'c', m?.defi_id || m?.conv_id];
      if (!m || m.type === 'texte' || !canWrite(k, i)) err('Action impossible');
      m.reponses = m.reponses.filter((r) => r.user_id !== sessionId);
      if (valeur != null) m.reponses.push({ user_id: sessionId, valeur });
      save(); emit();
    },
    async updateMessageData(messageId, data) {
      const m = db.messages.find((x) => x.id === messageId);
      if (!m || m.user_id !== meId()) err("Seul l'auteur peut faire ça");
      const etait = m.data?.statut;
      m.data = data;
      if (m.type === 'proposition' && data.statut === 'booké' && etait !== 'booké') {
        const { lien, dests } = salonDe(m);
        dests.filter((u) => u !== m.user_id).forEach((u) => notify(u, 'booke', "C'est booké ! 🎉", `${data.titre}${data.date ? ' — ' + data.date.slice(8, 10) + '/' + data.date.slice(5, 7) : ''}${data.heure ? ' à ' + data.heure : ''}`, lien));
      }
      save(); emit();
    },
    async creerConversation(userIds, nom = '') {
      const u = meId();
      const amis = db.amities.filter((a) => a.statut === 'acceptée' && (a.demandeur === u || a.destinataire === u)).map((a) => (a.demandeur === u ? a.destinataire : a.demandeur));
      if (userIds.some((x) => x !== u && !amis.includes(x))) err("Tu ne peux discuter qu'avec tes amis");
      const tous = [...new Set([...userIds, u])];
      if (tous.length < 2) err('Choisis au moins un ami');
      nom = (nom || '').trim();
      if (tous.length === 2 && !nom) {
        const ex = db.conversations.find((c) => !c.nom && c.membres.length === 2 && tous.every((x) => c.membres.includes(x)));
        if (ex) return ex.id;
      }
      const c = { id: 'c' + newId(), nom, created_by: u, membres: tous };
      db.conversations.push(c); save(); return c.id;
    },
    async quitterConversation(id) {
      const c = db.conversations.find((x) => x.id === id);
      if (c) c.membres = c.membres.filter((x) => x !== meId());
      save();
    },
    subscribe(kind, id, onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },

    async adminUsers() {
      if (!isAdmin()) err('Réservé aux admins');
      return db.profiles.map((p) => ({
        id: p.id, pseudo: p.pseudo, email: p.email, role: p.role, bloque: p.bloque, sexe: p.sexe || 'N', created_at: p.created_at,
        last_sign_in_at: null, nb_defis: db.membres.filter((m) => m.user_id === p.id).length,
      }));
    },
    async adminSetRole(id, role) {
      if (!isAdmin()) err('Réservé aux admins');
      if (id === sessionId) err('Tu ne peux pas changer ton propre rôle');
      db.profiles.find((p) => p.id === id).role = role; save();
    },
    async adminSetBlocked(id, b) {
      if (!isAdmin()) err('Réservé aux admins');
      if (id === sessionId) err('Tu ne peux pas te bloquer toi-même');
      db.profiles.find((p) => p.id === id).bloque = b; save();
    },
    async adminDeleteUser(id) {
      if (!isAdmin()) err('Réservé aux admins');
      if (id === sessionId) err('Tu ne peux pas supprimer ton propre compte ici');
      const sesDefis = db.defis.filter((d) => d.created_by === id).map((d) => d.id);
      db.defis = db.defis.filter((d) => !sesDefis.includes(d.id));
      const keep = (x) => !sesDefis.includes(x.defi_id);
      db.membres = db.membres.filter((m) => keep(m) && m.user_id !== id);
      db.suivi = db.suivi.filter((x) => keep(x) && x.user_id !== id);
      db.ecarts = db.ecarts.filter((x) => keep(x) && x.joueur !== id && x.signale_par !== id);
      db.invitations = db.invitations.filter((x) => keep(x) && x.to_user !== id && x.from_user !== id);
      db.amities = db.amities.filter((a) => a.demandeur !== id && a.destinataire !== id);
      db.messages = db.messages.filter((m) => (!m.defi_id || keep(m)) && m.user_id !== id);
      db.messages.forEach((m) => { m.reponses = m.reponses.filter((r) => r.user_id !== id); });
      db.conversations.forEach((c) => { c.membres = c.membres.filter((x) => x !== id); });
      db.profiles = db.profiles.filter((p) => p.id !== id);
      save();
    },
  };
})();