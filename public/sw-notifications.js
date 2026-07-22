// Clic sur une notification : ramène dans l'application (ou l'ouvre).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      for (const fenetre of fenetres) {
        if ('focus' in fenetre) return fenetre.focus();
      }
      return self.clients.openWindow('./');
    }),
  );
});
