const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    // Supabase spritesheets PNGs
    {
      urlPattern:
        /^https?:\/\/(?:[a-z0-9-]+\.)?supabase\.co\/storage\/v1\/object\/[^/]+\/spritesheets\/.*\.png(?:\?.*)?$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'gotchi-sprites',
        matchOptions: { ignoreSearch: true },
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    // Local sprites path (dev or fallback)
    {
      urlPattern: /^https?:\/\/[^/]+\/spritesheets\/.*\.png(?:\?.*)?$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'gotchi-sprites-local',
        // Treat query params as cache-busters only when they actually change the file.
        // Our spritesheets are versioned by filename, so ignoring search avoids duplicate caches
        // and reduces network requests when servers append tracking/cache params.
        matchOptions: { ignoreSearch: true },
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
});

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin',
  },
  // Allow embedding in Farcaster/Base clients. Use CSP frame-ancestors instead of X-Frame-Options.
  {
    key: 'Content-Security-Policy',
    value:
      'frame-ancestors https://* http://localhost:* http://127.0.0.1:* http://0.0.0.0:*',
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // Strip most console.* calls from production bundles to reduce JS size and
  // avoid doing unnecessary work on the main thread.
  // Keep console.error/console.warn for debugging real issues.
  compiler:
    process.env.NODE_ENV === 'production'
      ? { removeConsole: { exclude: ['error', 'warn'] } }
      : undefined,

  experimental: {
    optimizePackageImports: ['phaser', 'colyseus.js', 'lucide-react'],
    // Increase memory limit for build process
    largePageDataBytes: 128 * 1000, // 128KB
    // Ensure serverless functions for app/api/maps include raw map files
    // from both the monorepo root data/maps and the generated client copy
    // at apps/client/data/maps so fs reads work on Vercel.
    outputFileTracingIncludes: {
      // App Router route keys use the /app path (not /src/app)
      'app/api/maps/(.*)': ['../../data/maps/**', './data/maps/**'],
    },
  },
  webpack: (config, { isServer }) => {
    // Keep watch behavior deterministic for both compilers so external edits
    // (agents/scripts, not just IDE saves) reliably trigger rebuilds.
    const pollingInterval = (() => {
      if (
        process.env.WEBPACK_POLL &&
        !Number.isNaN(Number(process.env.WEBPACK_POLL))
      ) {
        return Number(process.env.WEBPACK_POLL);
      }
      if (process.env.NEXT_DISABLE_POLLING === '1') {
        return undefined;
      }
      return 1000;
    })();

    config.watchOptions = {
      ...(config.watchOptions || {}),
      ignored: [
        '**/node_modules/**',
        '**/.pnpm/**',
        '**/.git/**',
        '**/apps/server/public/spritesheets/**',
      ],
      aggregateTimeout: 300,
      poll: pollingInterval,
    };

    // Phaser webpack configuration
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Optimize memory usage during build
    config.optimization = {
      ...config.optimization,
      splitChunks: {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
          // Split large data files into separate chunks
          wearables: {
            test: /[\\/]wearables\.ts$/,
            name: 'wearables',
            chunks: 'all',
            priority: 30,
            enforce: true,
          },
          assets: {
            test: /[\\/]map-editor-assets\.ts$/,
            name: 'map-assets',
            chunks: 'all',
            priority: 25,
            enforce: true,
          },
          sprites: {
            test: /[\\/](sprite-manager|character-sprite).*\.ts$/,
            name: 'sprite-managers',
            chunks: 'all',
            priority: 20,
            enforce: true,
          },
        },
      },
    };

    return config;
  },
  async headers() {
    if (process.env.NODE_ENV !== 'production') {
      return [
        {
          source: '/(.*)',
          headers: securityHeaders,
        },
      ];
    }

    return [
      // Cache Next.js build assets aggressively. These filenames are content-hashed.
      // This helps first-load and repeat-visit performance (especially for self-hosted deployments).
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Cache Next.js optimized images. This reduces repeat-visit latency and bandwidth.
      {
        source: '/_next/image',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      // Cache local spritesheets aggressively (they are versioned by filename).
      // This helps first-load performance outside of the service worker (e.g. bots/crawlers, cold PWA install).
      {
        source: '/spritesheets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Cache static assets served from /public.
      // Use a shorter max-age than spritesheets since these filenames are not necessarily content-hashed.
      {
        source: '/images/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400', // 7d + SWR
          },
        ],
      },
      {
        source: '/logos/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/loot-icons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/pfp/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/music/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/sfx/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/sprites/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/wearables/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/spells/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
      // Cache data files (maps, JSON, etc.) served from /public/data.
      // Keep TTL shorter than images since these may change without filename hashes.
      {
        source: '/data/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, stale-while-revalidate=86400', // 1h + SWR
          },
        ],
      },
      // Cache low-churn SEO + PWA metadata to reduce repeat-visit latency.
      // Keep TTL modest (SWR) since these files may change without filename hashes.
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        source: '/robots.txt',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        source: '/icon-:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  async redirects() {
    return [
      {
        source: '/itemTypes',
        destination: '/item-types',
        permanent: false,
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
