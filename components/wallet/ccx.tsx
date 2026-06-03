import { cn } from "@/lib/utils";

/** Renders a formatted amount string with the "CCX" ticker in the brand orange,
 *  matching the landing hero card. Non-CCX text (numbers, "$0.045", "12 months")
 *  is passed through untouched, so it's safe to wrap any value string. */
export function CcxAmount({
  children,
  className,
}: {
  children: string | number;
  className?: string;
}) {
  return (
    <>
      {String(children)
        .split(/(CCX)/g)
        .map((part, index) =>
          part === "CCX" ? (
            <span key={index} className={cn("text-primary", className)}>
              CCX
            </span>
          ) : (
            part
          ),
        )}
    </>
  );
}
