"use client";

import type { LucideIcon } from "lucide-react";
import { Monitor, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "@/lib/ui/theme";
import { useTheme } from "@/lib/ui/theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/** Segmented System / Light / Dark control (see ThemeProvider). */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className="flex flex-wrap gap-2 border-0 p-0">
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={preference === value}
          onClick={() => setPreference(value)}
          className={cn(
            "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground transition-[border-color,color,background-color,transform] duration-200 hover:border-ring hover:text-foreground active:scale-[0.98] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:active:scale-100 motion-reduce:transition-none",
            preference === value &&
              "border-primary bg-primary text-primary-foreground hover:text-primary-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </fieldset>
  );
}
