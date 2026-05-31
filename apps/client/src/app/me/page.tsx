import type { Metadata } from 'next';
import { MeView } from './view';
import { SplashBackground } from '../../components/SplashBackground';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Me | DeFi Dungeon',
};

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function isApiKeysUiEnabled(): boolean {
  return parseBooleanEnv(process.env.ENABLE_STAKED_API_KEYS_UI);
}

export default function MePage() {
  return (
    <SplashBackground as="main" className="text-white pb-20">
      <div className="mx-auto w-full max-w-md px-4 py-12 rounded-2xl bg-white/10 backdrop-blur-md ring-1 ring-white/10">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Me</h1>
          <p className="mt-2 text-sm text-white/60">Manage your account</p>
        </header>
        <MeView showApiKeysLink={isApiKeysUiEnabled()} />
      </div>

      {/* bottom tabs now rendered globally in RootLayout */}
    </SplashBackground>
  );
}
