-- =====================================================================
--  Pari tenu — rappels et anniversaires automatiques, chaque jour
--  1) Supabase > Database > Extensions : cherche « pg_cron » et active-le
--  2) Puis lance ce fichier dans SQL Editor (une fois)
--  Les heures sont en heure universelle (UTC) :
--    18:00 UTC = 19h à Paris en hiver (20h en été)  → rappels « pense à noter »
--    07:00 UTC = 8h à Paris en hiver (9h en été)     → anniversaires
-- =====================================================================
select cron.schedule('pari-tenu-rappels',       '0 18 * * *', $$select public.notifs_rappels()$$);
select cron.schedule('pari-tenu-anniversaires', '0 7 * * *',  $$select public.notifs_anniversaires()$$);

-- Pour vérifier :   select jobname, schedule from cron.job;
-- Pour arrêter :    select cron.unschedule('pari-tenu-rappels');