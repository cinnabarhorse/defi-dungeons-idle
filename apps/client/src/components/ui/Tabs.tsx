'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '../../lib/utils';

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  showBadge?: boolean;
  href?: string;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  scrollToTopOnChange?: boolean;
}

export function Tabs<T extends string = string>({
  items,
  value,
  onValueChange,
  className,
  scrollToTopOnChange = true,
}: TabsProps<T>) {
  const handleClick = React.useCallback(
    (nextValue: T) => {
      onValueChange(nextValue);
      if (scrollToTopOnChange && typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [onValueChange, scrollToTopOnChange]
  );

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 pointer-events-none safe-area-bottom',
        className
      )}
    >
      <div className="mx-auto md:max-w-md w-full">
        <div className="pointer-events-auto flex items-center justify-between border md:rounded-t-2xl border-white/10 bg-black/80 md:bg-black/60 backdrop-blur-xl md:backdrop-blur-md px-3 py-3 text-white shadow-lg">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.value === value;
            const content = (
              <>
                {Icon ? (
                  <Icon
                    className={cn(
                      'h-5 w-5',
                      isActive ? 'text-purple-300' : 'text-white/50'
                    )}
                  />
                ) : null}
                <span className="font-medium">{item.label}</span>
                {item.showBadge ? (
                  <span className="absolute top-0 right-6 inline-flex h-2.5 w-2.5 rounded-full bg-pink-400" />
                ) : null}
              </>
            );

            return item.href ? (
              <Link
                key={item.value}
                href={item.href}
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-1 text-xs transition-colors',
                  isActive ? 'text-white' : 'text-white/60'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {content}
              </Link>
            ) : (
              <button
                key={item.value}
                type="button"
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-1 text-xs transition-colors',
                  isActive ? 'text-white' : 'text-white/60'
                )}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleClick(item.value)}
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
