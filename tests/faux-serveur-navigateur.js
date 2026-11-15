// Faux serveur Supabase pour les essais dans le navigateur (mode isolé).
// Chargé par la configuration de TEST uniquement, avant le démarrage de
// l'application. Données fictives, identifiants fixes d'un lancement à l'autre.
(() => {
  const reglages = JSON.parse(sessionStorage.getItem('__faux_reglages') || '{}');
  const F = (window.__faux = {
    tables: { tournees: [], adresses: [], campagnes: [], equipes: [], decomptes: [], suppressions: [], profils: [], journal: [] },
    delai: reglages.delai || 0,
    horsLigne: !!reglages.horsLigne,
    journal: [],
    sansTri: 0,
    echantillons: [],
  });
  const vraiFetch = window.fetch.bind(window);
  const entete = (options, nom) => {
    const h = options && options.headers;
    if (!h) return '';
    return (typeof h.get === 'function' ? h.get(nom) : h[nom] || h[nom.toLowerCase()]) || '';
  };
  window.fetch = async (entree, options = {}) => {
    const adresse = typeof entree === 'string' ? entree : entree.url;
    let url;
    try {
      url = new URL(adresse, location.href);
    } catch {
      return vraiFetch(entree, options);
    }
    if (!url.hostname.endsWith('.invalid')) return vraiFetch(entree, options);
    const methode = (options.method || 'GET').toUpperCase();
    const rep = (corps, statut = 200) =>
      new Response(corps === null ? null : JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });
    F.journal.push({ methode, chemin: url.pathname, q: decodeURIComponent(url.search), t: Math.round(performance.now()) });
    if (F.horsLigne) throw new TypeError('Failed to fetch (hors ligne simulé)');
    if (url.pathname === '/rest/v1/rpc/maintenant') return rep(new Date().toISOString());
    if (url.pathname.startsWith('/auth/')) return rep({});
    const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (!m) return rep({ message: 'inconnu' }, 404);
    const table = m[1];
    const lignes = F.tables[table] || (F.tables[table] = []);
    const filtrer = (source) => {
      let res = source;
      for (const [cle, val] of url.searchParams) {
        if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(cle)) continue;
        const point = val.indexOf('.');
        const op = val.slice(0, point);
        const v = val.slice(point + 1);
        if (op === 'eq') res = res.filter((l) => String(l[cle]) === v);
        else if (op === 'gt') res = res.filter((l) => String(l[cle]) > v);
        else if (op === 'in') {
          const ens = new Set(v.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')));
          res = res.filter((l) => ens.has(String(l[cle])));
        }
      }
      return res;
    };
    if (methode === 'GET' || methode === 'HEAD') {
      if (F.delai) await new Promise((r) => setTimeout(r, F.delai));
      let res = filtrer([...lignes]);
      const ordre = url.searchParams.get('order');
      if (ordre) {
        const [col, sens] = ordre.split('.');
        res.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (sens === 'desc' ? -1 : 1));
      } else if (table !== 'profils') F.sansTri += 1;
      const limite = Number(url.searchParams.get('limit') || 1e9);
      res = res.slice(0, Math.min(limite, 1000));
      if (entete(options, 'Accept').includes('vnd.pgrst.object')) {
        return res.length === 1 ? rep(res[0]) : rep({ code: 'PGRST116', message: 'aucune ligne' }, 406);
      }
      return rep(JSON.parse(JSON.stringify(res)));
    }
    if (methode === 'POST') {
      const corps = JSON.parse(options.body);
      const liste = Array.isArray(corps) ? corps : [corps];
      const ignorer = entete(options, 'Prefer').includes('ignore-duplicates');
      for (const l of liste) {
        const i = lignes.findIndex((x) => x.id === l.id);
        if (i >= 0) {
          if (!ignorer) lignes[i] = { ...lignes[i], ...l };
        } else lignes.push({ ...(table === 'suppressions' ? { supprime_le: new Date().toISOString() } : {}), ...l });
      }
      return new Response(null, { status: 201 });
    }
    if (methode === 'DELETE') {
      const aRetirer = new Set(filtrer(lignes).map((l) => l.id));
      F.tables[table] = lignes.filter((l) => !aRetirer.has(l.id));
      return new Response(null, { status: 204 });
    }
    return rep({ message: 'méthode' }, 405);
  };

  // ---------- données fictives, au volume réel, identifiants fixes ----------
  const uuid = (prefixe, n) => `${prefixe}${n.toString(16).padStart(7, '0')}-0000-4000-8000-000000000000`;
  const iso = (min) => new Date(Date.UTC(2026, 10, 14, 8, min, 0)).toISOString().replace('Z', '+00:00');
  const T = F.tables;
  const noms = Array.from({ length: 30 }, (_, i) => 'Tournée ' + (i + 1)).concat(['Tournée Ville']);
  const couleurs = ['#e63946', '#457b9d', '#2a9d8f', '#e76f51', '#8338ec', '#ff006e', '#0077b6', '#606c38', '#bc6c25', '#5f0f40'];
  noms.forEach((nom, i) => {
    const lat = 45.8 + (i % 6) * 0.012;
    const lng = 1.44 + Math.floor(i / 6) * 0.018;
    T.tournees.push({ id: uuid('c', i), nom, couleur: couleurs[i % 10], polygone: [[lat, lng], [lat + 0.01, lng], [lat + 0.01, lng + 0.015], [lat, lng + 0.015]], dispo_conseillee: '', calendriers_annee_derniere: null, ban_ids_exclus: [], cree_le: iso(0), modifie_le: iso(0) });
  });
  const statuts = ['a_faire', 'a_faire', 'a_faire', 'distribue', 'distribue', 'absent', 'refus'];
  for (let i = 0; i < 6172; i += 1) {
    const t = i < 1673 ? T.tournees[30] : T.tournees[i % 30];
    const p = t.polygone[0];
    // identifiants dans le désordre par rapport à l'ordre d'insertion
    T.adresses.push({ id: uuid('a', (i * 7919) % 6172), tournee_id: t.id, ban_id: 'ban' + i, manuelle: false, libelle: 1 + (i % 60) + ' rue Essai ' + (i % 97), commune: 'Ville-Test', code_postal: '87400', lat: p[0] + ((i * 37) % 100) / 10000, lng: p[1] + ((i * 53) % 150) / 10000, autres_adresses: i % 40 === 0 ? ['bis'] : [], type_batiment: 'maison', appartements: [], statut: statuts[i % 7], paiement: null, statut_precedent: null, somme: i % 7 === 3 ? 10 : null, calendriers_laisses: null, rappel_le: null, note: i % 50 === 0 ? 'chien' : null, note_le: null, modifie_le: iso(1) });
  }
  T.campagnes.push({ id: uuid('e', 1), nom: '2026', calendriers_commandes: 4000, taille_paquet: 25, statut: 'active', lots: [], cree_le: iso(0), archivee_le: null, modifie_le: iso(0) });
  T.profils.push(
    { id: uuid('f', 1), nom: 'Admin Essai', role: 'admin', centre: 'CS Test', approuve: true },
    { id: uuid('f', 2), nom: 'Membre Essai', role: 'normal', centre: 'CS Test', approuve: true },
  );
  T.equipes.push({ id: uuid('b', 1), nom: 'Équipe A', membres: [uuid('f', 2)], tournee_id: T.tournees[0].id, cree_le: iso(0), modifie_le: iso(0) });
  for (let i = 0; i < 12; i += 1) {
    T.decomptes.push({ id: uuid('d', i), tournee_id: T.tournees[i].id, campagne_id: uuid('e', 1), participants: [uuid('f', 2)], seances: [], especes: i < 3 ? { b10: 5 } : {}, cheques: [], cb: null, calendriers_distribues: null, termine: i < 3, termine_le: i < 3 ? iso(5) : null, numero_recu: i < 3 ? 6 + i : null, cree_le: iso(2), modifie_le: iso(5) });
  }
  for (let i = 0; i < 485; i += 1) T.suppressions.push({ id: uuid('9', i), table_nom: 'adresses', supprime_le: iso(30) });

  // ---------- observation du lancement ----------
  const t0 = performance.now();
  const noter = () => {
    const s = window.store && window.store.getState();
    F.echantillons.push({
      t: Math.round(performance.now() - t0),
      ecran: document.querySelector('.ecran-connexion') ? 'connexion' : document.querySelector('.app') ? 'appli' : document.querySelector('.ecran-attente') ? 'attente' : '?',
      voile: !!document.querySelector('.voile-chargement'),
      pastille: !!document.querySelector('.pastille-synchro'),
      cartes: document.querySelectorAll('.tournee-carte').length,
      adresses: s ? s.adresses.length : -1,
      profil: s && s.profil ? s.profil.role : null,
      erreur: s ? s.erreur : null,
    });
  };
  const minuterie = setInterval(noter, 100);
  setTimeout(() => clearInterval(minuterie), 15000);
})();
