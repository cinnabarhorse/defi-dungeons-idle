'use client';

import React from 'react';

interface RunSettingsProps {
  mode: 'competitive';
}

export function RunSettings({ mode }: RunSettingsProps) {

  return (
    <div className="flex flex-col gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
        Competitive Settings
      </h3>
    </div>
  );
}
