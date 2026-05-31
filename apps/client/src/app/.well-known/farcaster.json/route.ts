function withValidProperties(
  properties: Record<string, undefined | string | string[] | boolean>
) {
  return Object.fromEntries(
    Object.entries(properties).filter(([_, value]) =>
      Array.isArray(value)
        ? value.length > 0
        : value !== undefined && value !== ''
    )
  );
}

export function GET(request: Request) {
  const envUrl = (process.env.NEXT_PUBLIC_URL || '').replace(/\/$/, '');
  const requestOrigin = new URL(request.url).origin;
  const url = (envUrl || requestOrigin).replace(/\/$/, '');
  const ownerAddress = '0xe1B608CA245C954D30B378682d24556DAF862446';

  const baseUrl = 'https://dungeons.aavegotchi.com';

  const properties = {
    version: '1',
    name: 'DeFi Dungeon',
    homeUrl: baseUrl,
    iconUrl: url ? `${url}/images/miniapp_icon.png` : '',
    splashImageUrl: url ? `${url}/images/miniapp_splash.png` : '',
    imageUrl: url ? `${url}/images/miniapp_hero.png` : '',
    splashBackgroundColor: '#8501DB',
    webhookUrl: '',
    description: 'DeFi-themed Dungeon crawler with weekly crypto rewards.',
    subtitle: 'How deep can you go?',
    screenshotUrls: [
      `${url}/images/dds_1.png`,
      `${url}/images/dds_2.png`,
      `${url}/images/dds_3.png`,
    ],
    primaryCategory: 'games',
    heroImageUrl: url ? `${url}/images/miniapp_hero.png` : '',
    tagline: 'Play instantly',
    ogTitle: 'DeFi Dungeon',
    ogDescription: 'Challenge friends live.',
    ogImageUrl: url ? `${url}/images/miniapp_hero.png` : '',
    tags: ['games', 'dungeon', 'onchain', 'aavegotchi', 'defi'],
    noIndex: false,
    buttonTitle: 'Play Now',
  };

  const manifest = {
    accountAssociation: {
      header:
        'eyJmaWQiOjI0OTA1OCwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDE4YTQ1MjVjMTVCNTczRDI5ODQ4MTc3NGMwMzE5RjQ2OTZkMjkwNmEifQ',
      payload: 'eyJkb21haW4iOiJkdW5nZW9ucy5hYXZlZ290Y2hpLmNvbSJ9',
      signature:
        '2WO2pGoUxDH3nKPcyWv1Ifcl4/bTQV/VWxZO+alTZbtOMj9dbu5PJKqiEO0m9hdRc2shW93wUgouvKBkb3ZXcRw=',
    },

    baseBuilder: {
      ownerAddress: ownerAddress,
    },

    miniapp: withValidProperties({
      ...properties,
    }),
    frame: withValidProperties({
      ...properties,
    }),
  };

  return Response.json(manifest);
}
