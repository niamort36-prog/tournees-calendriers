// Fonction serveur « admin-utilisateurs » — réservée aux administrateurs.
// Crée les comptes des sapeurs-pompiers, change les mots de passe des comptes
// Normal, supprime des comptes. S'exécute chez Supabase avec la clé service
// (jamais exposée au navigateur).
//
// Déploiement : Dashboard Supabase → Edge Functions → Deploy a new function
// (via l'éditeur) → nom : admin-utilisateurs → coller ce fichier → Deploy.

import { createClient } from 'npm:@supabase/supabase-js@2';

const enTetesCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reponse(corps: Record<string, unknown>): Response {
  return new Response(JSON.stringify(corps), {
    headers: { ...enTetesCors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: enTetesCors });
  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Qui appelle ? (jeton de session envoyé par l'application)
    const jeton = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: utilisateurData } = await admin.auth.getUser(jeton);
    const appelant = utilisateurData?.user;
    if (!appelant) return reponse({ erreur: 'Non connecté.' });

    const { data: profilAppelant } = await admin
      .from('profils')
      .select('role')
      .eq('id', appelant.id)
      .single();
    if (profilAppelant?.role !== 'admin') {
      return reponse({ erreur: 'Action réservée aux administrateurs.' });
    }

    const corps = await req.json();

    if (corps.action === 'creer') {
      const { email, mdp, nom, role, centre } = corps;
      if (!email || !mdp || String(mdp).length < 6) {
        return reponse({ erreur: 'E-mail et mot de passe (6 caractères min.) obligatoires.' });
      }
      const creation = await admin.auth.admin.createUser({
        email: String(email),
        password: String(mdp),
        email_confirm: true,
        user_metadata: { nom: String(nom ?? '') },
      });
      if (creation.error) return reponse({ erreur: creation.error.message });
      await admin
        .from('profils')
        .update({
          nom: String(nom ?? ''),
          role: role === 'admin' ? 'admin' : 'normal',
          centre: String(centre ?? ''),
        })
        .eq('id', creation.data.user.id);
      return reponse({ ok: true, id: creation.data.user.id });
    }

    if (corps.action === 'mdp' || corps.action === 'supprimer') {
      const cibleId = String(corps.userId ?? '');
      const { data: profilCible } = await admin
        .from('profils')
        .select('role')
        .eq('id', cibleId)
        .single();
      if (!profilCible) return reponse({ erreur: 'Compte introuvable.' });

      if (corps.action === 'mdp') {
        // le mot de passe d'un autre admin ne peut pas être changé (sauf le sien)
        if (profilCible.role === 'admin' && cibleId !== appelant.id) {
          return reponse({ erreur: "Impossible de changer le mot de passe d'un autre administrateur." });
        }
        if (String(corps.mdp ?? '').length < 6) {
          return reponse({ erreur: 'Le mot de passe doit faire au moins 6 caractères.' });
        }
        const maj = await admin.auth.admin.updateUserById(cibleId, { password: String(corps.mdp) });
        if (maj.error) return reponse({ erreur: maj.error.message });
        return reponse({ ok: true });
      }

      // suppression
      if (cibleId === appelant.id) return reponse({ erreur: 'Impossible de supprimer son propre compte.' });
      if (profilCible.role === 'admin') {
        return reponse({ erreur: "Impossible de supprimer un administrateur (retirez-lui d'abord le rôle admin)." });
      }
      const suppression = await admin.auth.admin.deleteUser(cibleId);
      if (suppression.error) return reponse({ erreur: suppression.error.message });
      return reponse({ ok: true });
    }

    return reponse({ erreur: 'Action inconnue.' });
  } catch (e) {
    return reponse({ erreur: `Erreur interne : ${String(e)}` });
  }
});
