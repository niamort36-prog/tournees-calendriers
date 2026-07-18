-- ============================================================
-- Mise à jour n°7 — Fin de tournée et décomptes (SQL Editor → Run)
-- Un décompte par tournée et par campagne : participants, demi-journées
-- (avec la voiture utilisée), espèces par coupure, chèques, CB, total.
-- ============================================================

create table public.decomptes (
  id uuid primary key,
  tournee_id uuid not null references public.tournees (id) on delete cascade,
  campagne_id uuid references public.campagnes (id) on delete set null,
  participants jsonb not null default '[]',
  seances jsonb not null default '[]',
  especes jsonb not null default '{}',
  cheques jsonb not null default '[]',
  cb double precision,
  calendriers_distribues integer,
  termine boolean not null default false,
  termine_le timestamptz,
  numero_recu integer,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);

create index decomptes_par_tournee on public.decomptes (tournee_id);

alter table public.decomptes enable row level security;

create policy "decomptes : lecture" on public.decomptes
  for select to authenticated using (true);
create policy "decomptes : creation" on public.decomptes
  for insert to authenticated with check (true);
create policy "decomptes : modification" on public.decomptes
  for update to authenticated using (true);
create policy "decomptes : suppression (admin)" on public.decomptes
  for delete to authenticated using (public.est_admin());

alter publication supabase_realtime add table public.decomptes;
