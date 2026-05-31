// Centralized server URL resolver for client-side fetches
// - In development, if running on localhost or a private LAN IP, it uses the same host with port 1999
// - Otherwise, falls back to local server development.

export function getAppServerBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_SERVER_URL;

  // If we have an explicit env URL, use it
  if (envUrl && envUrl.trim().length > 0) {
    return envUrl.replace(/\/$/, '');
  }

  // Development / local network: use current hostname with port 1999
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocalHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      /^192\.168\.\d+\.\d+$/.test(host) ||
      /^10\.\d+\.\d+\.\d+$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);

    if (isLocalHost) {
      return `http://${host}:1999`;
    }
  }

  return (process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:1999').replace(
    /\/$/,
    ''
  );
}
