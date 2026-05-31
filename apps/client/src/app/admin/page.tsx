import Link from 'next/link';
import {
  Map,
  BarChart3,
  Users,
  List,
  ScrollText,
  Database,
  Wallet,
  Banknote,
  FlaskConical,
  ServerCog,
  Clock,
  Coins,
  Store,
  Gamepad2,
} from 'lucide-react';
import { LickTongueTopUpButton } from './lick-tongue-button';

export const dynamic = 'force-dynamic';

export default function AdminIndexPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 font-mono p-8 gap-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Admin</h1>
        <p className="text-sm text-slate-400">Choose a tool below.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/admin/maps"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <Map className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Offline Map Viewer</div>
          </div>
          <div className="text-sm text-slate-400">
            View any map layout locally without a server connection.
          </div>
        </Link>
        <Link
          href="/admin/goldsky-deposits"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Goldsky Deposits</div>
          </div>
          <div className="text-sm text-slate-400">
            Browse recent entries in the Goldsky `public.deposits` sink.
          </div>
        </Link>
        <Link
          href="/admin/stats"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Stats</div>
          </div>
          <div className="text-sm text-slate-400">
            View matches played per day and other admin metrics.
          </div>
        </Link>
        <Link
          href="/admin/players"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Players</div>
          </div>
          <div className="text-sm text-slate-400">
            Look up a player by id or wallet and inspect details.
          </div>
        </Link>
        <Link
          href="/me/admin/runs"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <List className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">All Runs</div>
          </div>
          <div className="text-sm text-slate-400">
            View all dungeon runs across all players.
          </div>
        </Link>
        <Link
          href="/me/admin/logs"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <ScrollText className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Debug Logs</div>
          </div>
          <div className="text-sm text-slate-400">
            Browse and download per-game server debug logs.
          </div>
        </Link>
        <Link
          href="/admin/db"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <Database className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Database Admin</div>
          </div>
          <div className="text-sm text-slate-400">
            Read-only Supabase explorer gated by wallet allowlist.
          </div>
        </Link>
        <Link
          href="/admin/topups"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">USDC Topups</div>
          </div>
          <div className="text-sm text-slate-400">
            View recent USDC deposits across all players.
          </div>
        </Link>
        <Link
          href="/admin/withdrawals"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <Banknote className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Token Withdrawals</div>
          </div>
          <div className="text-sm text-slate-400">
            Approve USDC payouts and monitor onchain status.
          </div>
        </Link>
        <Link
          href="/admin/potions"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <FlaskConical className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Potion Credit Tool</div>
          </div>
          <div className="text-sm text-slate-400">
            Credit HP and Mana potions to players.
          </div>
        </Link>
        <Link
          href="/admin/currency"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <Coins className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Gold + Lick Tongues</div>
          </div>
          <div className="text-sm text-slate-400">
            Credit Gold and Lick Tongues to players.
          </div>
        </Link>
        <Link
          href="/admin/store-sales"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <Store className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Store Sales</div>
          </div>
          <div className="text-sm text-slate-400">
            View wearables sold to the store and daily gold allocation by day.
          </div>
        </Link>
        <Link
          href="/me/admin/simulations/boss-loot"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <FlaskConical className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Boss Loot Simulations</div>
          </div>
          <div className="text-sm text-slate-400">
            View boss currency drop probability analysis across difficulty
            tiers.
          </div>
        </Link>
        <Link
          href="/admin/idle-simulator"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <Gamepad2 className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Idle Stage Simulator</div>
          </div>
          <div className="text-sm text-slate-400">
            Jump into an idle run with custom starting state.
          </div>
        </Link>
        <Link
          href="/admin/servers"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <ServerCog className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Server Slots</div>
          </div>
          <div className="text-sm text-slate-400">
            Inspect PM2 blue/green ports per region with live slot metrics.
          </div>
        </Link>
        <Link
          href="/admin/cron"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:bg-slate-900 transition"
        >
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-slate-300" aria-hidden />
            <div className="text-lg font-semibold">Cron Jobs</div>
          </div>
          <div className="text-sm text-slate-400">
            Daily prize distribution execution history and manual trigger.
          </div>
        </Link>
        <LickTongueTopUpButton />
      </div>
    </div>
  );
}
