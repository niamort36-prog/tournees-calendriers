// Fausse base du téléphone (remplace Dexie) : cinq tables en mémoire.
class FausseTable {
  constructor() {
    this.lignes = new Map();
    this.ecritures = 0;
  }
  async bulkGet(ids) {
    return ids.map((id) => this.lignes.get(id));
  }
  async bulkPut(liste) {
    for (const x of liste) {
      this.lignes.set(x.id, x);
      this.ecritures += 1;
    }
  }
  async bulkDelete(ids) {
    for (const id of ids) this.lignes.delete(id);
  }
  async put(x) {
    this.lignes.set(x.id, x);
    this.ecritures += 1;
  }
  async get(id) {
    return this.lignes.get(id);
  }
  async clear() {
    this.lignes.clear();
  }
  async toArray() {
    return [...this.lignes.values()];
  }
}

export const db = {
  tournees: new FausseTable(),
  adresses: new FausseTable(),
  campagnes: new FausseTable(),
  equipes: new FausseTable(),
  decomptes: new FausseTable(),
  enAttente: {
    file: [],
    async add(x) {
      this.file.push(x);
    },
    async count() {
      return this.file.length;
    },
  },
  async transaction(mode, tables, corps) {
    return corps();
  },
};
