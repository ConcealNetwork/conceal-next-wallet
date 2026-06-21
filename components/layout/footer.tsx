"use client";

import Link from "next/link";

import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

type FooterLink = {
  href: string;
  /** i18n key for the label; falls back to `label` (brand strings stay literal). */
  labelKey?: string;
  label?: string;
  external?: boolean;
};

const footerLinks: FooterLink[] = [
  { href: "/terms", labelKey: "footer.terms" },
  { href: "/privacy", labelKey: "footer.privacy" },
  { href: "/support", labelKey: "footer.support" },
  { href: "/wallet/donate", labelKey: "footer.donate" },
  { href: "/wallet/network", labelKey: "footer.networkStats" },
  { href: "https://github.com/ConcealNetwork", label: "GitHub", external: true },
];

const linkClassName =
  "cursor-pointer rounded-sm transition-colors duration-200 hover:text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

export function Footer({
  collapsed = false,
  inline = false,
}: {
  collapsed?: boolean;
  /** Embedded in a constrained shell (onboarding): drop the full-bleed chrome
   *  bar and align to the page column so it reads as part of the page. */
  inline?: boolean;
}) {
  const { t } = useI18n();
  return (
    <footer
      className={cn(
        "text-sm text-muted-foreground",
        inline
          ? "mt-10 border-t border-border/50"
          : "border-t border-border bg-[hsl(var(--chrome))]",
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-4 py-6 transition-[max-width] duration-300 ease-in-out motion-reduce:transition-none sm:flex-row sm:items-center sm:justify-between",
          inline ? "max-w-5xl px-0" : "px-4 sm:px-6 lg:px-8",
          inline ? "" : collapsed ? "max-w-[1360px]" : "max-w-[1200px]",
        )}
      >
        <p>© 2018–2026 Conceal.Network</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {footerLinks.map((link) => {
            const text = link.labelKey ? t(link.labelKey) : link.label;
            return link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClassName}
              >
                {text}
              </a>
            ) : (
              <Link key={link.href} href={link.href} className={linkClassName}>
                {text}
              </Link>
            );
          })}
        </nav>
      </div>
    </footer>
  );
}
