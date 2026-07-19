-- ============================================================
-- Mise à jour n°8 — Tournées réservées aux admins + pierres tombales
-- (SQL Editor → Run)
-- ============================================================

-- Création et suppression de tournées : administrateurs uniquement.
-- (La modification reste ouverte à tous : les exclusions d'adresses
--  supprimées y sont enregistrées par les comptes Normal.)

drop policy if exists "tournees : creation" on public.tournees;
create policy "tournees : creation (admin)" on public.tournees
  for insert to authenticated with check (public.est_admin());

drop policy if exists "tournees : suppression" on public.tournees;
create policy "tournees : suppression (admin)" on public.tournees
  for delete to authenticated using (public.est_admin());

-- Pierres tombales : trace de chaque suppression, pour qu'un appareil resté
-- hors ligne ne « ressuscite » pas des données supprimées en les repoussant.

create table public.suppressions (
  id uuid primary key,
  table_nom text not null,
  supprime_le timestamptz not null default now()
);

alter table public.suppressions enable row level security;

create policy "suppressions : lecture" on public.suppressions
  for select to authenticated using (true);
create policy "suppressions : ecriture" on public.suppressions
  for insert to authenticated with check (true);
