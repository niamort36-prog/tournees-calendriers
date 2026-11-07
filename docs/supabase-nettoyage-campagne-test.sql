-- ============================================================
-- Nettoyage des traces de la campagne de TEST
-- (déjà exécuté le 25/10/2026 — reste ce dernier décompte, qui
--  n'était rattaché à aucune campagne et avait donc échappé au script)
-- ============================================================

delete from public.decomptes
where id = '1306fc1e-38de-4ac8-b6dc-bd4a089d333c';
