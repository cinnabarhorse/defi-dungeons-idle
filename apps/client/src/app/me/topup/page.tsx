import type { Metadata } from 'next';
import Link from 'next/link';
import { TopupFaq } from '../../../components/topup/faq';
import { TopupForm } from '../../../components/topup/topup-form';
import { TopupHistoryContainer } from '../../../components/topup/history-container';
import { Separator } from '../../../components/ui/Separator';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Top Up | DeFi Dungeon',
};

export default function TopUpPage() {
  return (
    <main className="min-h-screen-safe bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white/90 pb-20">
      <div className="mx-auto w-full max-w-md px-4 py-12">
        <div className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-lg backdrop-blur-md">
          <Link
            href="/me"
            className="mb-6 inline-flex items-center text-sm text-white/70 transition hover:text-white"
          >
            ← Back
          </Link>

          <div className="space-y-10">
            <TopupForm />

            <Separator className="bg-white/10" />

            <TopupHistoryContainer />

            <Separator className="bg-white/10" />

            <TopupFaq />
          </div>
        </div>
      </div>
    </main>
  );
}
