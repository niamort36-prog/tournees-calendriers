// Notifications système (rappels à échéance, affectations d'équipe…).
// Elles fonctionnent quand l'application est ouverte ou en arrière-plan ;
// les notifications « appli fermée » nécessiteront un serveur d'envoi (plus tard).

export function notificationsSupportees(): boolean {
  return 'Notification' in window;
}

export function permissionAccordee(): boolean {
  return notificationsSupportees() && Notification.permission === 'granted';
}

export function permissionADemander(): boolean {
  return notificationsSupportees() && Notification.permission === 'default';
}

export async function demanderPermission(): Promise<boolean> {
  if (!notificationsSupportees()) return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export async function notifier(titre: string, corps?: string): Promise<void> {
  if (!permissionAccordee()) return;
  try {
    // via le service worker si possible (obligatoire sur Android)
    const enregistrement = await navigator.serviceWorker?.getRegistration();
    if (enregistrement) {
      await enregistrement.showNotification(titre, {
        body: corps,
        icon: './icone-192.png',
        badge: './icone-192.png',
        lang: 'fr',
      });
      return;
    }
  } catch {
    // on retombe sur la notification de page
  }
  try {
    new Notification(titre, { body: corps, icon: './icone-192.png' });
  } catch {
    // notifications indisponibles : tant pis, le toast dans l'appli reste
  }
}
