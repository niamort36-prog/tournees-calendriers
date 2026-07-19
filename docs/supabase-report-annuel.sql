-- ============================================================
-- Mise à jour n°9 — Report annuel et protection des tournées
-- (SQL Editor → Run)
-- ============================================================

-- Un compte Normal ne peut modifier d'une tournée que les exclusions
-- d'adresses : les autres champs (nom, contour, dispo conseillée,
-- distribués l'an dernier, couleur) sont conservés silencieusement.
-- (Le contexte serveur — fonctions d'archivage — reste libre.)

create or replace function public.proteger_tournee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.est_admin() then
    new.nom := old.nom;
    new.couleur := old.couleur;
    new.polygone := old.polygone;
    new.dispo_conseillee := old.dispo_conseillee;
    new.calendriers_annee_derniere := old.calendriers_annee_derniere;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_tournee_maj on public.tournees;
create trigger proteger_tournee_maj
before update on public.tournees
for each row execute function public.proteger_tournee();

-- Archivage : « distribués l'an dernier » est repris en priorité du nombre
-- VALIDÉ au décompte de fin de tournée (sinon du comptage des pings verts,
-- sinon l'ancienne valeur est conservée).

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
