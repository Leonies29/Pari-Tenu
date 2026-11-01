-- =====================================================================
--  Pari tenu — schéma Supabase
--  À coller dans Supabase > SQL Editor > New query, puis "Run".
--  Ne le lance qu'une seule fois (sur un projet vide).
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

-- Profil public de chaque compte (créé automatiquement à l'inscription)
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  pseudo      text not null unique check (char_length(pseudo) between 2 and 30),
  role        text not null default 'user' check (role in ('user', 'admin')),
  bloque      boolean not null default false,
  tuto_vu     boolean not null default false,   -- tutoriel de bienvenue déjà vu ou passé
  sexe        text not null default 'N' check (sexe in ('F', 'H', 'N')),  -- pour accorder les textes (N = neutre)
  created_at  timestamptz not null default now()
);
create unique index profiles_pseudo_lower on public.profiles (lower(pseudo));

-- Données privées : visibles uniquement par la personne elle-même
create table public.profils_prives (
  id         uuid primary key references public.profiles on delete cascade,
  naissance      date check (naissance between '1900-01-01' and current_date),
  partage_anniv  boolean not null default false   -- prévenir mes amis le jour de mon anniversaire ?
);

create table public.defis (
  id                uuid primary key default gen_random_uuid(),
  nom               text not null check (char_length(nom) between 1 and 80),
  type              text not null default 'autre' check (type in ('poids', 'sport', 'tabac', 'autre')),
  date_debut        date not null,
  date_fin          date not null,
  frequence_saisie  text not null default 'jour' check (frequence_saisie in ('jour', 'semaine')),
  recompense        text not null default '',
  sanction_finale   text not null default '',
  visibilite        text not null default 'prive' check (visibilite in ('prive', 'public')),
  solo              boolean not null default false,   -- défi perso, sans invités
  created_by        uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at        timestamptz not null default now(),
  check (date_fin >= date_debut),
  check (not solo or visibilite = 'prive')
);

-- Qui participe à quel défi, avec son objectif perso
create table public.membres (
  defi_id        uuid not null references public.defis on delete cascade,
  user_id        uuid not null references public.profiles on delete cascade,
  objectif       text not null default '',
  valeur_depart  numeric,
  valeur_cible   numeric,
  unite          text not null default '',
  joined_at      timestamptz not null default now(),
  primary key (defi_id, user_id)
);

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  defi_id     uuid not null references public.defis on delete cascade,
  from_user   uuid not null references public.profiles on delete cascade,
  to_user     uuid not null references public.profiles on delete cascade,
  statut      text not null default 'en attente' check (statut in ('en attente', 'acceptée', 'refusée')),
  created_at  timestamptz not null default now(),
  unique (defi_id, to_user)
);

-- Saisies : pesée, séance (= 1), cigarettes du jour, défi libre fait (= 1)
create table public.suivi (
  id          uuid primary key default gen_random_uuid(),
  defi_id     uuid not null references public.defis on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  date        date not null default current_date,
  valeur      numeric not null default 1,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create table public.ecarts (
  id           uuid primary key default gen_random_uuid(),
  defi_id      uuid not null references public.defis on delete cascade,
  joueur       uuid not null references public.profiles on delete cascade,
  signale_par  uuid not null default auth.uid() references public.profiles on delete cascade,
  date         date not null default current_date,
  description  text not null default '',
  sanction     text not null default '',
  valide_par   uuid[] not null default '{}',
  statut       text not null default 'à décider' check (statut in ('à décider', 'décidée', 'faite')),
  created_at   timestamptz not null default now()
);

create index on public.membres (user_id);
create index on public.invitations (to_user);
create index on public.suivi (defi_id);
create index on public.ecarts (defi_id);

-- ---------- Création automatique du profil à l'inscription -------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare p text; sx text; nais date;
begin
  p := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'pseudo'), ''), split_part(new.email, '@', 1)), 30);
  -- pseudo trop court ou déjà pris : on en génère un (modifiable ensuite)
  if char_length(p) < 2 or exists (select 1 from public.profiles where lower(pseudo) = lower(p)) then
    p := 'joueur_' || left(replace(new.id::text, '-', ''), 8);
  end if;
  sx := upper(coalesce(new.raw_user_meta_data ->> 'sexe', 'N'));
  if sx not in ('F', 'H', 'N') then sx := 'N'; end if;
  insert into public.profiles (id, pseudo, sexe) values (new.id, p, sx);
  begin
    nais := (new.raw_user_meta_data ->> 'naissance')::date;   -- date invalide → ignorée
  exception when others then nais := null;
  end;
  if nais < '1900-01-01' or nais > current_date then nais := null; end if;
  insert into public.profils_prives (id, naissance, partage_anniv)
  values (new.id, nais, coalesce(new.raw_user_meta_data ->> 'partage_anniv', 'false') = 'true');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Fonctions utilitaires (utilisées par les règles d'accès) ---

create or replace function public.is_actif() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and not bloque)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and not bloque)
$$;

create or replace function public.is_member(d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from membres where defi_id = d and user_id = auth.uid())
$$;

-- Un défi est visible si : public, ou j'en suis membre / créateur, ou j'y suis invité, ou je suis admin
create or replace function public.can_see_defi(d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_actif() and (
       is_admin()
    or exists (select 1 from defis where id = d and (visibilite = 'public' or created_by = auth.uid()))
    or exists (select 1 from membres where defi_id = d and user_id = auth.uid())
    or exists (select 1 from invitations where defi_id = d and to_user = auth.uid() and statut = 'en attente')
  )
$$;

-- ---------- Règles d'accès (Row Level Security) ------------------------

alter table public.profiles    enable row level security;
alter table public.defis       enable row level security;
alter table public.membres     enable row level security;
alter table public.invitations enable row level security;
alter table public.suivi       enable row level security;
alter table public.ecarts      enable row level security;

-- Profils : tout le monde (connecté) voit les pseudos ; on ne modifie que son pseudo
create policy "profils visibles" on public.profiles for select to authenticated using (true);
create policy "modifier son profil" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (pseudo, tuto_vu, sexe) on public.profiles to authenticated;

alter table public.profils_prives enable row level security;
create policy "voir mes infos privées" on public.profils_prives for select to authenticated using (id = auth.uid());
create policy "modifier mes infos privées" on public.profils_prives for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "créer mes infos privées" on public.profils_prives for insert to authenticated with check (id = auth.uid());

-- Défis
create policy "voir défis" on public.defis for select to authenticated
  using (is_actif() and (created_by = auth.uid() or visibilite = 'public' or can_see_defi(id)));
create policy "créer défi" on public.defis for insert to authenticated
  with check (created_by = auth.uid() and is_actif());
create policy "modifier défi" on public.defis for update to authenticated
  using (created_by = auth.uid() or is_admin()) with check (created_by = auth.uid() or is_admin());
create policy "supprimer défi" on public.defis for delete to authenticated
  using (created_by = auth.uid() or is_admin());

-- Membres (rejoindre / accepter une invitation passe par les fonctions plus bas)
create policy "voir membres" on public.membres for select to authenticated using (can_see_defi(defi_id));
create policy "créateur rejoint son défi" on public.membres for insert to authenticated
  with check (user_id = auth.uid() and is_actif()
              and exists (select 1 from defis where id = defi_id and created_by = auth.uid()));
create policy "modifier son objectif" on public.membres for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "quitter ou retirer" on public.membres for delete to authenticated
  using (user_id = auth.uid() or is_admin()
         or exists (select 1 from defis where id = defi_id and created_by = auth.uid()));

-- Invitations (création / réponse via fonctions)
create policy "voir invitations" on public.invitations for select to authenticated
  using (to_user = auth.uid() or from_user = auth.uid() or is_member(defi_id) or is_admin());
create policy "annuler invitation" on public.invitations for delete to authenticated
  using (from_user = auth.uid() or is_admin());

-- Suivi : chacun ne saisit que ses propres données
create policy "voir suivi" on public.suivi for select to authenticated using (can_see_defi(defi_id));
create policy "saisir son suivi" on public.suivi for insert to authenticated
  with check (user_id = auth.uid() and is_member(defi_id) and is_actif());
create policy "modifier son suivi" on public.suivi for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "supprimer son suivi" on public.suivi for delete to authenticated using (user_id = auth.uid());

-- Écarts : un membre peut avouer ou signaler un autre membre, et tous votent la sanction
create policy "voir écarts" on public.ecarts for select to authenticated using (can_see_defi(defi_id));
create policy "déclarer écart" on public.ecarts for insert to authenticated
  with check (signale_par = auth.uid() and is_member(defi_id) and is_actif()
              and exists (select 1 from membres m where m.defi_id = ecarts.defi_id and m.user_id = ecarts.joueur));
create policy "voter sanction" on public.ecarts for update to authenticated
  using (is_member(defi_id) and is_actif()) with check (is_member(defi_id));
create policy "supprimer écart" on public.ecarts for delete to authenticated
  using (signale_par = auth.uid() or is_admin());

-- ---------- Fonctions appelées par l'app ------------------------------

-- Vérifier qu'un pseudo est libre (utilisable avant inscription)
create or replace function public.pseudo_disponible(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where lower(pseudo) = lower(trim(p)))
$$;

-- Inviter un pote par son pseudo
create or replace function public.inviter(d uuid, p text) returns text
language plpgsql security definer set search_path = public as $$
declare cible uuid;
begin
  if not is_actif() or not is_member(d) then
    raise exception 'Tu dois faire partie du défi pour inviter quelqu''un';
  end if;
  if exists (select 1 from defis where id = d and solo) then
    raise exception 'C''est un défi solo : passe-le en défi entre potes pour inviter quelqu''un';
  end if;
  select id into cible from profiles where lower(pseudo) = lower(trim(p)) and not bloque;
  if cible is null then raise exception 'Aucun compte avec le pseudo « % »', p; end if;
  if exists (select 1 from membres where defi_id = d and user_id = cible) then
    raise exception '% fait déjà partie du défi', p;
  end if;
  insert into invitations (defi_id, from_user, to_user)
  values (d, auth.uid(), cible)
  on conflict (defi_id, to_user) do update set statut = 'en attente', from_user = auth.uid(), created_at = now();
  return 'Invitation envoyée';
end $$;

-- Accepter / refuser une invitation
create or replace function public.repondre_invitation(inv uuid, accepter boolean) returns void
language plpgsql security definer set search_path = public as $$
declare i invitations;
begin
  select * into i from invitations where id = inv and to_user = auth.uid() and statut = 'en attente';
  if i.id is null or not is_actif() then raise exception 'Invitation introuvable'; end if;
  update invitations set statut = case when accepter then 'acceptée' else 'refusée' end where id = inv;
  if accepter then
    insert into membres (defi_id, user_id) values (i.defi_id, auth.uid()) on conflict do nothing;
  end if;
end $$;

-- Rejoindre un défi public
create or replace function public.rejoindre_defi(d uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_actif() or not exists (select 1 from defis where id = d and visibilite = 'public') then
    raise exception 'Ce défi est privé : il faut une invitation';
  end if;
  insert into membres (defi_id, user_id) values (d, auth.uid()) on conflict do nothing;
  update invitations set statut = 'acceptée' where defi_id = d and to_user = auth.uid();
end $$;

-- ---------- Administration --------------------------------------------

create or replace function public.admin_liste_utilisateurs()
returns table (id uuid, pseudo text, email text, role text, bloque boolean, sexe text,
               created_at timestamptz, last_sign_in_at timestamptz, nb_defis bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Réservé aux admins'; end if;
  return query
    select p.id, p.pseudo, u.email::text, p.role, p.bloque, p.sexe, p.created_at, u.last_sign_in_at,
           (select count(*) from membres m where m.user_id = p.id)
    from profiles p join auth.users u on u.id = p.id
    order by p.created_at;
end $$;

create or replace function public.admin_set_role(u uuid, r text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Réservé aux admins'; end if;
  if u = auth.uid() then raise exception 'Tu ne peux pas changer ton propre rôle'; end if;
  update profiles set role = r where id = u;
end $$;

create or replace function public.admin_set_bloque(u uuid, b boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Réservé aux admins'; end if;
  if u = auth.uid() then raise exception 'Tu ne peux pas te bloquer toi-même'; end if;
  update profiles set bloque = b where id = u;
end $$;

-- Supprimer définitivement un compte (et, par cascade, tout ce qui lui appartient)
create or replace function public.admin_supprimer_utilisateur(u uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not is_admin() then raise exception 'Réservé aux admins'; end if;
  if u = auth.uid() then raise exception 'Tu ne peux pas supprimer ton propre compte ici'; end if;
  delete from auth.users where id = u;
end $$;
revoke execute on function public.admin_supprimer_utilisateur(uuid) from public, anon;
grant execute on function public.admin_supprimer_utilisateur(uuid) to authenticated;

-- Seuls les comptes connectés peuvent appeler les fonctions (sauf pseudo_disponible)
revoke execute on function public.inviter(uuid, text), public.repondre_invitation(uuid, boolean),
  public.rejoindre_defi(uuid), public.admin_liste_utilisateurs(), public.admin_set_role(uuid, text),
  public.admin_set_bloque(uuid, boolean) from public, anon;
grant execute on function public.inviter(uuid, text), public.repondre_invitation(uuid, boolean),
  public.rejoindre_defi(uuid), public.admin_liste_utilisateurs(), public.admin_set_role(uuid, text),
  public.admin_set_bloque(uuid, boolean) to authenticated;
grant execute on function public.pseudo_disponible(text) to anon, authenticated;


-- ---------- Chat en direct --------------------------------------------
-- Deux sortes de salons : le salon d'un défi (ses membres) et les conversations
-- privées (à deux ou en groupe d'amis). Les messages peuvent être du texte,
-- une proposition de moment (« dispo samedi 20h au resto ? ») ou un sondage.

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null default '',          -- vide = conversation à deux
  created_by  uuid default auth.uid() references public.profiles on delete set null,  -- le groupe survit à son créateur
  created_at  timestamptz not null default now()
);

create table public.conv_membres (
  conv_id  uuid not null references public.conversations on delete cascade,
  user_id  uuid not null references public.profiles on delete cascade,
  primary key (conv_id, user_id)
);
create index on public.conv_membres (user_id);

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  defi_id     uuid references public.defis on delete cascade,
  conv_id     uuid references public.conversations on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  type        text not null default 'texte' check (type in ('texte', 'proposition', 'sondage')),
  contenu     text not null default '' check (char_length(contenu) <= 1000),
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  check ((defi_id is null) <> (conv_id is null)),
  check (type <> 'texte' or char_length(trim(contenu)) >= 1)
);
create index on public.messages (defi_id, created_at desc);
create index on public.messages (conv_id, created_at desc);

-- Réponses aux propositions (oui / peut-etre / non) et votes aux sondages (numéro d'option)
create table public.reponses (
  message_id  uuid not null references public.messages on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  valeur      text not null check (char_length(valeur) between 1 and 20),
  updated_at  timestamptz not null default now(),
  primary key (message_id, user_id)
);

create or replace function public.is_conv_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conv_membres where conv_id = c and user_id = auth.uid())
$$;

create or replace function public.can_read_room(d uuid, c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_actif() and ((d is not null and (is_member(d) or is_admin())) or (c is not null and is_conv_member(c)))
$$;

create or replace function public.can_write_room(d uuid, c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_actif() and ((d is not null and is_member(d)) or (c is not null and is_conv_member(c)))
$$;

create or replace function public.can_answer_message(m uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_write_room(defi_id, conv_id) from messages where id = m and type <> 'texte'), false)
$$;

alter table public.conversations enable row level security;
alter table public.conv_membres  enable row level security;
alter table public.messages      enable row level security;
alter table public.reponses      enable row level security;

create policy "voir mes conversations" on public.conversations for select to authenticated using (is_conv_member(id));
create policy "voir membres conv" on public.conv_membres for select to authenticated using (is_conv_member(conv_id));
create policy "quitter une conv" on public.conv_membres for delete to authenticated using (user_id = auth.uid());

create policy "lire messages" on public.messages for select to authenticated using (can_read_room(defi_id, conv_id));
create policy "écrire message" on public.messages for insert to authenticated
  with check (user_id = auth.uid() and can_write_room(defi_id, conv_id));
create policy "modifier son message" on public.messages for update to authenticated   -- ex. booker / clôturer
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "supprimer son message" on public.messages for delete to authenticated
  using (user_id = auth.uid() or is_admin());

create policy "voir réponses" on public.reponses for select to authenticated
  using (exists (select 1 from messages m where m.id = message_id));   -- filtré par la règle des messages
create policy "répondre" on public.reponses for insert to authenticated
  with check (user_id = auth.uid() and can_answer_message(message_id));
create policy "changer sa réponse" on public.reponses for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and can_answer_message(message_id));
create policy "retirer sa réponse" on public.reponses for delete to authenticated using (user_id = auth.uid());

-- Créer une conversation avec des amis (à deux : on réutilise celle qui existe déjà)
create or replace function public.creer_conversation(membres uuid[], p_nom text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare tous uuid[]; cid uuid; n text := coalesce(trim(p_nom), '');
begin
  if not is_actif() then raise exception 'Compte inactif'; end if;
  if exists (select 1 from unnest(membres) u where u <> auth.uid() and not exists (
      select 1 from amities a where a.statut = 'acceptée'
        and ((a.demandeur = auth.uid() and a.destinataire = u) or (a.destinataire = auth.uid() and a.demandeur = u)))) then
    raise exception 'Tu ne peux discuter qu''avec tes amis';
  end if;
  tous := array(select distinct x from unnest(membres || auth.uid()) x);
  if coalesce(array_length(tous, 1), 0) < 2 then raise exception 'Choisis au moins un ami'; end if;
  if array_length(tous, 1) = 2 and n = '' then
    select c.id into cid from conversations c
     where c.nom = ''
       and (select count(*) from conv_membres m where m.conv_id = c.id) = 2
       and (select count(*) from conv_membres m where m.conv_id = c.id and m.user_id = any (tous)) = 2
     limit 1;
    if cid is not null then return cid; end if;
  end if;
  insert into conversations (nom, created_by) values (n, auth.uid()) returning id into cid;
  insert into conv_membres (conv_id, user_id) select cid, x from unnest(tous) x;
  return cid;
end $$;

revoke execute on function public.creer_conversation(uuid[], text) from public, anon;
grant execute on function public.creer_conversation(uuid[], text) to authenticated;

-- Diffusion en temps réel
alter publication supabase_realtime add table public.messages, public.reponses;

-- ---------- Amis ------------------------------------------------------

create table public.amities (
  id           uuid primary key default gen_random_uuid(),
  demandeur    uuid not null references public.profiles on delete cascade,
  destinataire uuid not null references public.profiles on delete cascade,
  statut       text not null default 'en attente' check (statut in ('en attente', 'acceptée')),
  created_at   timestamptz not null default now(),
  check (demandeur <> destinataire)
);
-- une seule relation par paire, dans un sens ou dans l'autre
create unique index amities_paire on public.amities (least(demandeur, destinataire), greatest(demandeur, destinataire));
alter table public.amities enable row level security;

create policy "voir mes amitiés" on public.amities for select to authenticated
  using (is_actif() and auth.uid() in (demandeur, destinataire));
create policy "retirer un ami" on public.amities for delete to authenticated
  using (auth.uid() in (demandeur, destinataire));

-- Demander quelqu'un en ami par son pseudo (si l'autre m'avait déjà demandé : c'est accepté)
create or replace function public.demander_ami(p text) returns text
language plpgsql security definer set search_path = public as $$
declare cible uuid; a amities;
begin
  if not is_actif() then raise exception 'Compte inactif'; end if;
  select id into cible from profiles where lower(pseudo) = lower(trim(p)) and not bloque;
  if cible is null then raise exception 'Aucun compte avec le pseudo « % »', p; end if;
  if cible = auth.uid() then raise exception 'Tu ne peux pas t''ajouter toi-même 😉'; end if;
  select * into a from amities
   where least(demandeur, destinataire) = least(auth.uid(), cible) and greatest(demandeur, destinataire) = greatest(auth.uid(), cible);
  if a.id is null then
    insert into amities (demandeur, destinataire) values (auth.uid(), cible);
    return 'Demande envoyée';
  elsif a.statut = 'acceptée' then
    raise exception 'Vous êtes déjà amis';
  elsif a.destinataire = auth.uid() then
    update amities set statut = 'acceptée' where id = a.id;
    return 'Vous êtes maintenant amis 🎉';
  else
    raise exception 'Demande déjà envoyée';
  end if;
end $$;

-- Amis dont c'est l'anniversaire (jour = 'MM-JJ', fourni par l'appli pour être dans le bon fuseau horaire).
-- Seulement pour les amis qui ont choisi de partager leur anniversaire, et sans jamais renvoyer la date.
create or replace function public.anniversaires_amis(jour text) returns table (user_id uuid, pseudo text, sexe text)
language sql stable security definer set search_path = public as $$
  select p.id, p.pseudo, p.sexe
  from amities a
  join profiles p on p.id = case when a.demandeur = auth.uid() then a.destinataire else a.demandeur end
  join profils_prives pp on pp.id = p.id
  where a.statut = 'acceptée' and auth.uid() in (a.demandeur, a.destinataire) and not p.bloque
    and pp.partage_anniv and to_char(pp.naissance, 'MM-DD') = jour
$$;
revoke execute on function public.anniversaires_amis(text) from public, anon;
grant execute on function public.anniversaires_amis(text) to authenticated;

-- Accepter ou refuser une demande reçue (refuser = supprimer)
create or replace function public.repondre_ami(a uuid, accepter boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from amities where id = a and destinataire = auth.uid() and statut = 'en attente') then
    raise exception 'Demande introuvable';
  end if;
  if accepter then update amities set statut = 'acceptée' where id = a;
  else delete from amities where id = a; end if;
end $$;

revoke execute on function public.demander_ami(text), public.repondre_ami(uuid, boolean) from public, anon;
grant execute on function public.demander_ami(text), public.repondre_ami(uuid, boolean) to authenticated;

-- =====================================================================
--  APRÈS ta première inscription sur le site, deviens admin avec :
--    update public.profiles set role = 'admin' where pseudo = 'TonPseudo';
-- =====================================================================
