import type { ReactNode } from 'react';

interface AnimatedCollapsibleProps {
  open: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Smooth GPU/CSS-Grid height collapsible container with opacity fade and
 * automatic reduced-motion compliance.
 */
export function AnimatedCollapsible({
  open,
  children,
  className = '',
}: AnimatedCollapsibleProps) {
  return (
    <div
      data-open={String(open)}
      aria-hidden={!open}
      className={`ui-collapsible-grid ${open ? 'is-open' : ''} ${className}`}
    >
      <div className="ui-collapsible-inner min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
