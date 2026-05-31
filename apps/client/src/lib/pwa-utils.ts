/**
 * PWA (Progressive Web App) utility functions
 * Handles "Add to Home Screen" prompts and Safari toolbar hiding
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

/**
 * Initialize PWA event listeners and service worker
 */
export function initializePWA(): () => void {
  // In development, actively unregister any existing service workers to avoid caching dev assets
  const isProduction = process.env.NODE_ENV === 'production';
  if ('serviceWorker' in navigator) {
    if (isProduction) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    } else {
      // Dev: ensure no SW is controlling the page
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      // Also clear caches created by previous SW sessions
      if (typeof caches !== 'undefined' && caches.keys) {
        caches
          .keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => {});
      }
    }
  }

  const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    console.log('PWA install prompt available');
  };

  const handleAppInstalled = () => {
    console.log('PWA was installed');
    deferredPrompt = null;
  };

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);

  // Return cleanup function
  return () => {
    window.removeEventListener(
      'beforeinstallprompt',
      handleBeforeInstallPrompt
    );
    window.removeEventListener('appinstalled', handleAppInstalled);
  };
}

/**
 * Check if the app can be installed (PWA install prompt is available)
 */
export function canInstallPWA(): boolean {
  return deferredPrompt !== null;
}

/**
 * Check if the app is already installed as a PWA
 */
export function isPWAInstalled(): boolean {
  // Check if running in standalone mode
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  // Check for iOS Safari in standalone mode
  if ((window.navigator as any).standalone === true) {
    return true;
  }

  // Check for Android Chrome PWA
  if (window.matchMedia('(display-mode: minimal-ui)').matches) {
    return true;
  }

  return false;
}

/**
 * Check if running on iOS Safari
 */
export function isIOSSafari(): boolean {
  const userAgent = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isSafari =
    /Safari/.test(userAgent) && !/Chrome|CriOS|OPiOS|FxiOS/.test(userAgent);
  return isIOS && isSafari;
}

/**
 * Check if running on Android Chrome
 */
export function isAndroidChrome(): boolean {
  const userAgent = window.navigator.userAgent;
  const isAndroid = /Android/.test(userAgent);
  const isChrome = /Chrome/.test(userAgent) && !/Edge|OPR/.test(userAgent);
  return isAndroid && isChrome;
}

/**
 * Get the appropriate install message based on the platform
 */
export function getInstallMessage(): string {
  if (isPWAInstalled()) {
    return 'App is installed';
  }

  if (isIOSSafari()) {
    return 'Tap Share → Add to Home Screen for the best experience';
  }

  if (isAndroidChrome() && canInstallPWA()) {
    return 'Install app for the best experience';
  }

  if (isAndroidChrome()) {
    return 'Use Chrome menu → Add to Home Screen for the best experience';
  }

  return 'Add to Home Screen for the best experience';
}

/**
 * Show the PWA install prompt (Chrome/Edge)
 */
export async function showInstallPrompt(): Promise<boolean> {
  if (!deferredPrompt) {
    console.warn('Install prompt not available');
    return false;
  }

  try {
    // Show the install prompt
    await deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    console.log(`User response to install prompt: ${outcome}`);

    // Clear the deferred prompt since it can only be used once
    deferredPrompt = null;

    return outcome === 'accepted';
  } catch (error) {
    console.error('Failed to show install prompt:', error);
    return false;
  }
}

/**
 * Attempt to hide Safari's toolbar by scrolling
 * This is a workaround for iOS Safari's minimal-ui behavior
 */
export function hideSafariToolbar(): void {
  if (!isIOSSafari()) {
    return;
  }

  // Scroll to top to hide the address bar
  window.scrollTo(0, 0);

  // Set viewport height to account for Safari's dynamic viewport
  const setViewportHeight = () => {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  };

  setViewportHeight();

  // Update on resize/orientation change
  window.addEventListener('resize', setViewportHeight);
  window.addEventListener('orientationchange', () => {
    setTimeout(setViewportHeight, 100);
  });
}

/**
 * Get PWA status information
 */
export interface PWAStatus {
  isInstalled: boolean;
  canInstall: boolean;
  isIOSSafari: boolean;
  isAndroidChrome: boolean;
  message: string;
}

export function getPWAStatus(): PWAStatus {
  return {
    isInstalled: isPWAInstalled(),
    canInstall: canInstallPWA(),
    isIOSSafari: isIOSSafari(),
    isAndroidChrome: isAndroidChrome(),
    message: getInstallMessage(),
  };
}

/**
 * Handle the main PWA action (install or show instructions)
 */
export async function handlePWAAction(): Promise<{
  success: boolean;
  message: string;
  action:
    | 'installed'
    | 'prompt-shown'
    | 'instructions-shown'
    | 'already-installed';
}> {
  const status = getPWAStatus();

  if (status.isInstalled) {
    return {
      success: true,
      message: 'App is already installed',
      action: 'already-installed',
    };
  }

  // For Chrome/Edge with available install prompt
  if (
    status.canInstall &&
    (isAndroidChrome() || /Chrome|Edge/.test(navigator.userAgent))
  ) {
    const installed = await showInstallPrompt();
    return {
      success: installed,
      message: installed
        ? 'App installation started'
        : 'Installation cancelled',
      action: 'prompt-shown',
    };
  }

  // For iOS Safari or other browsers, show instructions
  return {
    success: true,
    message: status.message,
    action: 'instructions-shown',
  };
}
