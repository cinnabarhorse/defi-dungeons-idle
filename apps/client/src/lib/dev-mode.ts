/**
 * Dev Mode Configuration
 *
 * Allows testing the game with custom equipment, potions, and other settings.
 * Enable by adding ?devMode=true to the URL.
 *
 * URL Parameters:
 * - devMode=true           Enable dev mode
 * - devEquipment=slug1,slug2  Override equipped wearables (comma-separated slugs)
 * - devHealthPotions=10    Set health potion count
 * - devManaPotions=5       Set mana potion count
 * - devLickTongue=3        Set lick tongue count
 * - devStartHp=50          Set starting HP percentage (0-100)
 * - devStartMana=100       Set starting mana percentage (0-100)
 * - devStartFloor=5        Set starting floor depth
 * - devInfiniteResources=true  Unlimited potions, no cooldowns
 */

export interface DevModeConfig {
  enabled: boolean;
  equipment?: string[]; // Wearable slugs to equip
  healthPotions?: number;
  greaterPotions?: number;
  ultraPotions?: number;
  manaPotions?: number;
  lickTongueCount?: number;
  startHpPercent?: number; // 0-100
  startManaPercent?: number; // 0-100
  startFloor?: number;
  startDepth?: number;
  infiniteResources?: boolean;
  skipEntryFee?: boolean;
}

const DEV_MODE_STORAGE_KEY = 'gotchiverse-dev-mode';

/**
 * Parse dev mode configuration from URL parameters
 */
export function parseDevModeFromUrl(): DevModeConfig {
  if (typeof window === 'undefined') {
    return { enabled: false };
  }

  const params = new URLSearchParams(window.location.search);
  const devModeEnabled = params.get('devMode') === 'true';

  if (!devModeEnabled) {
    return { enabled: false };
  }

  const config: DevModeConfig = {
    enabled: true,
  };

  // Parse equipment overrides
  const equipment = params.get('devEquipment');
  if (equipment) {
    config.equipment = equipment.split(',').map((s) => s.trim()).filter(Boolean);
  }

  // Parse potion counts
  const healthPotions = params.get('devHealthPotions');
  if (healthPotions) {
    const value = parseInt(healthPotions, 10);
    if (Number.isFinite(value) && value >= 0) {
      config.healthPotions = value;
    }
  }

  const manaPotions = params.get('devManaPotions');
  if (manaPotions) {
    const value = parseInt(manaPotions, 10);
    if (Number.isFinite(value) && value >= 0) {
      config.manaPotions = value;
    }
  }

  const greaterPotions = params.get('devGreaterPotions');
  if (greaterPotions) {
    const value = parseInt(greaterPotions, 10);
    if (Number.isFinite(value) && value >= 0) {
      config.greaterPotions = value;
    }
  }

  const ultraPotions = params.get('devUltraPotions');
  if (ultraPotions) {
    const value = parseInt(ultraPotions, 10);
    if (Number.isFinite(value) && value >= 0) {
      config.ultraPotions = value;
    }
  }

  const lickTongue = params.get('devLickTongue');
  if (lickTongue) {
    const value = parseInt(lickTongue, 10);
    if (Number.isFinite(value) && value >= 0) {
      config.lickTongueCount = value;
    }
  }

  // Parse starting stats
  const startHp = params.get('devStartHp');
  if (startHp) {
    const value = parseInt(startHp, 10);
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      config.startHpPercent = value;
    }
  }

  const startMana = params.get('devStartMana');
  if (startMana) {
    const value = parseInt(startMana, 10);
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      config.startManaPercent = value;
    }
  }

  const startFloor = params.get('devStartFloor');
  if (startFloor) {
    const value = parseInt(startFloor, 10);
    if (Number.isFinite(value) && value >= 1) {
      config.startFloor = value;
    }
  }

  const startDepth = params.get('devStartDepth');
  if (startDepth) {
    const value = parseInt(startDepth, 10);
    if (Number.isFinite(value) && value >= 1) {
      config.startDepth = value;
    }
  }

  // Parse boolean flags
  if (params.get('devInfiniteResources') === 'true') {
    config.infiniteResources = true;
  }

  if (params.get('devSkipEntryFee') === 'true') {
    config.skipEntryFee = true;
  }

  return config;
}

/**
 * Save dev mode config to localStorage for persistence
 */
export function saveDevModeConfig(config: DevModeConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEV_MODE_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Load dev mode config from localStorage
 */
export function loadDevModeConfig(): DevModeConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(DEV_MODE_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as DevModeConfig;
  } catch {
    return null;
  }
}

/**
 * Clear dev mode config from localStorage
 */
export function clearDevModeConfig(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DEV_MODE_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get the active dev mode config (URL params take priority over localStorage)
 */
export function getDevModeConfig(): DevModeConfig {
  const urlConfig = parseDevModeFromUrl();
  if (urlConfig.enabled) {
    return urlConfig;
  }
  return loadDevModeConfig() || { enabled: false };
}

/**
 * Check if we're running in a development environment
 */
export function isDevEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('.local') ||
    hostname.includes('dev.') ||
    hostname.includes('staging.')
  );
}

/**
 * Build URL with dev mode parameters
 */
export function buildDevModeUrl(config: Partial<DevModeConfig>): string {
  if (typeof window === 'undefined') return '';
  
  const url = new URL(window.location.href);
  
  if (config.enabled) {
    url.searchParams.set('devMode', 'true');
  } else {
    url.searchParams.delete('devMode');
  }

  if (config.equipment?.length) {
    url.searchParams.set('devEquipment', config.equipment.join(','));
  } else {
    url.searchParams.delete('devEquipment');
  }

  if (config.healthPotions !== undefined) {
    url.searchParams.set('devHealthPotions', String(config.healthPotions));
  } else {
    url.searchParams.delete('devHealthPotions');
  }

  if (config.manaPotions !== undefined) {
    url.searchParams.set('devManaPotions', String(config.manaPotions));
  } else {
    url.searchParams.delete('devManaPotions');
  }

  if (config.lickTongueCount !== undefined) {
    url.searchParams.set('devLickTongue', String(config.lickTongueCount));
  } else {
    url.searchParams.delete('devLickTongue');
  }

  if (config.startHpPercent !== undefined) {
    url.searchParams.set('devStartHp', String(config.startHpPercent));
  } else {
    url.searchParams.delete('devStartHp');
  }

  if (config.startManaPercent !== undefined) {
    url.searchParams.set('devStartMana', String(config.startManaPercent));
  } else {
    url.searchParams.delete('devStartMana');
  }

  if (config.startFloor !== undefined) {
    url.searchParams.set('devStartFloor', String(config.startFloor));
  } else {
    url.searchParams.delete('devStartFloor');
  }

  if (config.startDepth !== undefined) {
    url.searchParams.set('devStartDepth', String(config.startDepth));
  } else {
    url.searchParams.delete('devStartDepth');
  }

  if (config.infiniteResources) {
    url.searchParams.set('devInfiniteResources', 'true');
  } else {
    url.searchParams.delete('devInfiniteResources');
  }

  if (typeof config.greaterPotions === 'number') {
    url.searchParams.set('devGreaterPotions', String(config.greaterPotions));
  } else {
    url.searchParams.delete('devGreaterPotions');
  }

  if (typeof config.ultraPotions === 'number') {
    url.searchParams.set('devUltraPotions', String(config.ultraPotions));
  } else {
    url.searchParams.delete('devUltraPotions');
  }

  if (config.skipEntryFee) {
    url.searchParams.set('devSkipEntryFee', 'true');
  } else {
    url.searchParams.delete('devSkipEntryFee');
  }

  return url.toString();
}

/**
 * Convert dev mode config to room join options
 */
export function devModeToRoomOptions(config: DevModeConfig): Record<string, unknown> {
  if (!config.enabled) return {};

  return {
    devMode: true,
    devEquipment: config.equipment,
    devHealthPotions: config.healthPotions,
    devGreaterPotions: config.greaterPotions,
    devUltraPotions: config.ultraPotions,
    devManaPotions: config.manaPotions,
    devLickTongueCount: config.lickTongueCount,
    devStartHpPercent: config.startHpPercent,
    devStartManaPercent: config.startManaPercent,
    devStartFloor: config.startFloor,
    devStartDepth: config.startDepth,
    devInfiniteResources: config.infiniteResources,
    devSkipEntryFee: config.skipEntryFee,
  };
}

