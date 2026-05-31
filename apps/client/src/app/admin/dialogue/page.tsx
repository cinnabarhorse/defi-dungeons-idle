import { Suspense } from 'react';
import DialogueClient from './dialogue-client';

export const dynamic = 'force-dynamic';

export default function AdminDialoguePage() {
	return (
		<div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 font-mono">
			<header className="border-b border-slate-900 bg-slate-950/80 px-6 py-4 backdrop-blur">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h1 className="text-xl font-semibold text-white">Dialogue Simulator</h1>
						<p className="text-sm text-slate-400">
							Interact with NPC dialogues outside of the game.
						</p>
					</div>
				</div>
			</header>
			<main className="flex-1 overflow-auto p-6">
				<Suspense fallback={<div className="text-sm text-slate-400">Loading…</div>}>
					<DialogueClient />
				</Suspense>
			</main>
		</div>
	);
}












