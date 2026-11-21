"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LogoMark, Wordmark } from "@/components/logo"
import { cn } from "cn"

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/import", label: "Importar" },
  { href: "/scenarios", label: "Escenarios" },
]

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-transparent px-6 pt-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-8 gap-y-3">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark className="h-5 w-8" />
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-6">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm tracking-tight",
                  isActive(pathname, link.href)
                    ? "text-primary/70"
                    : "text-foreground/45 hover:text-foreground/70"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
