import { cn } from "@/lib/utils";

type InfoPillButtonProps = {
  onClick: () => void;
  className?: string;
  "aria-label"?: string;
};

/** Inset info pill — same footprint as NavMessageBadge (18×18px). */
export function InfoPillButton({
  onClick,
  className,
  "aria-label": ariaLabel = "More information",
}: InfoPillButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "flex h-[18px] min-w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-secondary/95 text-xs font-serif font-bold italic leading-none text-foreground shadow-sm transition-colors duration-200 hover:bg-secondary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      i
    </button>
  );
}
