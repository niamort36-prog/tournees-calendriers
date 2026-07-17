-- ============================================================
-- Schéma de la base Supabase — Tournées Calendriers
-- À coller tel quel dans : Dashboard Supabase → SQL Editor → Run
-- ============================================================

-- ---------- Profils (un par compte, avec le rôle) ----------

create table public.profils (
  id uuid primary key references auth.users (id) on delete cascade,
  nom text not null default '',
  role text not null default 'normal' check (role in ('admin', 'normal')),
  centre text not null default '',
  cree_le timestamptz not null default now()
);

-- À la création d'un compte : profil automatique.
-- Le tout premier compte créé devient administrateur.
create or replace function public.creer_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profils (id, nom, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', split_part(new.email, '@', 1)),
    case when (select count(*) from public.profils) = 0 then 'admin' else 'normal' end
  );
  return new;
end;
$$;

create trigger creer_profil_apres_inscription
after insert on auth.users
for each row execute function public.creer_profil();

-- ---------- Tournées ----------

create table public.tournees (
  id uuid primary key,
  nom text not null,
  couleur text not null default '#e63946',
  polygone jsonb not null default '[]',
  dispo_conseillee text not null default '',
  calendriers_annee_derniere integer,
  ban_ids_exclus jsonb not null default '[]',
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now()
);

-- ---------- Adresses (pings) ----------

create table public.adresses (
  id uuid primary key,
  tournee_id uuid not null references public.tournees (id) on delete cascade,
  ban_id text,
  manuelle boolean not null default false,
  libelle text not null,
  commune text not null default '',
  code_postal text not null default '',
  lat double precision not null,
  lng double precision not null,
  autres_adresses jsonb not null default '[]',
  statut text not null default 'a_faire'
    check (statut in ('a_faire', 'distribue', 'absent', 'refus')),
  somme double precision,
  calendriers_laisses integer,
  rappel_le timestamptz,
  note text,
  modifie_le timestamptz not null default now()
);

create index adresses_par_tournee on public.adresses (tournee_id);

-- ---------- Sécurité (RLS) : accès réservé aux comptes connectés ----------
-- (v1 : tous les connectés lisent et écrivent ; l'affinage par rôle — par ex.
--  validation des modifications des comptes Normal — viendra en phase suivante)

alter table public.profils enable row level security;
alter table public.tournees enable row level security;
alter table public.adresses enable row level security;

create policy "profils : lecture par les connectés"
  on public.profils for select to authenticated using (true);
create policy "profils : chacun modifie le sien"
  on public.profils for update to authenticated using (auth.uid() = id);

create policy "tournees : lecture" on public.tournees
  for select to authenticated using (true);
create policy "tournees : creation" on public.tournees
  for insert to authenticated with check (true);
create policy "tournees : modification" on public.tournees
  for update to authenticated using (true);
create policy "tournees : suppression" on public.tournees
  for delete to authenticated using (true);

create policy "adresses : lecture" on public.adresses
  for select to authenticated using (true);
create policy "adresses : creation" on public.adresses
  for insert to authenticated with check (true);
create policy "adresses : modification" on public.adresses
  for update to authenticated using (true);
create policy "adresses : suppression" on public.adresses
  for delete to authenticated using (true);

-- ---------- Temps réel : diffusion des changements ----------

alter publication supabase_realtime add table public.tournees;
alter publication supabase_realtime add table public.adresses;
