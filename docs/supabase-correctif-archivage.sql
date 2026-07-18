-- ============================================================
-- Correctif n°5 — archivage (SQL Editor → Run)
-- La protection « safeupdate » de Supabase exige un filtre WHERE
-- sur chaque mise à jour : on en ajoute un qui couvre tout.
-- ============================================================

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
  set calendriers_annee_derniere = s.distribues,
      modifie_le = now()
  from (
    select tournee_id, sum(coalesce(calendriers_laisses, 1))::int as distribues
    from adresses
    where statut = 'distribue'
    group by tournee_id
  ) s
  where s.tournee_id = t.id;

  update adresses
  set statut_precedent = case when statut = 'a_faire' then statut_precedent else statut end,
      statut = 'a_faire',
      somme = null,
      calendriers_laisses = null,
      rappel_le = null,
      modifie_le = now()
  where id is not null;

  update campagnes
  set statut = 'archivee', archivee_le = now(), modifie_le = now()
  where id = campagne;
end;
$$;
