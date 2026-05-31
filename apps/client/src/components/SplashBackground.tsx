import { type ReactNode } from 'react';
import { cn } from '../lib/utils';

interface SplashBackgroundProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'main';
  viewportScroll?: boolean;
}

export function SplashBackground({
  children,
  className,
  as: Component = 'div',
  viewportScroll = false,
}: SplashBackgroundProps) {
  return (
    <Component
      className={cn(
        "relative min-h-screen bg-fixed bg-center bg-cover bg-no-repeat bg-[url('/images/splash-mobile.png')] sm:bg-[url('/images/splash-desktop.png')] flex flex-col",
        viewportScroll ? 'overflow-visible' : 'overflow-y-auto',
        className
      )}
    >
      {/* Dark overlay with blur */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-0" />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </Component>
  );
}
