"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Leads" },
  { href: "/clients", label: "Klienter" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav style={{
      background: "var(--surface)",
      borderBottom: "1px solid var(--border)",
      boxShadow: "0 1px 3px oklch(0% 0 0 / 0.06)",
    }} className="px-6 py-0">
      <div className="max-w-7xl mx-auto flex items-center gap-8 h-14">
        <span style={{
          fontFamily: "var(--font-fraunces), serif",
          color: "var(--green)",
          fontSize: "15px",
          fontWeight: 600,
          letterSpacing: "-0.02em",
        }}>
          ls/
        </span>

        <div className="flex gap-1 h-full items-center">
          {links.map((l) => {
            const active = path === l.href;
            return (
              <Link key={l.href} href={l.href}
                className="relative px-3 flex items-center h-full text-sm font-medium transition-colors duration-150 cursor-pointer"
                style={{ color: active ? "var(--text)" : "var(--text-muted)" }}
              >
                {l.label}
                {active && (
                  <span style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: "2px",
                    background: "var(--green)",
                    borderRadius: "2px 2px 0 0",
                  }} />
                )}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span style={{
            width: 8, height: 8,
            borderRadius: "50%",
            background: "var(--green)",
            boxShadow: "0 0 8px var(--green)",
            display: "inline-block",
          }} />
          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>live</span>
        </div>
      </div>
    </nav>
  );
}
