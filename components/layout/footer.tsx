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
    <footer className="mt-12 border-t border-zinc-800 py-6 text-sm text-zinc-500">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p>© 2018-2025 Conceal.Network</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          {footerLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-wallet-amber">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
