import type { MetadataRoute } from 'next';

function getBaseUrl() {
  // Prefer explicit public URL; fall back to known production domain.
  const envUrl = (process.env.NEXT_PUBLIC_URL || '').replace(/\/$/, '');
  return envUrl || 'https://dungeons.aavegotchi.com';
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
