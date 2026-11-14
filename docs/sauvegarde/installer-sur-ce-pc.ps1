# ===================================================================
#  INSTALLE LA SAUVEGARDE AUTOMATIQUE SUR CET ORDINATEUR
#  Amicale des sapeurs-pompiers de Saint-Léonard-de-Noblat
# ===================================================================
#
# Crée une tâche Windows « Sauvegarde calendriers pompiers » qui se déclenche
# à 6 h, 13 h et 23 h. Si l'ordinateur était éteint à l'heure prévue, la
# sauvegarde se fait dès l'ouverture de session suivante ; s'il était en
# veille, Windows le réveille.
#
# À lancer une seule fois. Aucun droit administrateur nécessaire.
# Pour désinstaller :  .\installer-sur-ce-pc.ps1 -Desinstaller

param(
  [switch]$Desinstaller,
  # Pour forcer un autre dossier de destination que celui détecté.
  [string]$Dossier
)

$ErrorActionPreference = 'Stop'
$NomTache = 'Sauvegarde calendriers pompiers'
$Script = Join-Path $PSScriptRoot 'sauvegarder-sur-ce-pc.mjs'

# ----------------------------------------------------- désinstallation
if ($Desinstaller) {
  $existante = Get-ScheduledTask -TaskName $NomTache -ErrorAction SilentlyContinue
  if ($existante) {
    Unregister-ScheduledTask -TaskName $NomTache -Confirm:$false
    Write-Host "Tâche « $NomTache » supprimée. Les sauvegardes déjà faites restent en place."
  } else {
    Write-Host "Aucune tâche « $NomTache » à supprimer."
  }
  return
}

# ------------------------------------------------------- vérifications
if (-not (Test-Path $Script)) {
  throw "Le script de sauvegarde est introuvable : $Script"
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  throw "Node.js est introuvable. Installez-le depuis https://nodejs.org puis relancez."
}
Write-Host "Node.js : $node"

# Le script sait tout seul où écrire (dossier Google Drive s'il existe,
# sinon Documents). On lui demande, pour préparer la clé au bon endroit.
$argsOu = @($Script, '--ou')
if ($Dossier) { $argsOu += @('--dossier', $Dossier) }
$destination = (& $node @argsOu | Select-Object -Last 1).Trim()
if (-not $destination) { throw "Impossible de déterminer le dossier de destination." }
Write-Host "Dossier de sauvegarde : $destination"

# -------------------------------------------- clé et mode d'emploi local
$cheminCle = Join-Path $destination 'cle.txt'
if (-not (Test-Path $cheminCle)) {
  $modele = @'
# Collez ci-dessous, sur une seule ligne, la clé « service_role » de Supabase.
# Où la trouver : https://supabase.com/dashboard → le projet → roue dentée
# « Project Settings » → « API Keys » → partie service_role → cliquez sur
# l'œil pour l'afficher, puis copiez-la en entier.
# Elle commence par « ey » et fait plusieurs centaines de caractères.
# Enregistrez ce fichier (Ctrl+S) et c'est tout : la prochaine sauvegarde partira.
#
# Cette clé donne accès à toute la base : ne la mettez ni dans un courriel,
# ni dans un message, ni sur le dépôt GitHub (qui est public).

'@
  Set-Content -Path $cheminCle -Value $modele -Encoding UTF8
  Write-Host "Fichier de clé préparé : $cheminCle"
}

$lireMoi = @"
SAUVEGARDE DES TOURNÉES CALENDRIERS
===================================

Ce dossier se remplit tout seul, trois fois par jour : 6 h, 13 h et 23 h.

  sauvegarde-AAAA-MM-JJ-HHh.json.gz
      La vraie sauvegarde, compressée. C'est elle qui permet de tout remettre
      en place. Inutile de l'ouvrir.

  derniere-sauvegarde-tournees.csv
  derniere-sauvegarde-adresses.csv
  derniere-sauvegarde-decomptes.csv
      La dernière photo, lisible dans Excel, remplacée à chaque passage.

  journal.txt
      L'historique des passages, avec le motif en cas d'échec.

  SAUVEGARDE-EN-ECHEC-LIRE-MOI.txt
      N'apparaît qu'en cas de problème, et disparaît tout seul dès que la
      sauvegarde repasse. S'il est là, ouvrez-le.

  corbeille\
      Les sauvegardes trop anciennes y sont déplacées (jamais effacées) :
      tout est gardé 60 jours, puis une par jour pendant un an, puis une par
      mois. Videz ce sous-dossier quand vous voulez.

  cle.txt
      La clé de lecture de la base. Ne la communiquez à personne.

Pour lancer une sauvegarde tout de suite, sans attendre :
  Touche Windows -> taper « Planificateur de tâches » -> Bibliothèque ->
  clic droit sur « $NomTache » -> Exécuter.

Si l'ordinateur est éteint à l'heure prévue, la sauvegarde se fait à
l'ouverture de session suivante. S'il est en veille, Windows le réveille.
"@
Set-Content -Path (Join-Path $destination 'LIRE-MOI.txt') -Value $lireMoi -Encoding UTF8

# ------------------------------------------------------------- la tâche
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$Script`"" -WorkingDirectory $PSScriptRoot

$declencheurs = @(
  (New-ScheduledTaskTrigger -Daily -At ([datetime]'06:00')),
  (New-ScheduledTaskTrigger -Daily -At ([datetime]'13:00')),
  (New-ScheduledTaskTrigger -Daily -At ([datetime]'23:00'))
)

# StartWhenAvailable : rattrape un horaire manqué (ordinateur éteint).
# WakeToRun          : sort l'ordinateur de veille pour sauvegarder.
# IgnoreNew          : si une sauvegarde tourne encore, on n'en lance pas deux.
$reglages = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -WakeToRun `
  -DontStopOnIdleEnd `
  -AllowStartIfOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# Interactive : la tâche tourne dans la session de l'utilisateur, sans avoir
# à enregistrer son mot de passe — et c'est aussi la seule façon de voir un
# lecteur Google Drive (G:), qui n'existe que dans la session ouverte.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $NomTache `
  -Action $action `
  -Trigger $declencheurs `
  -Settings $reglages `
  -Principal $principal `
  -Description "Sauvegarde l'avancement des tournées calendriers dans : $destination" `
  -Force | Out-Null

Write-Host ''
Write-Host "Tâche « $NomTache » installée : 6 h, 13 h et 23 h."
$tache = Get-ScheduledTask -TaskName $NomTache
$infos = $tache | Get-ScheduledTaskInfo
Write-Host "Prochaine exécution : $($infos.NextRunTime)"
Write-Host ''

if ((Get-Content $cheminCle -Raw) -notmatch '(?m)^\s*ey') {
  Write-Host "IL RESTE UNE CHOSE À FAIRE :" -ForegroundColor Yellow
  Write-Host "  ouvrez $cheminCle"
  Write-Host "  collez-y la clé service_role de Supabase, enregistrez."
  Write-Host "  (Tout le reste est en place : la première sauvegarde partira ensuite.)"
} else {
  Write-Host "Essai immédiat…"
  & $node $Script
}
