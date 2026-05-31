'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label';

interface DialogueResponseEntry {
	text: string;
	nextDialogue: string;
}

interface DialogueNode {
	text: string;
	responses: DialogueResponseEntry[];
}

interface DialogueData {
	npcId: string;
	npcName: string;
	dialogues: Record<string, DialogueNode>;
}

const PRESETS = [
	{ id: 'portalmage', label: '@portalmage.json' },
	{ id: 'laozigotchi', label: '@laozigotchi.json' },
	{ id: 'stani', label: '@stani.json' },
] as const;

function substitute(template: string, vars: Record<string, string>): string {
	return template.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
		return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '';
	});
}

function simpleMarkdownToHtml(text: string): string {
	// Bold: **text**
	let html = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	// Basic newline to <br />
	html = html.replace(/\n/g, '<br />');
	return html;
}

export default function DialogueClient() {
	const [selectedId, setSelectedId] = useState<string>('portalmage');
	const [playerName, setPlayerName] = useState<string>('Admin');
	const [data, setData] = useState<DialogueData | null>(null);
	const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
	const [history, setHistory] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const currentNode: DialogueNode | null = useMemo(() => {
		if (!data || !currentNodeId) return null;
		return data.dialogues[currentNodeId] ?? null;
	}, [data, currentNodeId]);

	const loadDialogue = useCallback(
		async (dialogueId: string) => {
			setLoading(true);
			setError(null);
			try {
				const res = await fetch(`/api/npc-dialogue/${dialogueId}`, {
					cache: 'no-store',
				});
				if (!res.ok) {
					const payload = await res.json().catch(() => ({}));
					throw new Error(payload.error || 'Failed to load dialogue');
				}
				const json: DialogueData = await res.json();
				setData(json);
				setCurrentNodeId('greeting');
				setHistory([]);
			} catch (e) {
				setError(e instanceof Error ? e.message : 'Failed to load dialogue');
				setData(null);
				setCurrentNodeId(null);
				setHistory([]);
			} finally {
				setLoading(false);
			}
		},
		[]
	);

	useEffect(() => {
		// Bootstrap with default selection
		loadDialogue(selectedId).catch(console.error);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleSelectChange = useCallback((value: string) => {
		setSelectedId(value);
	}, []);

	const handleStart = useCallback(() => {
		loadDialogue(selectedId).catch(console.error);
	}, [loadDialogue, selectedId]);

	const handleResponseClick = useCallback(
		(nextId: string) => {
			if (!data) return;
			// Treat "end" as terminal node if present
			if (nextId === 'end') {
				setHistory((h) => (currentNodeId ? [...h, currentNodeId] : h));
				setCurrentNodeId('end');
				return;
			}
			// Skip unsupported action nodes
			if (nextId.startsWith('action:')) {
				// No-op: keep user on current node, but surface minimal feedback
				setError('Action nodes are not supported in this simulator.');
				setTimeout(() => setError(null), 2500);
				return;
			}
			if (data.dialogues[nextId]) {
				setHistory((h) => (currentNodeId ? [...h, currentNodeId] : h));
				setCurrentNodeId(nextId);
			} else {
				setError(`Unknown dialogue node: ${nextId}`);
				setTimeout(() => setError(null), 2500);
			}
		},
		[data, currentNodeId]
	);

	const handleBack = useCallback(() => {
		setHistory((h) => {
			if (h.length === 0) return h;
			const next = h.slice(0, -1);
			setCurrentNodeId(next[next.length - 1] ?? 'greeting');
			return next;
		});
	}, []);

	const handleRestart = useCallback(() => {
		setCurrentNodeId('greeting');
		setHistory([]);
	}, []);

	const renderedText = useMemo(() => {
		if (!currentNode) return '';
		const withVars = substitute(currentNode.text, { playerName });
		return simpleMarkdownToHtml(withVars);
	}, [currentNode, playerName]);

	return (
		<div className="mx-auto max-w-4xl space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Setup</CardTitle>
					<CardDescription>Select a dialogue and optional player name.</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<div className="space-y-2">
							<Label htmlFor="dialogue">Dialogue</Label>
							<Select value={selectedId} onValueChange={handleSelectChange}>
								<SelectTrigger id="dialogue" aria-label="Select dialogue">
									<SelectValue placeholder="Choose dialogue" />
								</SelectTrigger>
								<SelectContent>
									{PRESETS.map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2 md:col-span-2">
							<Label htmlFor="playerName">Player name</Label>
							<Input
								id="playerName"
								placeholder="Enter a player name"
								value={playerName}
								onChange={(e) => setPlayerName(e.target.value)}
							/>
						</div>
					</div>
					<div className="mt-4 flex items-center gap-2">
						<Button onClick={handleStart} disabled={loading}>
							{loading ? 'Loading…' : 'Start / Reset'}
						</Button>
						{error && <div className="text-sm text-red-400">{error}</div>}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>
						{data ? `${data.npcName} (${data.npcId})` : 'No dialogue loaded'}
					</CardTitle>
					<CardDescription>
						Node: <span className="font-semibold">{currentNodeId ?? '—'}</span>
					</CardDescription>
				</CardHeader>
				<CardContent>
					{!data || !currentNode ? (
						<div className="text-sm text-slate-400">Select Start to load a dialogue.</div>
					) : (
						<div className="space-y-6">
							<div
								className="rounded-md border border-slate-800 bg-slate-900/50 p-4 leading-relaxed text-slate-100"
								dangerouslySetInnerHTML={{ __html: renderedText }}
							/>
							<div className="flex flex-wrap gap-2">
								{currentNode.responses.map((r, idx) => (
									<Button
										key={`${idx}-${r.nextDialogue}`}
										variant="secondary"
										onClick={() => handleResponseClick(r.nextDialogue)}
									>
										{r.text}
									</Button>
								))}
								{currentNodeId !== 'greeting' && (
									<Button variant="outline" onClick={handleBack}>
										Back
									</Button>
								)}
								<Button variant="ghost" onClick={handleRestart}>
									Restart
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}












