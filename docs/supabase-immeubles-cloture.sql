-- ============================================================
-- Mise à jour n°10 — Clôture par équipe + immeubles (SQL Editor → Run)
-- ============================================================

-- ---------- Immeubles : type de bâtiment et appartements ----------

alter table public.adresses
  add column if not exists type_batiment text not null default 'maison'
  check (type_batiment in ('maison', 'immeuble'));

alter table public.adresses
  add column if not exists appartements jsonb not null default '[]';

-- ---------- Clôture et montants : équipe de la tournée + admins ----------

create or replace function public.membre_de_tournee(tournee uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.est_admin() or exists (
    select 1
    from public.equipes e
    where e.tournee_id = tournee
      and e.membres ? auth.uid()::text
  );
$$;

drop policy if exists "decomptes : creation" on public.decomptes;
create policy "decomptes : creation (équipe)" on public.decomptes
  for insert to authenticated with check (public.membre_de_tournee(tournee_id));

drop policy if exists "decomptes : modification" on public.decomptes;
create policy "decomptes : modification (équipe)" on public.decomptes
  for update to authenticated using (public.membre_de_tournee(tournee_id));
