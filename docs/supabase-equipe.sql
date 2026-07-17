-- ============================================================
-- Mise à jour n°2 — Écran Équipe (à coller dans SQL Editor → Run)
-- ============================================================

-- L'e-mail de connexion devient visible dans les profils
alter table public.profils add column if not exists email text not null default '';
update public.profils p
set email = u.email
from auth.users u
where u.id = p.id and p.email = '';

-- Le trigger de création de profil enregistre désormais l'e-mail
create or replace function public.creer_profil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profils (id, nom, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nom', split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    case when (select count(*) from public.profils) = 0 then 'admin' else 'normal' end
  );
  return new;
end;
$$;

-- Qui est administrateur ? (fonction utilitaire pour les règles de sécurité)
create or replace function public.est_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.profils where id = auth.uid() and role = 'admin');
$$;

-- Les admins peuvent modifier tous les profils (nom, centre, rôle…)
drop policy if exists "profils : admin modifie tout" on public.profils;
create policy "profils : admin modifie tout"
  on public.profils for update to authenticated using (public.est_admin());

-- Garde-fou : un compte non-admin ne peut pas changer les rôles
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
  return new;
end;
$$;

drop trigger if exists proteger_role_profils on public.profils;
create trigger proteger_role_profils
before update on public.profils
for each row execute function public.proteger_role();
