// Faux client Supabase : mémorise les canaux créés, comme la vraie
// bibliothèque (y compris son défaut : channel() rend le canal existant de
// même nom).
export const journal = { canaux: [], retires: [], requetes: [] };

class FauxCanal {
  constructor(topic) {
    this.topic = topic;
    this.liaisons = [];
    this.state = 'closed';
    this.rappel = null;
  }
  on(type, filtre, rappel) {
    this.liaisons.push({ type, filtre, rappel });
    return this;
  }
  subscribe(rappel) {
    this.rappel = rappel;
    this.state = 'joining';
    return this;
  }
  // --- pilotage par les tests ---
  brancher() {
    this.state = 'joined';
    this.rappel?.('SUBSCRIBED');
  }
  tomber(etat = 'CHANNEL_ERROR') {
    this.state = 'errored';
    this.rappel?.(etat);
  }
  /** Remet un évènement à TOUTES les liaisons (le défaut observé en production). */
  diffuserATous(evenement) {
    for (const l of this.liaisons) l.rappel(evenement);
  }
  /** Remet un évènement à la seule liaison de sa table (fonctionnement normal). */
  diffuser(evenement) {
    for (const l of this.liaisons) if (l.filtre.table === evenement.table) l.rappel(evenement);
  }
}

// Table factice pour chargerTable : pages par identifiant.
export const tables = {};

function requete(table) {
  const etat = { apres: null, limite: 1000 };
  const api = {
    select() {
      return api;
    },
    gt(colonne, valeur) {
      etat.apres = valeur;
      return api;
    },
    order(colonne, options) {
      etat.tri = { colonne, options };
      return api;
    },
    limit(n) {
      etat.limite = n;
      return api;
    },
    then(resoudre, rejeter) {
      journal.requetes.push({ table, ...etat });
      if (!etat.tri) return Promise.resolve({ data: null, error: { message: 'pas de tri' } }).then(resoudre, rejeter);
      const toutes = [...(tables[table] ?? [])].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const suite = etat.apres === null ? toutes : toutes.filter((l) => l.id > etat.apres);
      return Promise.resolve({ data: suite.slice(0, etat.limite), error: null }).then(resoudre, rejeter);
    },
  };
  return api;
}

export const supabase = {
  channel(nom) {
    const topic = 'realtime:' + nom;
    const existant = journal.canaux.find((c) => c.topic === topic && !journal.retires.includes(c));
    if (existant) return existant;
    const canal = new FauxCanal(topic);
    journal.canaux.push(canal);
    return canal;
  },
  removeChannel(canal) {
    journal.retires.push(canal);
    canal.state = 'closed';
    return Promise.resolve('ok');
  },
  from(table) {
    return requete(table);
  },
  realtime: {
    isConnected: () => true,
    connect: () => undefined,
    sendHeartbeat: () => Promise.resolve(),
  },
};

export const supabaseActif = true;
