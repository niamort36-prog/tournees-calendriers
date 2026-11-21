// Version de l'application, affichée dans Réglages → « Infos pour le
// dépannage » : identifiant du commit et date de la mise en ligne. Sert à
// vérifier qu'un téléphone a bien reçu la dernière version.
import { execSync } from 'node:child_process';

function commitCourant() {
  // GitHub Actions fournit l'identifiant du commit construit
  const ci = process.env.GITHUB_SHA;
  if (ci) return ci.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}

export default function versionAppli() {
  return {
    name: 'version-appli',
    config() {
      const parties = Object.fromEntries(
        new Intl.DateTimeFormat('fr-FR', {
          timeZone: 'Europe/Paris',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
          .formatToParts(new Date())
          .map((p) => [p.type, p.value]),
      );
      // « 21/11/2026 à 09:54 »
      const date = `${parties.day}/${parties.month}/${parties.year} à ${parties.hour}:${parties.minute}`;
      return { define: { __VERSION_APPLI__: JSON.stringify({ commit: commitCourant(), date }) } };
    },
  };
}
