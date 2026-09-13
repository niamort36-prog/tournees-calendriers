-- ============================================================
-- Mise à jour n°11 — Lots de calendriers donnés (SQL Editor → Run)
-- Exemple : calendriers remis aux JSP, à la mairie, aux commerçants…
-- ============================================================

alter table public.campagnes
  add column if not exists lots jsonb not null default '[]';
