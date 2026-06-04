import { cn } from "@/lib/utils";

type NavMessageBadgeProps = {
  count: number;
  className?: string;
};

/** Orange +N pill — primary accent from DESIGN.md, trailing nav indicator. */
export function NavMessageBadge({ count, className }: NavMessageBadgeProps) {
  if (count <= 0) return null;

  const label = count > 99 ? "99+" : `+${count}`;

  return (
    <span
      className={cn(
        "flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground shadow-sm",
        className,
      )}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}
