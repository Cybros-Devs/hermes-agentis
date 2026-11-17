import { ArrowDown } from 'lucide-react';

interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
  label?: string;
  compact?: boolean;
  testId?: string;
  className?: string;
}

export function ScrollToBottomButton({
  visible,
  onClick,
  label = 'Jump to latest',
  compact = false,
  testId = 'jump-to-latest-btn',
  className = '',
}: ScrollToBottomButtonProps) {
  if (!visible) return null;

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-label={label}
      className={`ui-pop-in ui-tactile group inline-flex items-center gap-1.5 rounded-full bg-[#131720]/94 backdrop-blur-md border border-[rgba(var(--ui-accent-rgb),0.40)] text-xs font-medium text-[var(--ui-accent-soft)] hover:text-white hover:border-[rgba(var(--ui-accent-rgb),0.75)] shadow-[0_10px_26px_rgba(0,0,0,0.48)] transition-[border-color,color,transform] cursor-pointer whitespace-nowrap ${
        compact ? 'px-2.5 py-1 text-[10.5px]' : 'px-3.5 py-1.5'
      } ${className}`}
    >
      <ArrowDown className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-y-0.5" />
      <span>{label}</span>
    </button>
  );
}
