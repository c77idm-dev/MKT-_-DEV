'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker do modo offline. Só no build de produção: no `next dev` ele atrapalharia o recarregamento.
 * Fica nas telas da bancada (conferência, Recebimento, Conferir pacote); depois de registrado, vale para o site todo.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
