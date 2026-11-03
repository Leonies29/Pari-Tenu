-- =====================================================================
--  Pari tenu — NOTIFICATIONS (cloche dans l'app + notifications téléphone)
--  À lancer UNE fois dans Supabase > SQL Editor (base déjà existante).
--  (Déjà inclus dans schema.sql pour une nouvelle installation.)
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

-- Une notification = une ligne pour une personne
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles on delete cascade,   -- destinataire
  type        text not null,          -- invitation, ami, ecart, sanction, message, booke, membre, rappel, anniv
  titre       text not null,
  texte       text not null default '',
  lien        text not null default '#/',   -- page de l'app à ouvrir
  lu          boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user on public.notifications (user_id, lu, created_at desc);

-- Les téléphones abonnés aux notifications (un par appareil)
create table if not exists public.push_abonnements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

alter table public.notifications    enable row level security;
alter table public.push_abonnements enable row level security;

drop policy if exists "mes notifications" on public.notifications;
drop policy if exists "lire mes notifications" on public.notifications;
drop policy if exists "effacer mes notifications" on public.notifications;
create policy "mes notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "lire mes notifications" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "effacer mes notifications" on public.notifications for delete to authenticated using (user_id = auth.uid());
revoke update on public.notifications from authenticated, anon;
grant update (lu) on public.notifications to authenticated;     -- on peut seulement marquer « lu »

drop policy if exists "mes abonnements" on public.push_abonnements;
create policy "mes abonnements" on public.push_abonnements for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Fonction d'envoi ------------------------------------------
-- fusion = true : si une notif non lue du même type vers la même page existe, on la met à jour
-- (évite 30 notifications pour 30 messages d'une même conversation)
create or replace function public.notifier(dest uuid, p_type text, p_titre text, p_texte text, p_lien text, fusion boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if dest is null or exists (select 1 from profiles where id = dest and bloque) then return; end if;
  if fusion then
    update notifications set titre = p_titre, texte = p_texte, created_at = now()
     where user_id = dest and type = p_type and lien = p_lien and not lu;
    if found then return; end if;
  end if;
  insert into notifications (user_id, type, titre, texte, lien) values (dest, p_type, p_titre, left(p_texte, 240), p_lien);
end $$;
revoke execute on function public.notifier(uuid, text, text, text, text, boolean) from public, anon, authenticated;

create or replace function public.pseudo_de(u uuid) returns text
language sql stable security definer set search_path = public as $$ select coalesce((select pseudo from profiles where id = u), 'Quelqu''un') $$;

-- ---------- Déclencheurs ----------------------------------------------

-- Invitation à un défi
create or replace function public.trg_notif_invitation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'en attente' and (tg_op = 'INSERT' or old.statut <> 'en attente' or old.from_user <> new.from_user) then
    perform notifier(new.to_user, 'invitation', 'Invitation à un défi',
      pseudo_de(new.from_user) || ' t''invite à « ' || (select nom from defis where id = new.defi_id) || ' »', '#/defi/' || new.defi_id);
  end if;
  return new;
end $$;
drop trigger if exists notif_invitation on public.invitations;
create trigger notif_invitation after insert or update on public.invitations for each row execute function public.trg_notif_invitation();

-- Demandes d'ami
create or replace function public.trg_notif_amitie() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.statut = 'en attente' then
    perform notifier(new.destinataire, 'ami', 'Demande d''ami', pseudo_de(new.demandeur) || ' veut t''ajouter en ami', '#/amis');
  elsif tg_op = 'UPDATE' and new.statut = 'acceptée' and old.statut <> 'acceptée' then
    perform notifier(new.demandeur, 'ami', 'Nouvel ami 🎉', pseudo_de(new.destinataire) || ' a accepté ta demande', '#/amis');
  end if;
  return new;
end $$;
drop trigger if exists notif_amitie on public.amities;
create trigger notif_amitie after insert or update on public.amities for each row execute function public.trg_notif_amitie();

-- Quelqu'un rejoint un défi
create or replace function public.trg_notif_membre() returns trigger
language plpgsql security definer set search_path = public as $$
declare dest uuid; nom_defi text;
begin
  select nom into nom_defi from defis where id = new.defi_id;
  for dest in select user_id from membres where defi_id = new.defi_id and user_id <> new.user_id loop
    perform notifier(dest, 'membre', 'Nouveau dans le défi', pseudo_de(new.user_id) || ' a rejoint « ' || nom_defi || ' »', '#/defi/' || new.defi_id);
  end loop;
  return new;
end $$;
drop trigger if exists notif_membre on public.membres;
create trigger notif_membre after insert on public.membres for each row execute function public.trg_notif_membre();

-- Écarts et sanctions
create or replace function public.trg_notif_ecart() returns trigger
language plpgsql security definer set search_path = public as $$
declare dest uuid; nom_defi text; lien text := '#/defi/' || new.defi_id; qui text := pseudo_de(new.joueur);
begin
  select nom into nom_defi from defis where id = new.defi_id;
  if tg_op = 'INSERT' then
    if new.signale_par <> new.joueur then
      perform notifier(new.joueur, 'ecart', 'Écart signalé', pseudo_de(new.signale_par) || ' a signalé un écart pour toi dans « ' || nom_defi || ' »', lien);
    end if;
    for dest in select user_id from membres where defi_id = new.defi_id and user_id not in (new.joueur, new.signale_par) loop
      perform notifier(dest, 'ecart', 'Quelqu''un a flanché', qui || ' a flanché dans « ' || nom_defi || ' »', lien);
    end loop;
  else
    if coalesce(new.sanction, '') <> '' and new.sanction is distinct from old.sanction then
      for dest in select user_id from membres where defi_id = new.defi_id and user_id <> coalesce(auth.uid(), new.signale_par) loop
        perform notifier(dest, 'sanction', 'Sanction à valider', 'Pour ' || qui || ' : ' || new.sanction, lien);
      end loop;
    end if;
    if new.statut = 'décidée' and old.statut <> 'décidée' then
      perform notifier(new.joueur, 'sanction', 'Ta sanction est décidée', new.sanction, lien);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists notif_ecart on public.ecarts;
create trigger notif_ecart after insert or update on public.ecarts for each row execute function public.trg_notif_ecart();

-- Messages, sorties proposées, sondages, bookings
create or replace function public.trg_notif_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare dest uuid; titre text; lien text; auteur text := pseudo_de(new.user_id); texte text; dests uuid[];
begin
  if new.defi_id is not null then
    select nom into titre from defis where id = new.defi_id;
    lien := '#/chat/d/' || new.defi_id;
    dests := array(select user_id from membres where defi_id = new.defi_id and user_id <> new.user_id);
  else
    select nullif(nom, '') into titre from conversations where id = new.conv_id;
    lien := '#/chat/c/' || new.conv_id;
    dests := array(select user_id from conv_membres where conv_id = new.conv_id and user_id <> new.user_id);
  end if;

  if tg_op = 'INSERT' then
    texte := auteur || ' : ' || case new.type
      when 'proposition' then 'qui est dispo ? ' || coalesce(new.data ->> 'titre', '') || coalesce(' le ' || to_char((new.data ->> 'date')::date, 'DD/MM'), '') || coalesce(' à ' || (new.data ->> 'heure'), '')
      when 'sondage' then 'nouveau sondage : ' || coalesce(new.data ->> 'question', '')
      else new.contenu end;
    foreach dest in array dests loop
      perform notifier(dest, 'message', coalesce(titre, auteur), texte, lien, true);
    end loop;
  elsif new.type = 'proposition' and new.data ->> 'statut' = 'booké' and old.data ->> 'statut' is distinct from 'booké' then
    texte := coalesce(new.data ->> 'titre', 'Sortie') || coalesce(' — ' || to_char((new.data ->> 'date')::date, 'DD/MM'), '') || coalesce(' à ' || (new.data ->> 'heure'), '');
    foreach dest in array dests loop
      perform notifier(dest, 'booke', 'C''est booké ! 🎉', texte, lien);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists notif_message on public.messages;
create trigger notif_message after insert or update on public.messages for each row execute function public.trg_notif_message();

-- ---------- Rappels et anniversaires (lancés automatiquement chaque jour) ----------
-- Rappel « pense à noter » pour les défis suivis chaque jour / semaine / mois, sans saisie récente
create or replace function public.notifs_rappels() returns void
language plpgsql security definer set search_path = public as $$
declare jour date := (now() at time zone 'Europe/Paris')::date; r record;
begin
  for r in
    select m.user_id, d.id, d.nom, d.frequence_saisie,
           case d.frequence_saisie when 'jour' then 1 when 'semaine' then 7 else 30 end as fenetre
      from membres m join defis d on d.id = m.defi_id
     where jour between d.date_debut and d.date_fin and d.frequence_saisie in ('jour', 'semaine', 'mois')
  loop
    if not exists (select 1 from suivi s where s.defi_id = r.id and s.user_id = r.user_id and s.date > jour - r.fenetre)
       and not exists (select 1 from notifications n where n.user_id = r.user_id and n.type = 'rappel' and n.lien = '#/defi/' || r.id
                         and n.created_at > now() - make_interval(days => r.fenetre) + interval '2 hours') then
      perform notifier(r.user_id, 'rappel', 'Petit rappel 🌿',
        'Pense à noter ' || case r.frequence_saisie when 'jour' then 'ta journée' when 'semaine' then 'ta semaine' else 'ton mois' end || ' pour « ' || r.nom || ' »',
        '#/defi/' || r.id);
    end if;
  end loop;
  delete from notifications where created_at < now() - interval '60 days';   -- ménage
end $$;

-- Joyeux anniversaire (à soi) + prévenir les amis si la personne l'a choisi
create or replace function public.notifs_anniversaires() returns void
language plpgsql security definer set search_path = public as $$
declare jour text := to_char((now() at time zone 'Europe/Paris')::date, 'MM-DD'); p record; ami uuid;
begin
  for p in select pr.id, pr.pseudo, pp.partage_anniv from profiles pr join profils_prives pp on pp.id = pr.id
            where not pr.bloque and to_char(pp.naissance, 'MM-DD') = jour loop
    perform notifier(p.id, 'anniv', 'Joyeux anniversaire ' || p.pseudo || ' ! 🎂', 'Toute la team Pari tenu te souhaite une super journée', '#/');
    if p.partage_anniv then
      for ami in select case when a.demandeur = p.id then a.destinataire else a.demandeur end
                   from amities a where a.statut = 'acceptée' and p.id in (a.demandeur, a.destinataire) loop
        perform notifier(ami, 'anniv', 'Anniversaire 🎂', 'C''est l''anniversaire de ' || p.pseudo || ' aujourd''hui !', '#/amis');
      end loop;
    end if;
  end loop;
end $$;
revoke execute on function public.notifs_rappels(), public.notifs_anniversaires() from public, anon, authenticated;

-- ---------- Temps réel : la cloche se met à jour toute seule ----------
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;