/**
 * ===================================================================
 *  SAUVEGARDE AUTOMATIQUE DES TOURNÉES CALENDRIERS SUR GOOGLE DRIVE
 *  Amicale des sapeurs-pompiers de Saint-Léonard-de-Noblat
 * ===================================================================
 *
 * Ce script tourne chez Google (Apps Script), pas sur un ordinateur : les
 * sauvegardes partent même ordinateur éteint, téléphone éteint, à 6 h, 13 h
 * et 23 h, toute l'année.
 *
 * À chaque passage il dépose dans le dossier Drive :
 *   - sauvegarde-2026-11-14-06h.json  → la copie complète (sert à restaurer)
 *   - lisible-2026-11-14              → une feuille de calcul du jour, mise à
 *                                       jour à chaque passage, à lire
 *                                       directement dans le navigateur
 *
 * MISE EN PLACE : voir docs/sauvegarde/README.md (10 minutes, une seule fois).
 * En deux mots : coller ce fichier dans un projet Apps Script, enregistrer la
 * clé de service dans les propriétés du script, puis lancer `installer`.
 *
 * ⚠ Ce projet contient une clé qui donne accès à toute la base : ne le
 * partagez avec personne.
 */

// ---------------------------------------------------------------- réglages

var REGLAGES = {
  // Adresse de la base (la même que dans src/config.ts).
  url: 'https://enopjnyqycrtydgtuiys.supabase.co',

  // Dossier de destination dans « Mon Drive ». Créé s'il n'existe pas.
  dossier: 'sauvegarde calendriers pompiers',

  // Heures de sauvegarde, heure française (été comme hiver).
  heures: [6, 13, 23],
  fuseau: 'Europe/Paris',

  // Tout ce qui est sauvegardé. Une table absente de la base est signalée
  // mais n'empêche pas la sauvegarde du reste.
  tables: [
    'profils',
    'tournees',
    'adresses',
    'campagnes',
    'equipes',
    'decomptes',
    'journal',
    'suppressions',
    'archives_adresses',
  ],

  // Ménage automatique dans le dossier (voir menage() plus bas).
  // Mettez false pour tout garder indéfiniment.
  menageActif: true,
  joursToutGarder: 60, // on garde absolument tout sur cette durée
  joursUnParJour: 400, // puis une sauvegarde par jour jusqu'à cette durée
  // au-delà : une sauvegarde par mois, pour toujours

  // Prévenir par courriel si une sauvegarde échoue.
  courrielSiEchec: true,
};

/** Nom de la propriété de script qui contient la clé de service. */
var NOM_CLE = 'CLE_SERVICE';

// ---------------------------------------------------- installation / arrêt

/**
 * À lancer UNE SEULE FOIS, à la main, après avoir enregistré la clé.
 * Crée le dossier, programme les trois horaires, et fait une sauvegarde
 * tout de suite pour vérifier que tout fonctionne.
 */
function installer() {
  var cle = lireCle_();
  var dossier = dossierDeSauvegarde_();

  // On repart propre : on enlève les horaires déjà programmés par ce projet.
  var anciens = ScriptApp.getProjectTriggers();
  for (var i = 0; i < anciens.length; i++) {
    if (anciens[i].getHandlerFunction() === 'sauvegarder') {
      ScriptApp.deleteTrigger(anciens[i]);
    }
  }

  for (var h = 0; h < REGLAGES.heures.length; h++) {
    ScriptApp.newTrigger('sauvegarder')
      .timeBased()
      .everyDays(1)
      .atHour(REGLAGES.heures[h])
      .nearMinute(0)
      .inTimezone(REGLAGES.fuseau)
      .create();
  }

  Logger.log(
    'Horaires programmés : ' + REGLAGES.heures.join(' h, ') + ' h (heure française).',
  );
  Logger.log('Dossier : ' + dossier.getName() + ' — ' + dossier.getUrl());

  var resultat = sauvegarder();
  Logger.log('Première sauvegarde faite : ' + resultat);
  return resultat;
}

/** Arrête les sauvegardes automatiques (les fichiers déjà faits restent). */
function desinstaller() {
  var triggers = ScriptApp.getProjectTriggers();
  var n = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sauvegarder') {
      ScriptApp.deleteTrigger(triggers[i]);
      n++;
    }
  }
  Logger.log(n + ' horaire(s) supprimé(s). Plus aucune sauvegarde automatique.');
}

/**
 * Vérifie que la clé fonctionne et compte les lignes, SANS rien écrire.
 * Pratique pour tester avant d'installer.
 */
function verifier() {
  var cle = lireCle_();
  var lignes = [];
  for (var i = 0; i < REGLAGES.tables.length; i++) {
    var table = REGLAGES.tables[i];
    var lu = lireTable_(table, cle);
    lignes.push(table + ' : ' + (lu.absente ? 'table absente de la base' : lu.lignes.length + ' ligne(s)'));
  }
  var texte = lignes.join('\n');
  Logger.log(texte);
  return texte;
}

// ------------------------------------------------------------ la sauvegarde

/**
 * Point d'entrée des trois horaires. Écrit la copie complète, met à jour la
 * feuille lisible du jour, puis fait le ménage.
 */
function sauvegarder() {
  try {
    var cle = lireCle_();
    var dossier = dossierDeSauvegarde_();
    var maintenant = new Date();

    var tables = {};
    var compte = {};
    var absentes = [];

    for (var i = 0; i < REGLAGES.tables.length; i++) {
      var table = REGLAGES.tables[i];
      var lu = lireTable_(table, cle);
      if (lu.absente) {
        absentes.push(table);
      } else {
        tables[table] = lu.lignes;
        compte[table] = lu.lignes.length;
      }
    }

    // Garde-fou : une base vide ou une panne ne doit pas écraser le dossier
    // avec une sauvegarde creuse. On refuse d'écrire et on prévient.
    if (!tables.adresses || tables.adresses.length === 0) {
      throw new Error(
        'La base n’a renvoyé aucune adresse : sauvegarde annulée pour ne pas ' +
          'enregistrer un fichier vide. Les sauvegardes précédentes sont intactes.',
      );
    }

    var sauvegarde = {
      format: 'sauvegarde-tournees-calendriers',
      version: 1,
      genere_le: maintenant.toISOString(),
      source: 'automatique',
      tables: tables,
      compte: compte,
    };
    if (absentes.length > 0) sauvegarde.tables_absentes = absentes;

    var nom =
      'sauvegarde-' +
      Utilities.formatDate(maintenant, REGLAGES.fuseau, 'yyyy-MM-dd-HH') +
      'h.json';

    // Un même horaire relancé deux fois ne doit pas faire de doublon.
    var existants = dossier.getFilesByName(nom);
    while (existants.hasNext()) existants.next().setTrashed(true);

    dossier.createFile(nom, JSON.stringify(sauvegarde), 'application/json');

    // La feuille lisible est un confort : si elle échoue, la sauvegarde
    // elle-même est déjà enregistrée et c'est ce qui compte.
    var noteFeuille = '';
    try {
      noteFeuille = feuilleLisible_(dossier, sauvegarde, maintenant);
    } catch (e) {
      noteFeuille = 'feuille lisible non mise à jour (' + e.message + ')';
    }

    var noteMenage = REGLAGES.menageActif ? menage_(dossier, maintenant) : 'ménage désactivé';

    var resume =
      nom +
      ' — ' +
      Object.keys(compte)
        .map(function (t) {
          return t + ' ' + compte[t];
        })
        .join(', ') +
      (absentes.length > 0 ? ' — tables absentes : ' + absentes.join(', ') : '') +
      ' — ' +
      noteFeuille +
      ' — ' +
      noteMenage;

    Logger.log(resume);
    return resume;
  } catch (erreur) {
    prevenir_(erreur);
    throw erreur;
  }
}

// ------------------------------------------------------- lecture de la base

/** Lit la clé de service enregistrée dans les propriétés du script. */
function lireCle_() {
  var cle = PropertiesService.getScriptProperties().getProperty(NOM_CLE);
  if (!cle) {
    throw new Error(
      'Clé absente. Dans Apps Script : Paramètres du projet (roue dentée) → ' +
        'Propriétés du script → Ajouter une propriété → nom « ' +
        NOM_CLE +
        ' », valeur = la clé service_role de Supabase.',
    );
  }
  return cle;
}

/**
 * Lit une table entière. La base ne renvoie que 1000 lignes à la fois : on
 * demande les pages les unes après les autres, triées par identifiant pour
 * qu'aucune ligne ne soit ni oubliée ni comptée deux fois.
 */
function lireTable_(table, cle) {
  var PAS = 1000;
  var lignes = [];
  for (var depart = 0; ; depart += PAS) {
    var adresse =
      REGLAGES.url +
      '/rest/v1/' +
      table +
      '?select=*&order=id.asc&limit=' +
      PAS +
      '&offset=' +
      depart;
    var reponse = UrlFetchApp.fetch(adresse, {
      method: 'get',
      headers: { apikey: cle, Authorization: 'Bearer ' + cle },
      muteHttpExceptions: true,
    });
    var code = reponse.getResponseCode();

    if (code === 404 || code === 400) {
      // Table inconnue de cette base (mise à jour SQL pas encore passée).
      if (depart === 0) return { absente: true, lignes: [] };
      break;
    }
    if (code === 401 || code === 403) {
      throw new Error(
        'La base a refusé la clé (HTTP ' +
          code +
          '). Vérifiez la propriété « ' +
          NOM_CLE +
          ' » : il faut la clé « service_role », pas la clé « anon ».',
      );
    }
    if (code !== 200 && code !== 206) {
      throw new Error(
        'Lecture de « ' + table + ' » impossible (HTTP ' + code + ') : ' +
          reponse.getContentText().slice(0, 300),
      );
    }

    var page = JSON.parse(reponse.getContentText());
    for (var i = 0; i < page.length; i++) lignes.push(page[i]);
    if (page.length < PAS) break;
  }
  return { absente: false, lignes: lignes };
}

// ------------------------------------------------------------- dossier Drive

/** Trouve le dossier de sauvegarde, ou le crée au premier passage. */
function dossierDeSauvegarde_() {
  var trouves = DriveApp.getRootFolder().getFoldersByName(REGLAGES.dossier);
  if (trouves.hasNext()) return trouves.next();
  // Peut-être rangé ailleurs dans le Drive : on cherche partout avant de créer.
  var partout = DriveApp.getFoldersByName(REGLAGES.dossier);
  if (partout.hasNext()) return partout.next();
  return DriveApp.createFolder(REGLAGES.dossier);
}

// --------------------------------------------------------- feuille lisible

var LIBELLE_STATUT = {
  a_faire: 'À faire',
  distribue: 'Calendrier distribué',
  absent: 'Absent, à repasser',
  refus: 'Refus / pas intéressé',
  inhabite: 'Inhabité',
  secondaire: 'Maison secondaire',
};

var COUPURES = [
  ['c50', 0.5],
  ['e1', 1],
  ['e2', 2],
  ['b5', 5],
  ['b10', 10],
  ['b20', 20],
  ['b50', 50],
  ['b100', 100],
];

/** Total d'un décompte, comme l'application le calcule. */
function totalDecompte_(d) {
  var total = 0;
  for (var i = 0; i < COUPURES.length; i++) {
    var especes = d.especes || {};
    total += (especes[COUPURES[i][0]] || 0) * COUPURES[i][1];
  }
  var cheques = d.cheques || [];
  for (var j = 0; j < cheques.length; j++) {
    total += (cheques[j].nombre || 0) * (cheques[j].montant || 0);
  }
  total += d.cb || 0;
  return Math.round(total * 100) / 100;
}

/**
 * Crée (ou met à jour) la feuille de calcul du jour : les tournées, les
 * adresses et les décomptes, lisibles sans aucun outil.
 */
function feuilleLisible_(dossier, sauvegarde, maintenant) {
  var jour = Utilities.formatDate(maintenant, REGLAGES.fuseau, 'yyyy-MM-dd');
  var nom = 'lisible-' + jour;

  var classeur;
  var fichiers = dossier.getFilesByName(nom);
  if (fichiers.hasNext()) {
    classeur = SpreadsheetApp.openById(fichiers.next().getId());
  } else {
    classeur = SpreadsheetApp.create(nom);
    DriveApp.getFileById(classeur.getId()).moveTo(dossier);
  }

  var t = sauvegarde.tables;
  var nomTournee = {};
  (t.tournees || []).forEach(function (x) {
    nomTournee[x.id] = x.nom;
  });
  var nomProfil = {};
  (t.profils || []).forEach(function (x) {
    nomProfil[x.id] = x.nom;
  });

  var decomptesParTournee = {};
  (t.decomptes || []).forEach(function (d) {
    decomptesParTournee[d.tournee_id] = d;
  });

  // --- Tournées ---
  var tournees = [
    ['Tournée', 'Points', 'Faits', 'À faire', 'À repasser', 'Total reçu (€)', 'N° reçu', 'Terminée'],
  ];
  (t.tournees || [])
    .slice()
    .sort(function (a, b) {
      return String(a.nom).localeCompare(String(b.nom), 'fr', { numeric: true });
    })
    .forEach(function (tr) {
      var siennes = (t.adresses || []).filter(function (a) {
        return a.tournee_id === tr.id;
      });
      var d = decomptesParTournee[tr.id];
      tournees.push([
        tr.nom,
        siennes.length,
        siennes.filter(function (a) {
          return a.statut !== 'a_faire';
        }).length,
        siennes.filter(function (a) {
          return a.statut === 'a_faire';
        }).length,
        siennes.filter(function (a) {
          return a.statut === 'absent';
        }).length,
        d ? totalDecompte_(d) : '',
        d && d.numero_recu ? d.numero_recu : '',
        d && d.termine ? 'oui' : 'non',
      ]);
    });

  // --- Adresses ---
  var adresses = [
    [
      'Tournée',
      'Adresse',
      'Commune',
      'Statut',
      'Somme (€)',
      'Calendriers',
      'Commentaire',
      'Rappel',
      'Modifié le',
    ],
  ];
  (t.adresses || []).forEach(function (a) {
    adresses.push([
      nomTournee[a.tournee_id] || '?',
      a.libelle || '',
      a.commune || '',
      LIBELLE_STATUT[a.statut] || a.statut || '',
      a.somme == null ? '' : a.somme,
      a.calendriers_laisses == null ? '' : a.calendriers_laisses,
      a.note || '',
      a.rappel_le || '',
      a.modifie_le || '',
    ]);
  });

  // --- Décomptes ---
  var decomptes = [
    ['Tournée', 'N° reçu', 'Terminée', 'Clôturée le', 'Participants', 'Total (€)'],
  ];
  (t.decomptes || []).forEach(function (d) {
    decomptes.push([
      nomTournee[d.tournee_id] || '?',
      d.numero_recu == null ? '' : d.numero_recu,
      d.termine ? 'oui' : 'non',
      d.termine_le || '',
      (d.participants || [])
        .map(function (id) {
          return nomProfil[id] || '?';
        })
        .join(', '),
      totalDecompte_(d),
    ]);
  });

  ecrireOnglet_(classeur, 'Tournées', tournees);
  ecrireOnglet_(classeur, 'Adresses', adresses);
  ecrireOnglet_(classeur, 'Décomptes', decomptes);

  // L'onglet créé d'office par Google n'a plus de raison d'être.
  var defaut = classeur.getSheetByName('Feuille 1') || classeur.getSheetByName('Sheet1');
  if (defaut && classeur.getSheets().length > 1) classeur.deleteSheet(defaut);

  return 'feuille « ' + nom + ' » à jour';
}

/** Remplace entièrement le contenu d'un onglet. */
function ecrireOnglet_(classeur, nom, lignes) {
  var onglet = classeur.getSheetByName(nom);
  if (!onglet) onglet = classeur.insertSheet(nom);
  onglet.clear();
  if (lignes.length === 0) return;
  onglet.getRange(1, 1, lignes.length, lignes[0].length).setValues(lignes);
  onglet.getRange(1, 1, 1, lignes[0].length).setFontWeight('bold');
  onglet.setFrozenRows(1);
}

// ------------------------------------------------------------------ ménage

/**
 * Évite que le dossier grossisse sans fin, sans jamais effacer pour de bon :
 * les fichiers écartés partent à la corbeille du Drive, où ils restent 30
 * jours récupérables.
 *
 *   - moins de 60 jours   : on garde tout (les trois par jour)
 *   - moins de 400 jours  : on garde la dernière sauvegarde de chaque jour
 *   - au-delà             : on garde la dernière sauvegarde de chaque mois
 */
function menage_(dossier, maintenant) {
  var MOTIF = /^(sauvegarde|lisible)-(\d{4})-(\d{2})-(\d{2})/;
  var parJour = {};

  var fichiers = dossier.getFiles();
  while (fichiers.hasNext()) {
    var fichier = fichiers.next();
    var m = MOTIF.exec(fichier.getName());
    if (!m) continue;
    var jour = m[2] + '-' + m[3] + '-' + m[4];
    var genre = m[1]; // on traite les .json et les feuilles séparément
    var cle = genre + '|' + jour;
    if (!parJour[cle]) parJour[cle] = [];
    parJour[cle].push(fichier);
  }

  var aujourdhui = Date.UTC(
    Number(Utilities.formatDate(maintenant, REGLAGES.fuseau, 'yyyy')),
    Number(Utilities.formatDate(maintenant, REGLAGES.fuseau, 'MM')) - 1,
    Number(Utilities.formatDate(maintenant, REGLAGES.fuseau, 'dd')),
  );

  // Pour chaque genre, la liste des jours du plus récent au plus ancien.
  var garderMois = {}; // genre|AAAA-MM → jour retenu
  var cles = Object.keys(parJour).sort().reverse();
  for (var i = 0; i < cles.length; i++) {
    var parties = cles[i].split('|');
    var mois = parties[0] + '|' + parties[1].slice(0, 7);
    if (!garderMois[mois]) garderMois[mois] = cles[i]; // le plus récent du mois
  }

  var jetes = 0;
  for (var j = 0; j < cles.length; j++) {
    var ce = cles[j];
    var jourTexte = ce.split('|')[1];
    var bouts = jourTexte.split('-');
    var age = Math.round(
      (aujourdhui - Date.UTC(Number(bouts[0]), Number(bouts[1]) - 1, Number(bouts[2]))) /
        86400000,
    );
    var liste = parJour[ce].sort(function (a, b) {
      return a.getName() < b.getName() ? -1 : 1;
    });

    if (age <= REGLAGES.joursToutGarder) continue; // on garde tout

    var moisDeCeJour = ce.split('|')[0] + '|' + jourTexte.slice(0, 7);
    var jourGardeDuMois = garderMois[moisDeCeJour];

    if (age <= REGLAGES.joursUnParJour) {
      // une seule par jour : la dernière
      for (var k = 0; k < liste.length - 1; k++) {
        liste[k].setTrashed(true);
        jetes++;
      }
    } else if (ce !== jourGardeDuMois) {
      // au-delà d'un an : ce jour-là n'est pas celui retenu pour le mois
      for (var l = 0; l < liste.length; l++) {
        liste[l].setTrashed(true);
        jetes++;
      }
    } else {
      for (var n = 0; n < liste.length - 1; n++) {
        liste[n].setTrashed(true);
        jetes++;
      }
    }
  }

  return jetes === 0 ? 'rien à ranger' : jetes + ' ancien(s) fichier(s) à la corbeille';
}

// ---------------------------------------------------------------- courriel

/** Prévient le propriétaire du script quand une sauvegarde échoue. */
function prevenir_(erreur) {
  if (!REGLAGES.courrielSiEchec) return;
  try {
    var destinataire = Session.getEffectiveUser().getEmail();
    if (!destinataire) return;
    MailApp.sendEmail({
      to: destinataire,
      subject: '⚠ Sauvegarde des tournées calendriers : échec',
      body:
        'La sauvegarde automatique n’a pas abouti.\n\n' +
        'Motif : ' +
        erreur.message +
        '\n\n' +
        'Les sauvegardes précédentes sont intactes. La prochaine tentative aura ' +
        'lieu au prochain horaire (' +
        REGLAGES.heures.join(' h, ') +
        ' h).\n\n' +
        '— Script de sauvegarde, projet « tournées calendriers »',
    });
  } catch (e) {
    Logger.log('Courriel d’alerte impossible : ' + e.message);
  }
}
