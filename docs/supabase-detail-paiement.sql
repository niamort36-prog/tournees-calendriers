-- ============================================================
-- Mise à jour n°15 — Détail du paiement maison par maison
-- (SQL Editor → Run)
--
-- Permet de noter, sur la fiche d'une maison, ce qui a été reçu :
-- pièces, billets, chèques et carte bancaire. Ces saisies servent
-- ensuite à PRÉ-REMPLIR le décompte de fin de tournée.
--
-- Le décompte reste entièrement modifiable à la main : c'est lui,
-- et lui seul, qui part sur le reçu.
--
-- Rien n'est modifié ni supprimé : on ajoute une colonne, vide pour
-- toutes les adresses existantes.
-- ============================================================

alter table public.adresses
  add column if not exists paiement jsonb;

comment on column public.adresses.paiement is
  'Détail de la somme reçue : { especes: {clé coupure: nombre}, cheques: [montants], cb: montant }. '
  'Sert à pré-remplir le décompte de fin de tournée ; null si non détaillé.';

-- ---------- Vérification ----------
-- La colonne doit apparaître dans la liste :
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'adresses'
--    order by ordinal_position;
