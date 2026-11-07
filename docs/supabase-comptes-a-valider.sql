-- ============================================================
-- Mise à jour n°14 — Les nouveaux comptes doivent être validés
-- (SQL Editor → Run)
--
-- Jusqu'ici, n'importe qui pouvait créer un compte et voyait
-- immédiatement toutes les tournées et toutes les adresses.
-- Désormais un compte ne voit rien tant qu'un administrateur ne
-- l'a pas validé dans la fenêtre « 👥 Membres ».
--
-- IMPORTANT : tous les comptes qui existent aujourd'hui sont
-- validés automatiquement, pour ne bloquer personne en pleine
-- tournée. Passez ensuite la liste des membres en revue et
-- retirez (⛔) ou supprimez (🗑️) ceux que vous ne connaissez pas.
-- ============================================================

-- ---------- 1. La colonne « validé » ----------
alter table public.profils
  add column if not exists approuve boolean not null default false;

-- les comptes déjà en place restent utilisables
update public.profils set approuve = true where id is not null;

-- ---------- 2. Un nouveau compte arrive « en attente » ----------
-- (sauf le tout premier compte de l'amicale, qui est l'administrateur)
create or replace function public.creer_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare premier boolean;
begin
  premier := (select count(*) from public.profils) = 0;
  insert into public.profils (id, nom, role, approuve)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', split_part(new.email, '@', 1)),
    case when premier then 'admin' else 'normal' end,
    premier
  );
  return new;
end;
$$;

-- ---------- 3. Personne ne se valide soi-même ----------
create or replace function public.proteger_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.est_admin() then
    raise exception 'Seul un administrateur peut changer les rôles.';
  end if;
  if new.approuve is distinct from old.approuve and not public.est_admin() then
    raise exception 'Seul un administrateur peut valider un compte.';
  end if;
  return new;
end;
$$;

-- ---------- 4. Un compte en attente ne voit rien ----------
create or replace function public.est_approuve()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select approuve from public.profils where id = auth.uid()), false)
$$;

grant execute on function public.est_approuve() to authenticated;

-- Chaque table reçoit la même règle : il faut être validé.
-- (les règles « admin » déjà en place continuent de s'appliquer par-dessus)
do $$
declare t text;
begin
  foreach t in array array[
    'tournees', 'adresses', 'campagnes', 'equipes', 'decomptes',
    'archives_adresses', 'journal', 'suppressions'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists "%s : compte validé" on public.%I', t, t);
    execute format(
      'create policy "%s : compte validé" on public.%I
       as restrictive for all to authenticated
       using (public.est_approuve()) with check (public.est_approuve())', t, t);
  end loop;
end $$;

-- Un compte en attente peut lire SON profil (pour afficher le message
-- d'attente) mais pas l'annuaire de l'amicale.
drop policy if exists "profils : lecture par les connectés" on public.profils;
create policy "profils : lecture par les connectés"
  on public.profils for select to authenticated
  using (auth.uid() = id or public.est_approuve());

-- ---------- 5. Vérification ----------
-- Comptes en attente de validation (doit être vide juste après cette mise à jour) :
--   select nom, role from public.profils where not approuve;

-- En cas de besoin — rouvrir l'accès à un compte depuis le SQL Editor
-- (par exemple si le dernier administrateur se retrouvait bloqué) :
--   update public.profils set approuve = true where nom = 'Roy Romain';
