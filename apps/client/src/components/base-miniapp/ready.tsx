'use client';

import { useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';

export function BaseMiniAppReady() {
  useEffect(() => {
    // Call immediately on mount
    void sdk.actions.ready();

    // Some hosts attach message listeners slightly after initial render.
    // Fire again shortly after and when the document becomes visible.
    const retryTimer = setTimeout(() => {
      void sdk.actions.ready();
    }, 300);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void sdk.actions.ready();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    // Also send once when the window fully loads
    const onLoad = () => {
      void sdk.actions.ready();
    };
    window.addEventListener('load', onLoad, {
      once: true,
    } as AddEventListenerOptions);

    return () => {
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('load', onLoad);
    };
  }, []);
  return null;
}
