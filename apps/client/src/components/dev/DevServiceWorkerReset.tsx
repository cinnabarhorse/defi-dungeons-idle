'use client';

import { useEffect } from 'react';

const DEV_SW_RESET_FLAG = 'dd-dev-sw-reset-v1';

export function DevServiceWorkerReset() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;

    const resetDevCachesAndServiceWorkers = async () => {
      const registrations = await navigator.serviceWorker
        .getRegistrations()
        .catch(() => []);

      await Promise.all(
        registrations.map((registration) =>
          registration.unregister().catch(() => false)
        )
      );

      if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
        const cacheKeys = await caches.keys().catch(() => []);
        await Promise.all(
          cacheKeys.map((cacheKey) => caches.delete(cacheKey).catch(() => false))
        );
      }

      // If an old SW still controls this page, reload once after unregister.
      if (
        !cancelled &&
        navigator.serviceWorker.controller &&
        !sessionStorage.getItem(DEV_SW_RESET_FLAG)
      ) {
        sessionStorage.setItem(DEV_SW_RESET_FLAG, '1');
        window.location.reload();
      }
    };

    void resetDevCachesAndServiceWorkers();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
