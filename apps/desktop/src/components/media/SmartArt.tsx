import { Sparkles } from 'lucide-react';

/** The square tile standing in for a smart playlist's artwork. */
export function SmartArt({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-[linear-gradient(135deg,var(--color-accent),#6d28d9_55%,#0e7490)] text-white ${className ?? ''}`} aria-hidden>
      <Sparkles className="size-1/2 max-h-24 max-w-24" strokeWidth={1.5} />
    </div>
  );
}
