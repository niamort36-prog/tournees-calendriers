-- ============================================================
-- Correctif n°3 — protection des rôles (à coller dans SQL Editor → Run)
-- Le garde-fou bloquait aussi la fonction serveur d'administration
-- (contexte serveur = pas d'utilisateur connecté → autorisé).
-- ============================================================

create or replace function public.proteger_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.est_admin() then
    raise exception 'Seul un administrateur peut changer les rôles.';
  end if;
  return new;
end;
$$;
