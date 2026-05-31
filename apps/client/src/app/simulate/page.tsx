import { Suspense } from 'react';
import Simulator from '../../components/simulate/simulator';

export default function Page() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-6">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <Simulator />
      </Suspense>
    </div>
  );
}












