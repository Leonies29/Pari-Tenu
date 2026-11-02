/* Couche de données — version Supabase (vrais comptes, données partagées) */
(function () {
  const cfg = window.APP_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) return;

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const ok = ({ data, error }) => { if (error) throw new Error(traduire(error.message)); return data; };
  const uidNow = async () => (await sb.auth.getUser()).data.user?.id;

  function traduire(m) {
    const t = {
      'Invalid login credentials': 'Email ou mot de passe incorrect',
      'User already registered': 'Un compte existe déjà avec cet email',
      'Email not confirmed': 'Confirme ton email (regarde ta boîte mail) avant de te connecter',
      'Password should be at least 6 characters': 'Le mot de passe doit faire au moins 6 caractères',
    };
    return t[m] || m;
  }

  async function profil(id) {
    return ok(await sb.from('profiles').select('id, pseudo, role, bloque, tuto_vu, sexe').eq('id', id).maybeSingle());
  }

  window.api = {
    mode: 'supabase',

    async session() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      if (!u) return null;
      const p = await profil(u.id);
      if (!p) return null;
      if (p.bloque) { await sb.auth.signOut(); throw new Error('Ton compte a été bloqué par un admin'); }
      const priv = ok(await sb.from('profils_prives').select('naissance, partage_anniv').eq('id', u.id).maybeSingle());
      return { ...p, email: u.email, naissance: priv?.naissance || null, partage_anniv: !!priv?.partage_anniv };
    },

    async signUp(email, password, pseudo, sexe = 'N', naissance = null, partageAnniv = false) {
      if (!ok(await sb.rpc('pseudo_disponible', { p: pseudo }))) throw new Error('Ce pseudo est déjà pris');
      const data = ok(await sb.auth.signUp({
        email, password,
        options: { data: { pseudo, sexe, naissance, partage_anniv: partageAnniv ? 'true' : 'false' }, emailRedirectTo: location.href.split('#')[0] },
      }));
      return { needsConfirm: !data.session };
    },

    async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
    async signOut() { await sb.auth.signOut(); },
    async resetPassword(email) {
      ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] }));
    },

    // Tous les défis que je peux voir (RLS filtre : publics, les miens, invitations, tout si admin)
    async listDefis() {
      const rows = ok(await sb.from('defis')
        .select('*, membres(user_id, profiles(pseudo))')
        .order('date_debut', { ascending: false }));
      return rows.map((d) => ({
        ...d,
        membres: (d.membres || []).map((m) => ({ user_id: m.user_id, pseudo: m.profiles?.pseudo || '?' })),
      }));
    },

    async getDefi(id) {
      const [d, m, s, e, i] = await Promise.all([
        sb.from('defis').select('*').eq('id', id).maybeSingle(),
        sb.from('membres').select('*, profiles(pseudo, sexe)').eq('defi_id', id).order('joined_at'),
        sb.from('suivi').select('*').eq('defi_id', id).order('date'),
        sb.from('ecarts').select('*').eq('defi_id', id).order('date', { ascending: false }),
        sb.from('invitations').select('id, to_user, statut, profiles!invitations_to_user_fkey(pseudo)')
          .eq('defi_id', id).eq('statut', 'en attente'),
      ]);
      const defi = ok(d);
      if (!defi) throw new Error('Ce défi est introuvable ou privé');
      const membres = ok(m).map((x) => ({ ...x, pseudo: x.profiles?.pseudo || '?', sexe: x.profiles?.sexe || 'N' }));
      const ecarts = ok(e);
      const pseudos = Object.fromEntries(membres.map((x) => [x.user_id, x.pseudo]));
      const manquants = [...new Set(ecarts.flatMap((x) => [x.joueur, x.signale_par]))].filter((x) => !pseudos[x]);
      if (manquants.length) {
        ok(await sb.from('profiles').select('id, pseudo').in('id', manquants)).forEach((p) => { pseudos[p.id] = p.pseudo; });
      }
      return {
        defi, membres, suivi: ok(s), ecarts, pseudos,
        invitations: ok(i).map((x) => ({ id: x.id, to_user: x.to_user, pseudo: x.profiles?.pseudo || '?' })),
      };
    },

    // Crée ou modifie un défi. À la création, le créateur devient membre avec son objectif.
    async saveDefi(defi, monObjectif) {
      const champs = ['nom', 'type', 'date_debut', 'date_fin', 'frequence_saisie', 'recompense', 'sanction_finale', 'visibilite', 'solo'];
      const row = Object.fromEntries(champs.map((c) => [c, defi[c]]));
      if (defi.id) {
        ok(await sb.from('defis').update(row).eq('id', defi.id));
        return defi.id;
      }
      const created = ok(await sb.from('defis').insert(row).select('id').single());
      ok(await sb.from('membres').insert({ defi_id: created.id, user_id: await uidNow(), ...monObjectif }));
      return created.id;
    },

    async deleteDefi(id) { ok(await sb.from('defis').delete().eq('id', id)); },

    async updateMembership(defiId, fields) {
      ok(await sb.from('membres').update(fields).eq('defi_id', defiId).eq('user_id', await uidNow()));
    },
    async join(defiId) { ok(await sb.rpc('rejoindre_defi', { d: defiId })); },
    async leave(defiId) {
      ok(await sb.from('membres').delete().eq('defi_id', defiId).eq('user_id', await uidNow()));
    },
    async removeMember(defiId, userId) {
      ok(await sb.from('membres').delete().eq('defi_id', defiId).eq('user_id', userId));
    },

    async invite(defiId, pseudo) { return ok(await sb.rpc('inviter', { d: defiId, p: pseudo })); },
    async cancelInvitation(id) { ok(await sb.from('invitations').delete().eq('id', id)); },
    async myInvitations() {
      const me = await uidNow();
      const rows = ok(await sb.from('invitations')
        .select('id, defi_id, defis(nom, type), profiles!invitations_from_user_fkey(pseudo)')
        .eq('to_user', me).eq('statut', 'en attente'));
      return rows.map((r) => ({ id: r.id, defi_id: r.defi_id, defi_nom: r.defis?.nom, type: r.defis?.type, from_pseudo: r.profiles?.pseudo }));
    },
    async respond(id, accept) { ok(await sb.rpc('repondre_invitation', { inv: id, accepter: accept })); },

    async addSuivi(defiId, date, valeur, remplacer) {
      const me = await uidNow();
      if (remplacer) ok(await sb.from('suivi').delete().eq('defi_id', defiId).eq('user_id', me).eq('date', date));
      ok(await sb.from('suivi').insert({ defi_id: defiId, user_id: me, date, valeur }));
    },

    async addEcart(e) {
      ok(await sb.from('ecarts').insert({ ...e, signale_par: await uidNow() }));
    },
    async updateEcart(id, fields) { ok(await sb.from('ecarts').update(fields).eq('id', id)); },
    async deleteEcart(id) { ok(await sb.from('ecarts').delete().eq('id', id)); },

    async setTutoVu(v = true) { ok(await sb.from('profiles').update({ tuto_vu: v }).eq('id', await uidNow())); },
    async updateProfil({ pseudo, sexe, naissance, partage_anniv = false }) {
      const me = await uidNow();
      const p = await profil(me);
      if (p.pseudo.toLowerCase() !== pseudo.toLowerCase() && !ok(await sb.rpc('pseudo_disponible', { p: pseudo }))) {
        throw new Error('Ce pseudo est déjà pris');
      }
      ok(await sb.from('profiles').update({ pseudo, sexe }).eq('id', me));
      ok(await sb.from('profils_prives').upsert({ id: me, naissance: naissance || null, partage_anniv }));
    },
    async anniversairesAmis(mmjj) { return ok(await sb.rpc('anniversaires_amis', { jour: mmjj })); },

    // ----- Amis -----
    async listAmis() {
      const me = await uidNow();
      const rows = ok(await sb.from('amities')
        .select('id, demandeur, destinataire, statut, d:profiles!amities_demandeur_fkey(pseudo, sexe), r:profiles!amities_destinataire_fkey(pseudo, sexe)'));
      const out = { amis: [], recues: [], envoyees: [] };
      for (const a of rows) {
        const other = a.demandeur === me ? { user_id: a.destinataire, pseudo: a.r?.pseudo, sexe: a.r?.sexe } : { user_id: a.demandeur, pseudo: a.d?.pseudo, sexe: a.d?.sexe };
        const item = { id: a.id, ...other };
        if (a.statut === 'acceptée') out.amis.push(item);
        else if (a.destinataire === me) out.recues.push(item);
        else out.envoyees.push(item);
      }
      out.amis.sort((x, y) => String(x.pseudo).localeCompare(y.pseudo));
      return out;
    },
    async demanderAmi(pseudo) { return ok(await sb.rpc('demander_ami', { p: pseudo })); },
    async repondreAmi(id, accept) { ok(await sb.rpc('repondre_ami', { a: id, accepter: accept })); },
    async supprimerAmi(id) { ok(await sb.from('amities').delete().eq('id', id)); },

    // ----- Chat en direct -----
    // Un salon = { kind: 'd' (défi) | 'c' (conversation privée), id }
    async listConversations() {
      const me = await uidNow();
      const [defs, convs] = await Promise.all([
        sb.from('membres').select('defi_id, defis(nom, type, solo, membres(user_id, profiles(pseudo)))').eq('user_id', me),
        sb.from('conv_membres').select('conv_id, conversations(nom, conv_membres(user_id, profiles(pseudo)))').eq('user_id', me),
      ]);
      const rooms = [
        ...ok(defs).filter((m) => !m.defis?.solo).map((m) => ({ kind: 'd', id: m.defi_id, nom: m.defis?.nom, type: m.defis?.type,
          membres: (m.defis?.membres || []).map((x) => ({ user_id: x.user_id, pseudo: x.profiles?.pseudo })) })),
        ...ok(convs).map((m) => ({ kind: 'c', id: m.conv_id, nom: m.conversations?.nom || '',
          membres: (m.conversations?.conv_membres || []).map((x) => ({ user_id: x.user_id, pseudo: x.profiles?.pseudo })) })),
      ];
      const dIds = rooms.filter((r) => r.kind === 'd').map((r) => r.id);
      const cIds = rooms.filter((r) => r.kind === 'c').map((r) => r.id);
      const q = (col, ids) => ids.length ? sb.from('messages').select('defi_id, conv_id, user_id, type, contenu, data, created_at, profiles!messages_user_id_fkey(pseudo)')
        .in(col, ids).order('created_at', { ascending: false }).limit(400) : Promise.resolve({ data: [] });
      const [md, mc] = await Promise.all([q('defi_id', dIds), q('conv_id', cIds)]);
      const msgs = [...ok(md), ...ok(mc)].map((x) => ({ ...x, pseudo: x.profiles?.pseudo || '?' }));
      rooms.forEach((r) => { r.messages = msgs.filter((x) => (r.kind === 'd' ? x.defi_id : x.conv_id) === r.id); });
      return rooms;
    },
    async getRoom(kind, id) {
      if (kind === 'd') {
        const B = await this.getDefi(id);
        return { kind, id, nom: B.defi.nom, type: B.defi.type, membres: B.membres.map((m) => ({ user_id: m.user_id, pseudo: m.pseudo })) };
      }
      const c = ok(await sb.from('conversations').select('id, nom, conv_membres(user_id, profiles(pseudo))').eq('id', id).maybeSingle());
      if (!c) throw new Error('Conversation introuvable');
      return { kind, id, nom: c.nom, membres: c.conv_membres.map((x) => ({ user_id: x.user_id, pseudo: x.profiles?.pseudo || '?' })) };
    },
    async getMessages(kind, id) {
      const rows = ok(await sb.from('messages').select('*, profiles!messages_user_id_fkey(pseudo), reponses(user_id, valeur)')
        .eq(kind === 'd' ? 'defi_id' : 'conv_id', id).order('created_at', { ascending: false }).limit(150));
      return rows.reverse().map((x) => ({ ...x, pseudo: x.profiles?.pseudo || '?', reponses: x.reponses || [] }));
    },
    async sendMessage(kind, id, contenu, type = 'texte', data = {}) {
      ok(await sb.from('messages').insert({ [kind === 'd' ? 'defi_id' : 'conv_id']: id, user_id: await uidNow(), contenu, type, data }));
    },
    async repondre(messageId, valeur) {
      const me = await uidNow();
      if (valeur == null) ok(await sb.from('reponses').delete().eq('message_id', messageId).eq('user_id', me));
      else ok(await sb.from('reponses').upsert({ message_id: messageId, user_id: me, valeur, updated_at: new Date().toISOString() }));
    },
    async updateMessageData(messageId, data) { ok(await sb.from('messages').update({ data }).eq('id', messageId)); },
    async creerConversation(userIds, nom = '') { return ok(await sb.rpc('creer_conversation', { membres: userIds, p_nom: nom })); },
    async quitterConversation(id) { ok(await sb.from('conv_membres').delete().eq('conv_id', id).eq('user_id', await uidNow())); },
    // Écoute en direct (nouveaux messages, bookings, réponses) ; renvoie une fonction pour arrêter
    subscribe(kind, id, onChange) {
      const col = kind === 'd' ? 'defi_id' : 'conv_id';
      const ch = sb.channel(`room-${kind}-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `${col}=eq.${id}` }, () => onChange())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reponses' }, () => onChange())
        .subscribe();
      return () => sb.removeChannel(ch);
    },

    // ----- Admin -----
    async adminUsers() { return ok(await sb.rpc('admin_liste_utilisateurs')); },
    async adminSetRole(id, role) { ok(await sb.rpc('admin_set_role', { u: id, r: role })); },
    async adminSetBlocked(id, b) { ok(await sb.rpc('admin_set_bloque', { u: id, b })); },
    async adminDeleteUser(id) { ok(await sb.rpc('admin_supprimer_utilisateur', { u: id })); },
  };
})();