-- ============================================================
-- Mise à jour n°6 — Équipes de tournée (SQL Editor → Run)
-- ============================================================

create table public.equipes (
  id uuid primary key,
  nom text not null,
  membres jsonb not null default '[]',
  tournee_id uuid references public.tournees (id) on delete set null,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);

alter table public.equipes enable row level security;

create policy "equipes : lecture" on public.equipes
  for select to authenticated using (true);
create policy "equipes : creation (admin)" on public.equipes
  for insert to authenticated with check (public.est_admin());
create policy "equipes : modification (admin)" on public.equipes
  for update to authenticated using (public.est_admin());
create policy "equipes : suppression (admin)" on public.equipes
  for delete to authenticated using (public.est_admin());

alter publication supabase_realtime add table public.equipes;
