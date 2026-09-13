# Génère le tutoriel PDF illustré de l'application Tournées Calendriers.
#
# Utilisation :  python docs/tutoriel/tutoriel.py
# Dépendances  :  pip install reportlab pillow
# Les captures d'écran vivent dans docs/tutoriel/captures/.
import os
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether,
                                PageBreak, PageTemplate, Paragraph, Spacer,
                                Table, TableStyle)
from PIL import Image as PILImage

ICI = os.path.dirname(os.path.abspath(__file__))
CAPTURES = os.path.join(ICI, 'captures')
PROJET = os.path.dirname(os.path.dirname(ICI))
SORTIE = os.path.join(PROJET, 'docs', 'Tutoriel-Tournees-Calendriers.pdf')

MARINE = colors.HexColor('#1d3557')
MARINE_CLAIR = colors.HexColor('#2b4a7a')
ROUGE = colors.HexColor('#e63946')
GRIS = colors.HexColor('#64748b')
FOND = colors.HexColor('#f4f6fa')
BORDURE = colors.HexColor('#dbe3ee')
VERT = colors.HexColor('#2e7d32')
BLEU = colors.HexColor('#1e88e5')
VIOLET = colors.HexColor('#8338ec')
GRIS_PING = colors.HexColor('#8d99ae')

# Polices Windows (accents corrects, rendu agréable)
F, FB, FI = 'Calibri', 'Calibri-Gras', 'Calibri-Italique'
try:
    pdfmetrics.registerFont(TTFont(F, r'C:\Windows\Fonts\calibri.ttf'))
    pdfmetrics.registerFont(TTFont(FB, r'C:\Windows\Fonts\calibrib.ttf'))
    pdfmetrics.registerFont(TTFont(FI, r'C:\Windows\Fonts\calibrii.ttf'))
    # indispensable pour que les balises <b> et <i> fonctionnent
    pdfmetrics.registerFontFamily(F, normal=F, bold=FB, italic=FI, boldItalic=FB)
except Exception:
    F, FB, FI = 'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique'

styles = getSampleStyleSheet()
S = {
    'titre_couv': ParagraphStyle('tc', fontName=FB, fontSize=34, leading=38,
                                 textColor=MARINE, alignment=TA_CENTER),
    'stitre_couv': ParagraphStyle('stc', fontName=F, fontSize=15, leading=22,
                                  textColor=GRIS, alignment=TA_CENTER),
    'partie': ParagraphStyle('p', fontName=FB, fontSize=21, leading=25,
                             textColor=colors.white, spaceAfter=0),
    'h1': ParagraphStyle('h1', fontName=FB, fontSize=15, leading=19,
                         textColor=MARINE, spaceBefore=10, spaceAfter=5),
    'h2': ParagraphStyle('h2', fontName=FB, fontSize=12, leading=15,
                         textColor=MARINE_CLAIR, spaceBefore=8, spaceAfter=3),
    'corps': ParagraphStyle('c', fontName=F, fontSize=10.5, leading=15,
                            textColor=colors.HexColor('#22303f'), alignment=TA_JUSTIFY,
                            spaceAfter=5),
    'puce': ParagraphStyle('pu', fontName=F, fontSize=10.5, leading=15,
                           textColor=colors.HexColor('#22303f'), leftIndent=10,
                           bulletIndent=2, spaceAfter=2),
    'etape': ParagraphStyle('e', fontName=F, fontSize=10.5, leading=15,
                            textColor=colors.HexColor('#22303f')),
    'legende': ParagraphStyle('l', fontName=FI, fontSize=9, leading=12,
                              textColor=GRIS, alignment=TA_CENTER, spaceBefore=3,
                              spaceAfter=8),
    'astuce': ParagraphStyle('a', fontName=F, fontSize=10, leading=14,
                             textColor=colors.HexColor('#22303f')),
    'cellule': ParagraphStyle('ce', fontName=F, fontSize=10, leading=13,
                              textColor=colors.HexColor('#22303f')),
    'cellule_g': ParagraphStyle('ceg', fontName=FB, fontSize=10, leading=13,
                                textColor=MARINE),
}

histoire = []


def p(txt, style='corps'):
    histoire.append(Paragraph(txt, S[style]))


def espace(h=6):
    histoire.append(Spacer(1, h))


def puces(liste):
    for texte in liste:
        histoire.append(Paragraph('•&nbsp; ' + texte, S['puce']))
    espace(6)


def titre_partie(numero, texte):
    """Bandeau de partie, sur une nouvelle page."""
    histoire.append(PageBreak())
    t = Table([[Paragraph(f'PARTIE {numero}', ParagraphStyle(
        'pn', fontName=F, fontSize=11, textColor=colors.HexColor('#9db5d8'))), ],
        [Paragraph(texte, S['partie'])]],
        colWidths=[16.4 * cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), MARINE),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
        ('TOPPADDING', (0, 0), (0, 0), 12),
        ('BOTTOMPADDING', (0, 1), (0, 1), 14),
        ('TOPPADDING', (0, 1), (0, 1), 0),
        ('BOTTOMPADDING', (0, 0), (0, 0), 0),
    ]))
    histoire.append(t)
    espace(14)


def image(nom, largeur_cm, legende=None):
    chemin = os.path.join(CAPTURES, nom + '.png')
    with PILImage.open(chemin) as im:
        l, h = im.size
    largeur = largeur_cm * cm
    img = Image(chemin, width=largeur, height=largeur * h / l)
    img.hAlign = 'CENTER'
    bloc = [img]
    bloc.append(Paragraph(legende, S['legende']) if legende else Spacer(1, 8))
    histoire.append(KeepTogether(bloc))


def etapes(liste):
    """Liste numérotée avec pastilles rondes."""
    lignes = []
    for i, texte in enumerate(liste, 1):
        pastille = Table([[Paragraph(f'<font color="white"><b>{i}</b></font>',
                                     ParagraphStyle('n', fontName=FB, fontSize=10,
                                                    alignment=TA_CENTER))]],
                         colWidths=[7 * mm], rowHeights=[7 * mm])
        pastille.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), ROUGE),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        lignes.append([pastille, Paragraph(texte, S['etape'])])
    t = Table(lignes, colWidths=[10 * mm, 15.4 * cm])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (0, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
    ]))
    histoire.append(t)
    espace(4)


def encadre(titre, texte, couleur=MARINE, fond=FOND):
    contenu = [Paragraph(f'<b>{titre}</b>', ParagraphStyle(
        'et', fontName=FB, fontSize=10.5, textColor=couleur, spaceAfter=3)),
        Paragraph(texte, S['astuce'])]
    t = Table([[contenu]], colWidths=[16.4 * cm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), fond),
        ('LINEBEFORE', (0, 0), (0, -1), 3, couleur),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
    ]))
    histoire.append(KeepTogether([t, Spacer(1, 9)]))


def tableau(entetes, lignes, largeurs):
    donnees = [[Paragraph(f'<font color="white"><b>{e}</b></font>', S['cellule'])
                for e in entetes]]
    for ligne in lignes:
        donnees.append([c if not isinstance(c, str) else Paragraph(c, S['cellule'])
                        for c in ligne])
    t = Table(donnees, colWidths=largeurs, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), MARINE),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, FOND]),
        ('GRID', (0, 0), (-1, -1), 0.6, BORDURE),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 7),
        ('RIGHTPADDING', (0, 0), (-1, -1), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    histoire.append(KeepTogether([t, Spacer(1, 10)]))


def pastille_couleur(couleur, texte):
    """Cellule avec une pastille de couleur suivie du texte."""
    t = Table([[' ', Paragraph(texte, S['cellule'])]], colWidths=[6 * mm, None])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), couleur),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (0, 0), 0),
        ('LEFTPADDING', (1, 0), (1, 0), 7),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('ROUNDEDCORNERS', [3, 3, 3, 3]),
    ]))
    return t


# ============================== COUVERTURE ==============================
histoire.append(Spacer(1, 2.2 * cm))
logo = os.path.join(PROJET, 'public', 'icone-512.png')
if os.path.exists(logo):
    im = Image(logo, width=3.4 * cm, height=3.4 * cm)
    im.hAlign = 'CENTER'
    histoire.append(im)
espace(18)
p('Tournées Calendriers', 'titre_couv')
espace(6)
p('Mode d’emploi complet de l’application', 'stitre_couv')
p('Amicale des Sapeurs-Pompiers de Saint-Léonard-de-Noblat', 'stitre_couv')
espace(26)

t = Table([[Paragraph('<b>Ce guide est fait pour les débutants.</b><br/>'
                      'Aucune connaissance en informatique n’est nécessaire : '
                      'chaque étape est expliquée et illustrée.', S['astuce'])]],
          colWidths=[13 * cm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), FOND),
    ('LINEBEFORE', (0, 0), (0, -1), 3, ROUGE),
    ('LEFTPADDING', (0, 0), (-1, -1), 14),
    ('RIGHTPADDING', (0, 0), (-1, -1), 14),
    ('TOPPADDING', (0, 0), (-1, -1), 12),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
]))
t.hAlign = 'CENTER'
histoire.append(t)
espace(24)

t = Table([[Paragraph('<b>Adresse de l’application</b>', S['cellule_g'])],
           [Paragraph('<font size="12">niamort36-prog.github.io/tournees-calendriers</font>',
                      ParagraphStyle('u', fontName=FB, fontSize=12, textColor=ROUGE,
                                     alignment=TA_CENTER))]],
          colWidths=[13 * cm])
t.setStyle(TableStyle([
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('BOX', (0, 0), (-1, -1), 1, BORDURE),
    ('TOPPADDING', (0, 0), (-1, -1), 8),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
]))
t.hAlign = 'CENTER'
histoire.append(t)

# ============================== SOMMAIRE ==============================
histoire.append(PageBreak())
p('Sommaire', 'h1')
espace(2)
tableau(['Partie', 'Contenu', 'Pour qui ?'], [
    ['<b>1. Pour commencer</b>', 'Se connecter, installer l’application sur son '
     'téléphone, comprendre les couleurs', 'Tout le monde'],
    ['<b>2. Guide du sapeur-pompier</b>', 'Faire sa tournée sur le téléphone : '
     'marquer les maisons, les immeubles, se faire guider', 'Comptes Normal'],
    ['<b>3. Guide de l’administrateur</b>', 'Créer les comptes, la campagne, les '
     'tournées et les équipes ; lots, décompte, reçus et exports', 'Comptes Admin'],
    ['<b>4. En cas de souci</b>', 'Les questions les plus fréquentes et leurs '
     'réponses', 'Tout le monde'],
], [4.6 * cm, 8.6 * cm, 3.2 * cm])

espace(6)
p('L’essentiel en trois phrases', 'h1')
etapes([
    'L’<b>administrateur</b> prépare tout depuis un ordinateur : il dessine les '
    'tournées sur une carte, crée les comptes et forme les équipes.',
    'Le <b>sapeur-pompier</b> ouvre l’application sur son téléphone le jour de la '
    'tournée et tape sur chaque maison visitée pour indiquer ce qui s’est passé.',
    'Tout se met à jour <b>automatiquement</b> chez tout le monde, et l’application '
    'calcule les totaux et prépare le reçu à la fin.',
])
encadre('Bon à savoir',
        'Il n’y a rien à installer obligatoirement et rien à payer. L’application '
        'fonctionne dans le navigateur internet, sur ordinateur comme sur téléphone, '
        'et vos données sont partagées en direct entre tous les appareils.')

# ============================== PARTIE 1 ==============================
titre_partie(1, 'Pour commencer')

p('1.1 — Se connecter à l’application', 'h1')
p('Chaque sapeur-pompier possède son propre compte, créé par l’administrateur. '
  'Vous recevez de sa part une <b>adresse e-mail</b> et un <b>mot de passe</b>.')
etapes([
    'Ouvrez le navigateur internet de votre téléphone ou de votre ordinateur '
    '(Chrome, Safari, Edge…).',
    'Tapez l’adresse : <b>niamort36-prog.github.io/tournees-calendriers</b>',
    'Saisissez votre e-mail et votre mot de passe, puis appuyez sur <b>Se connecter</b>.',
    'C’est tout ! Vous restez connecté : les fois suivantes, l’application s’ouvre '
    'directement sur la carte.',
])
image('connexion', 7.5, 'L’écran de connexion')
encadre('Attention',
        'N’utilisez pas le bouton « Créer un compte » : les comptes sont créés par '
        'l’administrateur. Si vous n’avez pas encore vos identifiants, demandez-lui.')

p('1.2 — Installer l’application sur son téléphone', 'h1')
p('Ce n’est pas obligatoire, mais c’est <b>fortement conseillé</b> : l’application '
  's’ouvre alors comme une vraie application, en plein écran, avec son icône sur '
  'l’écran d’accueil. C’est aussi nécessaire pour recevoir les notifications.')
p('<b>Sur Android</b> (Samsung, Xiaomi, Google Pixel…)', 'h2')
etapes([
    'Ouvrez l’application dans Chrome.',
    'Appuyez sur les <b>trois points</b> en haut à droite.',
    'Choisissez <b>« Installer l’application »</b> ou « Ajouter à l’écran d’accueil ».',
])
p('<b>Sur iPhone</b>', 'h2')
etapes([
    'Ouvrez l’application dans Safari (cela ne fonctionne pas avec Chrome sur iPhone).',
    'Appuyez sur le bouton <b>Partager</b> (le carré avec une flèche vers le haut).',
    'Faites défiler et choisissez <b>« Sur l’écran d’accueil »</b>.',
])

p('1.3 — Les quatre couleurs à connaître', 'h1')
p('Sur la carte, chaque maison est représentée par un point de couleur. La couleur '
  'indique où vous en êtes. C’est le cœur de l’application :')
tableau(['Couleur', 'Signification', 'Quand l’utiliser'], [
    [pastille_couleur(GRIS_PING, '<b>Gris</b> — À faire'),
     'Personne n’est encore passé', 'C’est la couleur de départ de toutes les maisons'],
    [pastille_couleur(VERT, '<b>Vert</b> — Distribué'),
     'Le calendrier a été remis', 'Quand les habitants ont pris un calendrier'],
    [pastille_couleur(ROUGE, '<b>Rouge</b> — Absent'),
     'Personne n’a répondu', 'Quand il faudra repasser plus tard'],
    [pastille_couleur(BLEU, '<b>Bleu</b> — Refus'),
     'Les habitants n’en veulent pas', 'Inutile de repasser cette année'],
], [5.4 * cm, 5 * cm, 6 * cm])
encadre('L’astuce qui fait gagner du temps',
        'Les refus sont mémorisés d’une année sur l’autre. L’année prochaine, en '
        'ouvrant une maison, vous verrez écrit « L’an dernier : Refus » — vous saurez '
        'tout de suite à quoi vous attendre.')

# ============================== PARTIE 2 ==============================
titre_partie(2, 'Guide du sapeur-pompier')

p('Cette partie s’adresse à tous les sapeurs-pompiers qui font une tournée. Tout se '
  'passe sur le <b>téléphone</b>, et tout tient en quelques gestes simples.')

p('2.1 — L’écran principal', 'h1')
p('Une fois connecté, vous arrivez sur la carte de votre secteur. Chaque point est '
  'une maison à visiter.')
image('membre-carte', 6.8, 'La carte : les points de couleur sont les maisons de votre tournée')
p('<b>Les boutons ronds, en bas à droite :</b>')
tableau(['Bouton', 'À quoi il sert'], [
    ['<b>Satellite</b> (image aérienne)', 'Basculer entre le plan classique et la '
     'photo aérienne — pratique pour repérer une maison isolée ou un chemin'],
    ['<b>Liste</b> (bloc-notes)', 'Afficher la liste des adresses classées de la plus '
     'proche à la plus lointaine'],
    ['<b>Position</b> (punaise)', 'Afficher votre position : un point bleu vous suit '
     'sur la carte'],
], [5.4 * cm, 11 * cm])

p('2.2 — Retrouver sa tournée', 'h1')
p('Appuyez sur le bouton rouge <b>Tournées</b> en haut à droite. Vous voyez la '
  'tournée qui vous a été attribuée, avec toutes ses informations :')
image('membre-fiche-tournee', 8.5, 'La fiche d’une tournée')
p('On y lit le nombre de maisons, une <b>estimation du nombre de calendriers</b> et '
  'surtout <b>combien de paquets prendre</b> avant de partir. Une étoile signale '
  'votre tournée.')
encadre('Vous ne voyez que votre tournée — c’est normal',
        'Pour ne pas vous encombrer, l’application n’affiche que la tournée de votre '
        'équipe. Les autres apparaissent en gris avec un bouton « Afficher » : '
        'appuyez dessus si vous avez besoin de les voir.')

p('2.3 — Marquer une maison : le geste principal', 'h1')
p('C’est l’opération que vous répéterez tout au long de la tournée.')
etapes([
    'Appuyez sur le point de la maison sur la carte (ou sur son nom dans la liste).',
    'Une fiche remonte du bas de l’écran avec l’adresse.',
    'Appuyez sur l’un des <b>quatre gros boutons</b> selon ce qui s’est passé.',
    'Le point change de couleur immédiatement, chez vous et chez vos collègues.',
])
image('membre-fiche-maison', 7.5, 'La fiche d’une maison : ici le calendrier a été distribué')
p('Quand vous choisissez <b>Distribué</b>, deux cases apparaissent :')
puces([
    '<b>Somme</b> : ce que les habitants ont donné. C’est <b>facultatif</b> — vous '
    'pouvez laisser vide et tout compter à la fin.',
    '<b>Calendriers laissés</b> : en général 1, à modifier s’ils en ont pris plusieurs.',
])
p('Si vous choisissez <b>Absent, à repasser</b>, vous pouvez programmer un '
  '<b>rappel</b> avec une date et une heure : le téléphone vous préviendra le moment '
  'venu. La case <b>Note</b> sert à tout le reste : « sonnette cassée », « chien '
  'méchant », « repasser après 18 h »…')

p('2.4 — Un immeuble avec plusieurs appartements', 'h1')
p('Pour un immeuble, vous pouvez valider <b>chaque appartement séparément</b>.')
etapes([
    'Ouvrez la fiche de l’adresse et appuyez sur <b>Immeuble</b> en haut.',
    'Appuyez sur <b>Ajouter un appartement</b> autant de fois que nécessaire.',
    'Indiquez l’étage (RDC, 1er…) et le numéro ou la porte.',
    'Pour chaque appartement, appuyez sur la pastille de couleur correspondante.',
    'Dès qu’un appartement passe au vert, une case <b>Calendriers pris</b> apparaît : '
    'indiquez-y le nombre s’ils en ont pris plusieurs (sinon, 1 est compté).',
])
image('membre-fiche-immeuble', 7.5,
      'Un immeuble : chaque appartement a son statut et son nombre de calendriers')
encadre('L’application calcule toute seule',
        'La couleur du point sur la carte se met à jour automatiquement : il reste '
        'rouge tant qu’un appartement est « à repasser », gris s’il reste du travail, '
        'et passe au vert quand l’immeuble est terminé. Le <b>total des calendriers</b> '
        'de l’immeuble s’affiche en haut de la liste et part directement dans le '
        'décompte de fin de tournée.')

p('2.5 — La liste des adresses les plus proches', 'h1')
p('Le bouton <b>Liste</b> (le bloc-notes) affiche toutes les adresses <b>classées '
  'par distance</b>, de la plus proche à la plus éloignée. Très pratique pour ne '
  'rien oublier dans une rue.')
image('membre-liste', 7.2, 'Les adresses triées par proximité, avec le compteur '
      'd’avancement en haut')
p('Le compteur en haut (« 52/136 faites ») vous indique où vous en êtes. Appuyez sur '
  'une ligne pour ouvrir directement la fiche de cette maison.')

p('2.6 — Se faire guider en voiture', 'h1')
p('Pour une maison isolée ou un hameau que vous ne connaissez pas :')
etapes([
    'Maintenez le doigt appuyé <b>une seconde</b> sur l’endroit voulu sur la carte '
    '(le téléphone vibre légèrement).',
    'Un menu propose les applications de navigation de votre téléphone.',
    'Choisissez la vôtre : l’itinéraire s’ouvre directement.',
])
image('membre-navigation', 7.2, 'Le menu « S’y rendre » (ici sur un téléphone Android)')
encadre('Selon votre téléphone',
        'Sur iPhone, vous verrez <b>Plans</b>, Google Maps et Waze. Sur Android, '
        'Google Maps, Waze et « Autre application » qui laisse le téléphone vous '
        'proposer toutes vos applications de navigation.')

p('2.7 — Suivre l’avancement', 'h1')
p('Le bouton <b>Synthèse</b> en haut de l’écran montre l’avancement de la campagne : '
  'nombre de calendriers distribués, pourcentage d’avancement et répartition des '
  'maisons par couleur.')
image('membre-synthese', 7.5, 'La synthèse vue par un sapeur-pompier')
encadre('Confidentialité',
        'Les montants d’argent ne sont visibles que par les administrateurs. Un '
        'compte Normal voit uniquement l’avancement de la prospection.')

p('2.8 — Terminer sa tournée', 'h1')
p('Quand la tournée est finie, les membres de l’équipe font le décompte de la '
  'recette avec le bouton <b>drapeau</b> sur la fiche de la tournée. Cette étape est '
  'décrite en détail en <b>partie 3.9</b> : elle est identique sur téléphone et sur '
  'ordinateur.')

p('2.9 — Corriger ou ajouter une adresse', 'h1')
p('Si une maison manque ou si une adresse est fausse, vous pouvez la corriger '
  'directement depuis le terrain :')
puces([
    '<b>Ajouter</b> : bouton « + Adresse » sur la fiche de la tournée, puis appuyez '
    'à l’endroit voulu sur la carte.',
    '<b>Renommer</b> ou <b>Déplacer</b> : boutons en bas de la fiche de l’adresse.',
    '<b>Supprimer</b> : bouton corbeille, pour une maison qui n’existe pas (garage, '
    'hangar…).',
])

p('2.10 — Si vous n’avez plus de réseau', 'h1')
p('Aucun problème : un bandeau orange « Hors ligne » apparaît, et vous pouvez '
  '<b>continuer à travailler normalement</b>. Tout est enregistré dans le téléphone, '
  'et repart automatiquement vers les collègues dès que le réseau revient. Les '
  'portions de carte déjà consultées restent affichées.')

p('2.11 — Les notifications', 'h1')
p('À la première ouverture, l’application vous propose d’activer les notifications. '
  'Acceptez : vous serez prévenu quand un rappel « à repasser » arrive à échéance et '
  'quand l’administrateur vous affecte à une équipe ou change votre tournée.')

# ============================== PARTIE 3 ==============================
titre_partie(3, 'Guide de l’administrateur')

p('Cette partie s’adresse aux comptes <b>Administrateur</b>. Le travail de '
  'préparation se fait plus confortablement sur un <b>ordinateur</b>, mais tout '
  'reste possible depuis un téléphone.')

p('3.1 — L’écran d’administration', 'h1')
image('admin-vue-ensemble', 15.5, 'L’écran principal d’un administrateur : la liste '
      'des tournées à gauche, la carte à droite')
p('Par rapport à un compte Normal, vous disposez en plus :')
puces([
    'des <b>outils de dessin</b> en haut à gauche de la carte, pour tracer les tournées ;',
    'du bouton <b>Membres</b>, pour gérer les comptes ;',
    'des montants et des exports dans la <b>Synthèse</b> ;',
    'de la <b>visibilité de toutes les tournées</b>.',
])

p('3.2 — Passer en « vue membre » pour simplifier l’écran', 'h1')
p('Un administrateur voit beaucoup de boutons — c’est vite chargé sur un téléphone. '
  'Vous pouvez donc <b>basculer votre affichage</b> en un clic pour voir '
  'l’application exactement comme un sapeur-pompier, le temps de faire votre tournée.')
p('Le bouton se trouve à côté de votre nom, en haut de l’écran :')
image('bascule-admin', 8, 'En vue administrateur : cliquez sur le bouton rouge « Admin »')
image('bascule-membre', 8.6, 'En vue membre : cliquez sur « Vue membre » pour revenir')
p('En vue membre, l’application masque les outils de dessin, le bouton Membres, les '
  'champs de réglage des tournées, les montants dans la synthèse, et n’affiche plus '
  'que la tournée de votre équipe. Vous retrouvez tous vos droits en recliquant sur '
  'le bouton.')
encadre('Rien n’est perdu',
        'Ce réglage ne change que votre affichage, sur cet appareil : vos droits '
        'd’administrateur restent intacts et rien n’est modifié pour les autres. '
        'Le choix est mémorisé, vous pouvez donc laisser votre téléphone en vue '
        'membre toute la campagne.')

p('3.3 — Créer les comptes des sapeurs-pompiers', 'h1')
p('Bouton <b>Membres</b> en haut à droite.')
etapes([
    'Remplissez le nom, l’e-mail de connexion et un <b>mot de passe initial</b> '
    '(6 caractères minimum).',
    'Indiquez le centre de secours et choisissez le rôle : <b>Normal</b> pour un '
    'sapeur-pompier, <b>Admin</b> pour un responsable.',
    'Cliquez sur <b>Créer le compte</b>, puis communiquez l’e-mail et le mot de passe '
    'à l’intéressé : il peut se connecter immédiatement.',
])
image('admin-membres', 15.5, 'La fenêtre Membres (les noms affichés sont des exemples)')
p('Dans la liste, vous pouvez à tout moment modifier un nom, un centre ou un rôle, '
  'changer un mot de passe oublié (bouton <b>clé</b>) ou supprimer un compte '
  '(bouton <b>corbeille</b>).')
encadre('Sécurité',
        'Vous ne pouvez pas modifier le mot de passe d’un autre administrateur ni le '
        'supprimer : il faut d’abord lui retirer le rôle Admin. Un compte supprimé '
        'est déconnecté automatiquement en moins d’une minute, où qu’il soit.')

p('3.4 — Ouvrir la campagne de l’année', 'h1')
p('Bouton <b>Campagne</b> (icône calendrier). Créez la campagne — par exemple '
  '« 2026 » — puis renseignez deux informations :')
puces([
    'le <b>nombre de calendriers commandés</b> ;',
    'la <b>taille des paquets</b> livrés (par exemple 25).',
])
image('admin-campagne', 15.5, 'La fenêtre Campagne : compteurs et lots')
p('Grâce à ces deux chiffres, chaque tournée affiche automatiquement <b>combien de '
  'paquets prendre</b> avant de partir, et les compteurs de stock se mettent à jour '
  'au fil de la distribution.')

p('3.5 — Les calendriers donnés en lots', 'h1')
p('Tous les calendriers ne partent pas en tournée : on en remet aussi par paquets '
  'aux <b>JSP</b>, à la mairie, à des commerçants ou à des collègues. La section '
  '<b>Calendriers donnés en lots</b>, dans la fenêtre Campagne, sert exactement à ça.')
etapes([
    'Cliquez sur <b>Ajouter un lot</b>.',
    'Indiquez le <b>bénéficiaire</b> (« JSP », « Mairie »…) et le <b>nombre</b> de '
    'calendriers remis.',
    'Renseignez le <b>montant</b> s’il y a eu une contrepartie — c’est facultatif, '
    'laissez vide sinon.',
    'La <b>date</b> est remplie automatiquement avec le jour même ; vous pouvez la '
    'corriger.',
])
encadre('Ce que ça change dans les comptes',
        'Les calendriers d’un lot sont <b>déduits du stock</b> (compteur « donnés en '
        'lots », puis « restants »), et les montants saisis <b>s’ajoutent au total '
        'collecté</b> de la campagne. Le détail apparaît dans la Synthèse et dans '
        'l’export Excel, sur une feuille « Lots ».')

p('3.6 — Dessiner les tournées sur la carte', 'h1')
p('C’est la préparation la plus importante — et la plus impressionnante : les '
  'adresses apparaissent toutes seules.')
etapes([
    'Cherchez votre commune dans la barre de recherche en haut.',
    'Cliquez sur l’outil <b>polygone</b> (ou <b>rectangle</b>) en haut à gauche de '
    'la carte.',
    'Cliquez point par point pour entourer le secteur, puis cliquez sur <b>Terminer</b>.',
    'Patientez quelques secondes : l’application récupère la liste officielle des '
    'adresses et place un point sur chacune.',
    'Donnez un nom à la tournée en cliquant sur son titre dans le panneau de gauche.',
])
image('admin-fiche-tournee', 8.5, 'La fiche d’une tournée côté administrateur')
p('Vous pouvez ensuite renseigner la <b>disponibilité conseillée</b> (« 2 équipes, '
  '3 soirées ») et le nombre de calendriers <b>distribués l’an dernier</b>, qui sert '
  'de référence pour les paquets à prendre.')
encadre('À savoir',
        'Les tournées sont enregistrées définitivement : elles resservent chaque '
        'année. Vous pouvez modifier le contour à tout moment (outil de modification), '
        'ajouter une adresse oubliée ou supprimer un point inutile — l’application se '
        'souvient de vos suppressions même si vous redessinez la zone.')

p('3.7 — Composer les équipes', 'h1')
p('Bouton <b>Équipes</b>.')
etapes([
    'Tapez un nom d’équipe (« Équipe 1 », « Les anciens »…) et cliquez sur '
    '<b>Créer l’équipe</b>.',
    'Ajoutez ses membres avec le menu <b>Ajouter un membre</b>.',
    'Choisissez la tournée à lui attribuer dans le menu déroulant de droite.',
])
image('admin-equipes', 15.5, 'La fenêtre Équipes')
encadre('Les intéressés sont prévenus immédiatement',
        'Dès que vous attribuez ou changez une tournée, les membres concernés '
        'reçoivent une notification sur leur téléphone et voient une étoile sur leur '
        'tournée. Vous pouvez faire ces changements en pleine tournée, y compris '
        'depuis votre téléphone.')

p('3.8 — Suivre l’avancement et exporter', 'h1')
p('Bouton <b>Synthèse</b>. Vous y trouvez, en un coup d’œil : le total collecté '
  '(tournées et lots compris), le nombre de calendriers distribués, l’avancement, '
  'le stock restant, deux graphiques et le détail par tournée.')
image('admin-synthese', 15.5, 'La synthèse complète, réservée aux administrateurs')
p('En bas, le tableau <b>Historique par tournée</b> se remplit d’année en année : '
  'vous pourrez comparer les campagnes entre elles. Le bouton <b>Exporter tout en '
  'Excel</b> produit un classeur avec cinq feuilles (tournées, adresses, décomptes, '
  'lots, campagne) — idéal pour la comptabilité de l’amicale.')

p('3.9 — Le décompte de fin de tournée', 'h1')
p('Quand une équipe a terminé, elle ouvre le décompte avec le bouton <b>drapeau</b> '
  'de la tournée. Réservé aux membres de l’équipe concernée et aux administrateurs.')
etapes([
    'L’application vérifie d’abord s’il reste des maisons à faire ou à repasser et '
    'vous prévient.',
    'Vérifiez les <b>participants</b> (pré-remplis avec l’équipe) et ajoutez les '
    '<b>demi-journées effectuées</b>, en précisant qui a pris sa voiture.',
    'Corrigez si besoin le nombre de <b>calendriers distribués</b>.',
    'Comptez la recette : pièces, billets, chèques et carte bancaire. <b>Le total se '
    'calcule tout seul.</b>',
    'Cliquez sur <b>Valider la fin de tournée</b> : un numéro de reçu est attribué.',
])
image('admin-decompte', 14, 'La fenêtre de fin de tournée, avec le total automatique')
encadre('Rien n’est définitif',
        'Un décompte validé peut être rouvert et corrigé : le numéro de reçu reste le '
        'même. Les administrateurs reçoivent une notification à chaque tournée '
        'terminée, avec le montant.')

p('3.10 — Imprimer le reçu', 'h1')
p('Une fois la tournée validée, le bouton <b>Reçu</b> affiche un document prêt à '
  'imprimer, avec le détail de chaque coupure et deux emplacements de signature.')
image('admin-recu', 12, 'Le reçu, prêt à imprimer ou à enregistrer en PDF')
p('Le bouton <b>Imprimer / enregistrer en PDF</b> ouvre la fenêtre d’impression de '
  'votre navigateur : choisissez votre imprimante, ou « Enregistrer au format PDF » '
  'pour le conserver dans les comptes de l’amicale.')

p('3.11 — Clôturer la campagne', 'h1')
p('Une fois toutes les tournées terminées, ouvrez <b>Campagne</b> et cliquez sur '
  '<b>Archiver la campagne</b>. L’application effectue alors automatiquement :')
puces([
    'la <b>photographie complète</b> de la campagne dans les archives ;',
    'la mise à jour du nombre de calendriers <b>distribués l’an dernier</b> pour '
    'chaque tournée ;',
    'la remise à zéro de toutes les maisons (en gris), <b>en gardant la mémoire</b> '
    'des refus et des résultats de l’année ;',
    'l’ajout d’une colonne dans l’historique de la synthèse.',
])
p('Il ne reste plus qu’à créer la campagne de l’année suivante : les tournées, les '
  'adresses et les équipes sont déjà prêtes.')

# ============================== PARTIE 4 ==============================
titre_partie(4, 'En cas de souci')

tableau(['Situation', 'Que faire'], [
    ['<b>Je ne vois aucune tournée sur la carte</b>',
     'C’est normal si vous n’êtes pas encore affecté à une équipe : demandez à '
     'l’administrateur. Vous pouvez aussi appuyer sur « Afficher » à côté d’une '
     'tournée dans le panneau pour la faire apparaître.'],
    ['<b>Un collègue ne voit pas mes modifications</b>',
     'Demandez-lui de fermer et rouvrir l’application. Elle se resynchronise à chaque '
     'ouverture, au retour du réseau et automatiquement toutes les trois minutes.'],
    ['<b>J’ai du mal à appuyer sur les points</b>',
     'Zoomez avec deux doigts : les points s’écartent. L’application rattrape aussi '
     'les appuis un peu à côté en ouvrant la maison la plus proche.'],
    ['<b>J’ai supprimé une adresse par erreur</b>',
     'Utilisez « + Adresse » sur la fiche de la tournée et replacez-la au bon endroit '
     'sur la carte : son nom est retrouvé automatiquement.'],
    ['<b>Un sapeur-pompier a quitté l’amicale</b>',
     'L’administrateur supprime son compte dans Membres. Son téléphone est déconnecté '
     'et vidé des données en moins d’une minute.'],
    ['<b>Mot de passe oublié</b>',
     'L’administrateur en attribue un nouveau dans Membres (bouton clé) et le '
     'communique à l’intéressé.'],
    ['<b>« Synchronisation impossible » s’affiche en rouge</b>',
     'Vos saisies sont conservées sur l’appareil, rien n’est perdu. Si le message '
     'persiste sur tous les appareils, l’administrateur doit redémarrer le projet '
     'depuis le tableau de bord Supabase (Settings → General → Restart project).'],
    ['<b>L’application ne semble pas à jour</b>',
     'Sur ordinateur : Ctrl + F5. Sur téléphone : fermez complètement l’application '
     'et rouvrez-la.'],
], [5.2 * cm, 11.2 * cm])

espace(10)
p('Aide-mémoire du sapeur-pompier', 'h1')
p('À afficher au centre de secours ou à garder dans la poche.')
tableau(['Le geste', 'Comment faire'], [
    ['Marquer une maison', 'Appuyer sur le point, puis sur la couleur qui convient'],
    ['Noter la somme reçue', 'Choisir « Distribué », puis remplir la case Somme '
     '(facultatif)'],
    ['Programmer un repassage', 'Choisir « Absent », puis renseigner la date et l’heure '
     'du rappel'],
    ['Compter un immeuble', 'Bouton « Immeuble », un appartement par ligne, puis '
     '« Calendriers pris »'],
    ['Voir les adresses proches', 'Bouton Liste (bloc-notes) en bas à droite'],
    ['Se faire guider en voiture', 'Appui long d’une seconde sur la carte'],
    ['Voir ma position', 'Bouton Position (punaise) en bas à droite'],
    ['Photo aérienne', 'Bouton Satellite en bas à droite'],
    ['Faire le décompte final', 'Bouton drapeau sur la fiche de la tournée'],
], [5.2 * cm, 11.2 * cm])

espace(14)
t = Table([[Paragraph(
    'Une question, une idée d’amélioration ou un problème ? Parlez-en à '
    'l’administrateur de l’application : elle continue d’évoluer avec vos retours.',
    ParagraphStyle('fin', fontName=F, fontSize=10.5, leading=15,
                   textColor=colors.white, alignment=TA_CENTER))]],
    colWidths=[16.4 * cm])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, -1), MARINE),
    ('LEFTPADDING', (0, 0), (-1, -1), 16),
    ('RIGHTPADDING', (0, 0), (-1, -1), 16),
    ('TOPPADDING', (0, 0), (-1, -1), 14),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
]))
histoire.append(t)


# ============================== MISE EN PAGE ==============================
def pied_de_page(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFont(F, 8.5)
        canvas.setFillColor(GRIS)
        canvas.drawString(2.1 * cm, 1.25 * cm,
                          'Tournées Calendriers — Mode d’emploi')
        canvas.drawRightString(A4[0] - 2.1 * cm, 1.25 * cm, f'Page {doc.page}')
        canvas.setStrokeColor(BORDURE)
        canvas.setLineWidth(0.6)
        canvas.line(2.1 * cm, 1.6 * cm, A4[0] - 2.1 * cm, 1.6 * cm)
    canvas.restoreState()


doc = BaseDocTemplate(SORTIE, pagesize=A4,
                      leftMargin=2.1 * cm, rightMargin=2.1 * cm,
                      topMargin=2 * cm, bottomMargin=2.1 * cm,
                      title='Tournées Calendriers — Mode d’emploi',
                      author='Amicale des Sapeurs-Pompiers',
                      subject='Tutoriel d’utilisation de l’application')
cadre = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='normal')
doc.addPageTemplates([PageTemplate(id='page', frames=[cadre], onPage=pied_de_page)])
doc.build(histoire)
print('PDF généré :', SORTIE, os.path.getsize(SORTIE) // 1024, 'Ko')
