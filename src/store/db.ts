// Base locale IndexedDB (Dexie) : les données restent sur l'appareil.
// C'est aussi la fondation du futur mode hors-ligne : cette base servira de
// file d'attente de synchronisation quand Supabase sera branché.

import Dexie, { type Table } from 'dexie';
import type { Tournee, AdressePoint, BanAdresseBrute } from '../types';
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

class BaseLocale extends Dexie {
  tournees!: Table<Tournee, string>;
  adresses!: Table<AdressePoint, string>;
  banDepartements!: Table<BanDepartementCache, string>;
  banCommunes!: Table<BanCommuneMeta, string>;
  banAdressesCommunes!: Table<BanCommuneAdresses, string>;

  constructor() {
    super('tournees-calendriers');
    this.version(1).stores({
      tournees: 'id',
      adresses: 'id, tourneeId, banId',
      banDepartements: 'dept',
      banCommunes: 'codeInsee, dept',
      banAdressesCommunes: 'codeInsee',
    });
  }
}

export const db = new BaseLocale();
