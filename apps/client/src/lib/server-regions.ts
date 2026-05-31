// Server region configuration - US only
// Multi-region support was removed as idle mode is latency-tolerant

export interface ServerRegion {
  id: string;
  name: string;
  location: string;
  flag: string;
  serverUrl: string;
  status: 'online' | 'offline' | 'checking';
}

// US-only configuration
const US_REGION: ServerRegion = {
  id: 'us-ashburn',
  name: 'United States',
  location: 'Ashburn, USA',
  flag: '🇺🇸',
  serverUrl: process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:1999',
  status: 'online',
};

export const SERVER_REGIONS: ServerRegion[] = [US_REGION];

export function getServerRegion(regionId: string): ServerRegion | undefined {
  // Always return US region regardless of input
  return US_REGION;
}

export function getDefaultRegion(): ServerRegion {
  return US_REGION;
}

export function getServerUrlForRegion(regionId?: string): string {
  // Handle localhost development
  if (
    process.env.NODE_ENV === 'development' &&
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname.match(/^192\.168\.\d+\.\d+$/) ||
      window.location.hostname.match(/^10\.\d+\.\d+\.\d+$/) ||
      window.location.hostname.match(/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/))
  ) {
    // Use the same hostname as the client for mobile development
    const serverHost =
      window.location.hostname === 'localhost'
        ? 'localhost'
        : window.location.hostname;
    return `http://${serverHost}:1999`;
  }

  return US_REGION.serverUrl;
}
