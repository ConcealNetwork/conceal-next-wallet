import Link from "next/link"

const footerLinks = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/support", label: "Support" },
  { href: "/wallet/donate", label: "Donate" },
  { href: "/wallet/network", label: "Network Stats" },
  { href: "https://github.com/ConcealNetwork", label: "GitHub" },
]

export function Footer() {
  return (
    <footer className="mt-12 -mx-4 border-t border-border bg-[hsl(var(--footer))] px-4 py-6 text-sm text-muted-foreground sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p>© 2018-2025 Conceal.Network</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
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
