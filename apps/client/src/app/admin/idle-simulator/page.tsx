'use client';

 import Link from 'next/link';
 import { useMemo, useState } from 'react';
import { DevModeConfig, saveDevModeConfig } from '../../../lib/dev-mode';

 interface IdleSimFormState {
   equipmentCsv: string;
   healthPotions: string;
   greaterPotions: string;
   ultraPotions: string;
   manaPotions: string;
   lickTongueCount: string;
   startHpPercent: string;
   startManaPercent: string;
   startFloor: string;
   startDepth: string;
   infiniteResources: boolean;
   skipEntryFee: boolean;
  postJoinAction: 'none' | 'force-victory-chest' | 'force-death';
  runMode: 'practice' | 'competitive';
  autoStart: boolean;
 }

 interface IdleSimPreset {
   label: string;
   values: Partial<IdleSimFormState>;
 }

 const DEFAULT_FORM_STATE: IdleSimFormState = {
   equipmentCsv: '',
   healthPotions: '',
   greaterPotions: '',
   ultraPotions: '',
   manaPotions: '',
   lickTongueCount: '',
   startHpPercent: '',
   startManaPercent: '',
   startFloor: '',
   startDepth: '',
   infiniteResources: false,
   skipEntryFee: true,
  postJoinAction: 'none',
  runMode: 'practice',
  autoStart: false,
 };

 const PRESETS: IdleSimPreset[] = [
   {
     label: 'Lobby baseline',
     values: {
       equipmentCsv: '',
       healthPotions: '',
       greaterPotions: '',
       ultraPotions: '',
       manaPotions: '',
       lickTongueCount: '',
       startHpPercent: '',
       startManaPercent: '',
       startFloor: '',
       startDepth: '',
       infiniteResources: false,
       skipEntryFee: true,
        postJoinAction: 'none',
        runMode: 'practice',
        autoStart: false,
     },
   },
   {
     label: 'Low HP + potions',
     values: {
       startHpPercent: '15',
       healthPotions: '5',
       greaterPotions: '2',
       ultraPotions: '1',
       skipEntryFee: true,
        postJoinAction: 'none',
        runMode: 'practice',
        autoStart: false,
     },
   },
   {
     label: 'Boss room',
     values: {
       startDepth: '10',
       equipmentCsv: 'portal-mage-black-axe',
       infiniteResources: true,
       skipEntryFee: true,
        postJoinAction: 'none',
        runMode: 'practice',
        autoStart: false,
     },
   },
   {
     label: 'High floor',
     values: {
       startFloor: '5',
       infiniteResources: true,
       skipEntryFee: true,
        postJoinAction: 'none',
        runMode: 'practice',
        autoStart: false,
     },
   },
 ];

 function parseOptionalNumber(value: string): number | undefined {
   const trimmed = value.trim();
   if (!trimmed) return undefined;
   const parsed = Number(trimmed);
   if (!Number.isFinite(parsed)) return undefined;
   return parsed;
 }

 function clampPercent(value: number | undefined): number | undefined {
   if (value === undefined) return undefined;
   return Math.max(0, Math.min(100, Math.round(value)));
 }

 function clampPositiveInt(value: number | undefined, min = 0): number | undefined {
   if (value === undefined) return undefined;
   if (!Number.isFinite(value)) return undefined;
   return Math.max(min, Math.floor(value));
 }

 function parseEquipmentCsv(value: string): string[] | undefined {
   const items = value
     .split(',')
     .map((item) => item.trim())
     .filter(Boolean);
   return items.length > 0 ? items : undefined;
 }

 function buildIdleSimUrl(values: IdleSimFormState, origin: string): string {
   const url = new URL('/', origin);
   url.searchParams.set('devMode', 'true');

   const equipment = parseEquipmentCsv(values.equipmentCsv);
   if (equipment) url.searchParams.set('devEquipment', equipment.join(','));

   const healthPotions = clampPositiveInt(parseOptionalNumber(values.healthPotions));
   if (healthPotions !== undefined) {
     url.searchParams.set('devHealthPotions', String(healthPotions));
   }

   const greaterPotions = clampPositiveInt(parseOptionalNumber(values.greaterPotions));
   if (greaterPotions !== undefined) {
     url.searchParams.set('devGreaterPotions', String(greaterPotions));
   }

   const ultraPotions = clampPositiveInt(parseOptionalNumber(values.ultraPotions));
   if (ultraPotions !== undefined) {
     url.searchParams.set('devUltraPotions', String(ultraPotions));
   }

   const manaPotions = clampPositiveInt(parseOptionalNumber(values.manaPotions));
   if (manaPotions !== undefined) {
     url.searchParams.set('devManaPotions', String(manaPotions));
   }

   const lickTongueCount = clampPositiveInt(
     parseOptionalNumber(values.lickTongueCount)
   );
   if (lickTongueCount !== undefined) {
     url.searchParams.set('devLickTongue', String(lickTongueCount));
   }

   const startHpPercent = clampPercent(parseOptionalNumber(values.startHpPercent));
   if (startHpPercent !== undefined) {
     url.searchParams.set('devStartHp', String(startHpPercent));
   }

   const startManaPercent = clampPercent(parseOptionalNumber(values.startManaPercent));
   if (startManaPercent !== undefined) {
     url.searchParams.set('devStartMana', String(startManaPercent));
   }

   const startFloor = clampPositiveInt(parseOptionalNumber(values.startFloor), 1);
   if (startFloor !== undefined) {
     url.searchParams.set('devStartFloor', String(startFloor));
   }

   const startDepth = clampPositiveInt(parseOptionalNumber(values.startDepth), 1);
   if (startDepth !== undefined) {
     url.searchParams.set('devStartDepth', String(startDepth));
   }

   if (values.infiniteResources) {
     url.searchParams.set('devInfiniteResources', 'true');
   }

   if (values.skipEntryFee) {
     url.searchParams.set('devSkipEntryFee', 'true');
   }

  if (values.postJoinAction !== 'none') {
    url.searchParams.set('devAction', values.postJoinAction);
  }

  if (values.runMode) {
    url.searchParams.set('devModeType', values.runMode);
  }

  if (values.autoStart) {
    url.searchParams.set('devAutoStart', 'true');
  }

   return url.toString();
 }

 function toDevModeConfig(values: IdleSimFormState): DevModeConfig {
   return {
     enabled: true,
     equipment: parseEquipmentCsv(values.equipmentCsv),
     healthPotions: clampPositiveInt(parseOptionalNumber(values.healthPotions)),
     greaterPotions: clampPositiveInt(parseOptionalNumber(values.greaterPotions)),
     ultraPotions: clampPositiveInt(parseOptionalNumber(values.ultraPotions)),
     manaPotions: clampPositiveInt(parseOptionalNumber(values.manaPotions)),
     lickTongueCount: clampPositiveInt(parseOptionalNumber(values.lickTongueCount)),
     startHpPercent: clampPercent(parseOptionalNumber(values.startHpPercent)),
     startManaPercent: clampPercent(parseOptionalNumber(values.startManaPercent)),
     startFloor: clampPositiveInt(parseOptionalNumber(values.startFloor), 1),
     startDepth: clampPositiveInt(parseOptionalNumber(values.startDepth), 1),
     infiniteResources: values.infiniteResources || undefined,
     skipEntryFee: values.skipEntryFee || undefined,
   };
 }

 export default function AdminIdleSimulatorPage() {
   const [formState, setFormState] = useState<IdleSimFormState>(DEFAULT_FORM_STATE);
   const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>(
     'idle'
   );

   const previewUrl = useMemo(() => {
     if (typeof window === 'undefined') return '';
     return buildIdleSimUrl(formState, window.location.origin);
   }, [formState]);

   function updateField<K extends keyof IdleSimFormState>(
     key: K,
     value: IdleSimFormState[K]
   ) {
     setCopyStatus('idle');
     setFormState((prev) => ({ ...prev, [key]: value }));
   }

   function applyPreset(preset: IdleSimPreset) {
     setCopyStatus('idle');
     setFormState((prev) => ({
       ...prev,
       ...preset.values,
     }));
   }

   function resetForm() {
     setCopyStatus('idle');
     setFormState(DEFAULT_FORM_STATE);
   }

   async function copyUrl() {
     if (!previewUrl) return;
     try {
       await navigator.clipboard.writeText(previewUrl);
       setCopyStatus('copied');
     } catch {
       setCopyStatus('error');
     }
   }

  function goToIdleMode() {
    if (!previewUrl) return;
    saveDevModeConfig(toDevModeConfig(formState));
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  }

   return (
     <div className="min-h-screen bg-slate-950 text-slate-100 font-mono p-8">
       <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
         <div className="flex items-center justify-between">
           <div>
             <h1 className="text-xl font-semibold text-white">Idle Stage Simulator</h1>
             <p className="text-sm text-slate-400">
               Tune a run state, preview the URL, then jump straight into the
               client.
             </p>
           </div>
           <Link
             href="/admin"
             className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900"
           >
             Back to Admin
           </Link>
         </div>

         <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
           <div className="flex flex-wrap gap-3">
             {PRESETS.map((preset) => (
               <button
                 key={preset.label}
                 type="button"
                 onClick={() => applyPreset(preset)}
                 className="rounded-full border border-slate-700 bg-slate-950 px-4 py-1.5 text-xs uppercase tracking-wide text-slate-300 hover:border-slate-500 hover:text-white"
               >
                 {preset.label}
               </button>
             ))}
             <button
               type="button"
               onClick={resetForm}
               className="rounded-full border border-slate-800 px-4 py-1.5 text-xs uppercase tracking-wide text-slate-500 hover:border-slate-600 hover:text-slate-200"
             >
               Reset
             </button>
           </div>
         </div>

         <div className="grid gap-6 lg:grid-cols-2">
           <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
             <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
               Stage
             </h2>
             <div className="mt-4 grid gap-4 md:grid-cols-2">
               <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
                 Start Floor
                 <input
                   type="number"
                   min={1}
                   value={formState.startFloor}
                   onChange={(event) =>
                     updateField('startFloor', event.target.value)
                   }
                   className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                 />
               </label>
               <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
                 Start Depth
                 <input
                   type="number"
                   min={1}
                   value={formState.startDepth}
                   onChange={(event) =>
                     updateField('startDepth', event.target.value)
                   }
                   className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                 />
               </label>
             </div>
             <div className="mt-4 flex flex-col gap-3">
               <label className="flex items-center gap-2 text-xs uppercase text-slate-400">
                 <input
                   type="checkbox"
                   checked={formState.skipEntryFee}
                   onChange={(event) =>
                     updateField('skipEntryFee', event.target.checked)
                   }
                   className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                 />
                 Skip Entry Fee
               </label>
               <label className="flex items-center gap-2 text-xs uppercase text-slate-400">
                 <input
                   type="checkbox"
                   checked={formState.infiniteResources}
                   onChange={(event) =>
                     updateField('infiniteResources', event.target.checked)
                   }
                   className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                 />
                 Infinite Resources
               </label>
             </div>
           </div>

           <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
             <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
               Player Stats
             </h2>
             <div className="mt-4 grid gap-4 md:grid-cols-2">
               <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
                 Start HP %
                 <input
                   type="number"
                   min={0}
                   max={100}
                   value={formState.startHpPercent}
                   onChange={(event) =>
                     updateField('startHpPercent', event.target.value)
                   }
                   className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                 />
               </label>
               <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
                 Start Mana %
                 <input
                   type="number"
                   min={0}
                   max={100}
                   value={formState.startManaPercent}
                   onChange={(event) =>
                     updateField('startManaPercent', event.target.value)
                   }
                   className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                 />
               </label>
             </div>
           </div>

           <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
             <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
               Inventory
             </h2>
             <div className="mt-4 grid gap-4 md:grid-cols-2">
               <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
                 Health Potions (T1)
                 <input
                   type="number"
                   min={0}
                   value={formState.healthPotions}
                   onChange={(event) =>
                     updateField('healthPotions', event.target.value)
                   }
                   className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                 />
               </label>
               <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
                 Greater Potions (T2)
                 <input
                   type="number"
                   min={0}
                   value={formState.greaterPotions}
                   onChange={(event) =>
                     updateField('greaterPotions', event.target.value)
                   }
                   className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                 />
               </label>
               <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
                 Ultra Potions (T3)
                 <input
                   type="number"
                   min={0}
                   value={formState.ultraPotions}
                   onChange={(event) =>
                     updateField('ultraPotions', event.target.value)
                   }
                   className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                 />
               </label>
               <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
                 Mana Potions
                 <input
                   type="number"
                   min={0}
                   value={formState.manaPotions}
                   onChange={(event) => updateField('manaPotions', event.target.value)}
                   className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                 />
               </label>
               <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
                 Lick Tongues
                 <input
                   type="number"
                   min={0}
                   value={formState.lickTongueCount}
                   onChange={(event) =>
                     updateField('lickTongueCount', event.target.value)
                   }
                   className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                 />
               </label>
             </div>
           </div>

           <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
             <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
               Equipment
             </h2>
             <div className="mt-4">
               <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
                 Wearable Slugs (comma-separated)
                 <input
                   type="text"
                   value={formState.equipmentCsv}
                   onChange={(event) =>
                     updateField('equipmentCsv', event.target.value)
                   }
                   placeholder="milkshake, portal-mage-black-axe"
                   className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                 />
               </label>
             </div>
           </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
              Automation
            </h2>
            <div className="mt-4">
              <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
                Post-Join Action
                <select
                  value={formState.postJoinAction}
                  onChange={(event) =>
                    updateField(
                      'postJoinAction',
                      event.target.value as IdleSimFormState['postJoinAction']
                    )
                  }
                  className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="none">None</option>
                  <option value="force-victory-chest">
                    Force Victory Chest
                  </option>
                  <option value="force-death">Force Defeat</option>
                </select>
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs uppercase text-slate-400">
                Run Mode
                <select
                  value={formState.runMode}
                  onChange={(event) =>
                    updateField(
                      'runMode',
                      event.target.value as IdleSimFormState['runMode']
                    )
                  }
                  className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                >
                  <option value="practice">Practice</option>
                  <option value="competitive">Competitive</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs uppercase text-slate-400">
                <input
                  type="checkbox"
                  checked={formState.autoStart}
                  onChange={(event) =>
                    updateField('autoStart', event.target.checked)
                  }
                  className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                />
                Skip Lobby (Auto-Start)
              </label>
            </div>
          </div>
         </div>

         <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
           <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
             <div className="flex-1">
               <div className="text-xs uppercase tracking-widest text-slate-400">
                 Preview URL
               </div>
               <div className="mt-2 break-all rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                 {previewUrl || 'Loading...'}
               </div>
             </div>
             <div className="flex flex-wrap gap-3">
               <button
                 type="button"
                 onClick={copyUrl}
                 className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
               >
                 {copyStatus === 'copied'
                   ? 'Copied'
                   : copyStatus === 'error'
                     ? 'Copy Failed'
                     : 'Copy URL'}
               </button>
               <button
                 type="button"
                 onClick={goToIdleMode}
                 className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
               >
                 Go
               </button>
             </div>
           </div>
         </div>
       </div>
     </div>
   );
 }
