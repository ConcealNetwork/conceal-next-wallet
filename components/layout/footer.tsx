import Link from "next/link"

import { cn } from "@/lib/utils"

const footerLinks = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/support", label: "Support" },
  { href: "/wallet/donate", label: "Donate" },
  { href: "/wallet/network", label: "Network Stats" },
  { href: "https://github.com/ConcealNetwork", label: "GitHub" },
]

export function Footer({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <footer className="border-t border-border bg-[hsl(var(--footer))] text-sm text-muted-foreground">
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-4 px-4 py-6 transition-[max-width] duration-200 motion-reduce:transition-none sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8",
          collapsed ? "max-w-[1360px]" : "max-w-[1200px]"
        )}
      >
        <p>© 2018–2025 Conceal.Network</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="cursor-pointer rounded-sm transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
