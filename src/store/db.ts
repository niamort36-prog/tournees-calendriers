// Base locale IndexedDB (Dexie) : les données restent sur l'appareil.
// C'est aussi la fondation du futur mode hors-ligne : cette base servira de
// file d'attente de synchronisation quand Supabase sera branché.

import Dexie, { type Table } from 'dexie';
import type { Tournee, AdressePoint, BanAdresseBrute, Campagne } from '../types';
import type { Bbox } from '../lib/geo';

export interface BanDepartementCache {
  dept: string;
  chargeLe: string;
  nbAdresses: number;
}

export interface BanCommuneMeta {
  codeInsee: string;
  dept: string;
  nom: string;
  bbox: Bbox;
  nbAdresses: number;
}

export interface BanCommuneAdresses {
  codeInsee: string;
  adresses: BanAdresseBrute[];
}

/** Opération de synchronisation en attente (écriture faite hors connexion). */
export interface EnAttente {
  cle?: number;
  operation: unknown;
  quand: string;
}

class BaseLocale extends Dexie {
  tournees!: Table<Tournee, string>;
  adresses!: Table<AdressePoint, string>;
  campagnes!: Table<Campagne, string>;
  banDepartements!: Table<BanDepartementCache, string>;
  banCommunes!: Table<BanCommuneMeta, string>;
  banAdressesCommunes!: Table<BanCommuneAdresses, string>;
  enAttente!: Table<EnAttente, number>;

  constructor() {
    super('tournees-calendriers');
    this.version(1).stores({
      tournees: 'id',
      adresses: 'id, tourneeId, banId',
      banDepartements: 'dept',
      banCommunes: 'codeInsee, dept',
      banAdressesCommunes: 'codeInsee',
    });
    this.version(2).stores({
      enAttente: '++cle',
    });
    this.version(3).stores({
      campagnes: 'id',
    });
  }
}

export const db = new BaseLocale();
