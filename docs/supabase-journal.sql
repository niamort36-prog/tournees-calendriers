-- ============================================================
-- Mise à jour n°12 — Journal des modifications d'adresses
-- + date de saisie des commentaires   (SQL Editor → Run)
-- ============================================================

-- Date à laquelle le commentaire d'une adresse a été écrit
alter table public.adresses add column if not exists note_le timestamptz;

-- Journal : créations, suppressions, renommages et déplacements d'adresses
create table if not exists public.journal (
  id uuid primary key,
  type text not null check (type in ('creation', 'suppression', 'renommage', 'deplacement', 'commentaire')),
  adresse_id uuid,
  libelle text not null default '',
  detail text not null default '',
  tournee_id uuid,
  tournee_nom text not null default '',
  lat double precision,
  lng double precision,
  auteur_id uuid,
  auteur_nom text not null default '',
  quand timestamptz not null default now()
);

create index if not exists journal_par_date on public.journal (quand desc);

alter table public.journal enable row level security;

-- Lecture réservée aux administrateurs ; tout le monde peut consigner.
drop policy if exists "journal : lecture (admin)" on public.journal;
create policy "journal : lecture (admin)" on public.journal
  for select to authenticated using (public.est_admin());

drop policy if exists "journal : ecriture" on public.journal;
create policy "journal : ecriture" on public.journal
  for insert to authenticated with check (true);
