-- ============================================================
-- Mise à jour n°4 — Campagnes et archivage (SQL Editor → Run)
-- ============================================================

-- ---------- Campagnes ----------

create table public.campagnes (
  id uuid primary key,
  nom text not null,
  calendriers_commandes integer,
  taille_paquet integer,
  statut text not null default 'active' check (statut in ('active', 'archivee')),
  cree_le timestamptz not null default now(),
  archivee_le timestamptz,
  modifie_le timestamptz not null default now()
);

alter table public.campagnes enable row level security;

create policy "campagnes : lecture" on public.campagnes
  for select to authenticated using (true);
create policy "campagnes : creation (admin)" on public.campagnes
  for insert to authenticated with check (public.est_admin());
create policy "campagnes : modification (admin)" on public.campagnes
  for update to authenticated using (public.est_admin());
create policy "campagnes : suppression (admin)" on public.campagnes
  for delete to authenticated using (public.est_admin());

alter publication supabase_realtime add table public.campagnes;

-- ---------- Mémoire de l'année précédente sur chaque adresse ----------

alter table public.adresses add column if not exists statut_precedent text;

-- ---------- Archives (photo complète de chaque campagne) ----------

create table public.archives_adresses (
  id uuid primary key default gen_random_uuid(),
  campagne_id uuid not null references public.campagnes (id) on delete cascade,
  tournee_id uuid,
  tournee_nom text not null default '',
  adresse_id uuid,
  ban_id text,
  libelle text,
  commune text,
  statut text,
  somme double precision,
  calendriers_laisses integer,
  note text
);

alter table public.archives_adresses enable row level security;

create policy "archives : lecture" on public.archives_adresses
  for select to authenticated using (true);

-- ---------- Archivage d'une campagne (opération atomique, admin) ----------
-- 1. photographie toutes les adresses dans les archives ;
-- 2. met à jour « distribués l'an dernier » de chaque tournée ;
-- 3. remet tous les pings à « à faire » en gardant le statut de l'année
--    dans statut_precedent (les notes sont conservées) ;
-- 4. marque la campagne archivée.

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
      modifie_le = now();

  update campagnes
  set statut = 'archivee', archivee_le = now(), modifie_le = now()
  where id = campagne;
end;
$$;
