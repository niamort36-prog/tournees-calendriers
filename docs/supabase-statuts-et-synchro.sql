-- ============================================================
-- Mise à jour n°13 — Nouveaux statuts + fiabilité de la synchro
-- (SQL Editor → Run)
--
--  • statuts « inhabité » et « maison secondaire »
--  • ces deux statuts sont conservés d'une campagne à l'autre
--  • heure du serveur, pour aligner les horloges des téléphones
--  • garde-fou : une écriture en retard n'écrase plus une version récente
-- ============================================================

-- ---------- 1. Heure officielle du serveur ----------
create or replace function public.maintenant()
returns timestamptz
language sql
stable
as $$ select now() $$;

grant execute on function public.maintenant() to authenticated, anon;

-- ---------- 2. Les deux nouveaux statuts ----------
-- (on retire d'abord l'ancienne contrainte, quel que soit son nom)
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.adresses'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%statut%'
      and pg_get_constraintdef(oid) ilike '%a_faire%'
  loop
    execute format('alter table public.adresses drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.adresses
  add constraint adresses_statut_check
  check (statut in ('a_faire', 'distribue', 'absent', 'refus', 'inhabite', 'secondaire'));

-- ---------- 3. Garde-fou contre les écritures en retard ----------
create or replace function public.proteger_ecriture_obsolete()
returns trigger
language plpgsql
as $$
begin
  -- un appareil dont l'horloge avance beaucoup empoisonnerait la ligne
  if new.modifie_le > now() + interval '5 minutes' then
    new.modifie_le := now();
  end if;
  -- une écriture nettement en retard (file hors ligne rejouée tardivement)
  -- ne doit pas écraser une version plus récente
  if tg_op = 'UPDATE' and new.modifie_le < old.modifie_le - interval '1 hour' then
    return null;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['adresses', 'tournees', 'campagnes', 'equipes', 'decomptes']
  loop
    execute format('drop trigger if exists proteger_obsolete on public.%I', t);
    execute format(
      'create trigger proteger_obsolete before insert or update on public.%I
       for each row execute function public.proteger_ecriture_obsolete()', t);
  end loop;
end $$;

-- ---------- 4. Archivage : garder « inhabité » et « maison secondaire » ----------
create or replace function public.archiver_campagne(campagne uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    raise exception 'Archivage réservé aux administrateurs.';
  end if;

  insert into archives_adresses
    (campagne_id, tournee_id, tournee_nom, adresse_id, ban_id, libelle, commune,
     statut, somme, calendriers_laisses, note)
  select campagne, a.tournee_id, t.nom, a.id, a.ban_id, a.libelle, a.commune,
         a.statut, a.somme, a.calendriers_laisses, a.note
  from adresses a
  join tournees t on t.id = a.tournee_id;

  update tournees t
  set calendriers_annee_derniere = coalesce(
        (select d.calendriers_distribues
           from decomptes d
          where d.tournee_id = t.id
            and d.campagne_id = campagne
            and d.termine
            and d.calendriers_distribues is not null
          order by d.modifie_le desc
          limit 1),
        (select sum(coalesce(a.calendriers_laisses, 1))::int
           from adresses a
          where a.tournee_id = t.id and a.statut = 'distribue'),
        t.calendriers_annee_derniere),
      modifie_le = now()
  where t.id is not null;

  -- « inhabité » et « maison secondaire » sont des caractéristiques du
  -- logement : elles restent d'une année sur l'autre.
  update adresses
  set statut_precedent = case when statut = 'a_faire' then statut_precedent else statut end,
      statut = case
                 when statut in ('inhabite', 'secondaire') then statut
                 else 'a_faire'
               end,
      somme = null,
      calendriers_laisses = null,
      rappel_le = null,
      -- note et note_le ne sont VOLONTAIREMENT pas effacés : un commentaire
      -- (« chien méchant », « passer après 18 h ») reste vrai d'une année sur
      -- l'autre. Ne pas les ajouter ici lors d'une future mise à jour.
      modifie_le = now()
  where id is not null;

  update campagnes
  set statut = 'archivee', archivee_le = now(), modifie_le = now()
  where id = campagne;
end;
$$;
