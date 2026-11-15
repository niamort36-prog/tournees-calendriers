-- ============================================================
--  Mise à jour n°16 — Une campagne neuve repart vraiment de zéro
--  Dashboard Supabase -> SQL Editor -> New query -> coller -> Run
--
--  On peut la coller DÈS MAINTENANT, en pleine campagne : elle ne
--  touche à AUCUNE adresse. Elle change seulement ce que fera le
--  bouton « 📦 Archiver la campagne », le jour où vous l'utiliserez.
--
--  À l'archivage, en plus de ce qui était déjà remis à zéro (statut,
--  somme, calendriers laissés, rappel) :
--    * le DÉTAIL DES PAIEMENTS de chaque maison est effacé (pièces,
--      billets, chèques, carte) : plus aucune trace de l'argent reçu
--      l'année précédente sur les fiches ;
--    * TOUS LES APPARTEMENTS des immeubles repassent « à faire »,
--      sans calendriers ni paiement. Seuls l'étage et le numéro sont
--      gardés. L'immeuble lui-même repasse « à faire ».
--
--  Rien d'autre ne change : positions, noms, adresses ajoutées ou
--  supprimées à la main, maison / immeuble, liste des appartements,
--  commentaires, statuts « inhabité » et « maison secondaire » des
--  maisons restent d'une année sur l'autre, comme avant.
--
--  Elle ajoute aussi une petite fonction « version_archivage » :
--  l'application vérifie sa présence avant d'archiver, et REFUSE
--  d'archiver tant que cette mise à jour n'est pas passée.
--
--  Base de départ : la version d'archiver_campagne de la mise à jour
--  n°13 (docs/supabase-statuts-et-synchro.sql), la dernière en place.
--  Les mises à jour n°14 et n°15 ne l'avaient pas modifiée.
-- ============================================================

begin;  -- FILET DE SECURITE : si une seule ligne echoue, RIEN n'est applique.

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

  -- Rappel : dans un UPDATE, toutes les expressions lisent l'état d'AVANT
  -- la modification (le « statut » lu ici est donc celui de cette année).
  update adresses
  set statut_precedent = case when statut = 'a_faire' then statut_precedent else statut end,
      statut = case
                 -- un immeuble découpé en appartements repart « à faire »,
                 -- comme tous ses appartements
                 when type_batiment = 'immeuble'
                      and jsonb_typeof(appartements) = 'array'
                      and jsonb_array_length(appartements) > 0 then 'a_faire'
                 -- « inhabité » et « maison secondaire » sont des
                 -- caractéristiques du logement : elles restent
                 when statut in ('inhabite', 'secondaire') then statut
                 else 'a_faire'
               end,
      somme = null,
      calendriers_laisses = null,
      rappel_le = null,
      -- détail de l'argent reçu (pièces, billets, chèques, carte) : effacé
      paiement = null,
      -- Appartements : on ne garde que l'identifiant, l'étage et le numéro.
      -- Statut remis à « à faire » ; calendriers pris et paiement disparaissent.
      -- L'ordre des appartements est conservé.
      appartements = case
                       when jsonb_typeof(appartements) = 'array'
                            and jsonb_array_length(appartements) > 0 then
                         (select jsonb_agg(
                                   jsonb_build_object(
                                     'id', coalesce(x.app -> 'id', to_jsonb(gen_random_uuid()::text)),
                                     'etage', coalesce(x.app -> 'etage', '""'::jsonb),
                                     'numero', coalesce(x.app -> 'numero', '""'::jsonb),
                                     'statut', 'a_faire')
                                   order by x.rang)
                            from jsonb_array_elements(appartements) with ordinality as x(app, rang))
                       else appartements
                     end,
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

-- L'application lit ce numéro avant d'archiver : sans lui, elle refuse.
create or replace function public.version_archivage()
returns integer
language sql
stable
as $$ select 16 $$;

grant execute on function public.version_archivage() to authenticated;

commit;

-- ------------------------------------------------------------
-- Vérification (facultative) — coller et lancer séparément :
--   select public.version_archivage();
-- doit répondre 16.
-- ------------------------------------------------------------
