// Configuration Supabase (base de données partagée + comptes).
// Ces deux valeurs sont « publiques » par conception (la sécurité repose sur
// les règles RLS côté serveur) : elles peuvent être dans le code sans risque.
// Tant qu'elles sont vides, l'application fonctionne en mode local (démo).

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
