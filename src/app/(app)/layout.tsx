"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { TeamProvider, useSharedTeam } from "@/hooks/useSharedTeam";
import { logout, provisionTeam } from "@/lib/auth";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  return (
    <TeamProvider>
      <AppShell>{children}</AppShell>
    </TeamProvider>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { team, refetch } = useSharedTeam();
  const teamProvisioned = useRef(false);

  useEffect(() => {
    // Provision team exactly once per session after login
    if (teamProvisioned.current) return;
    teamProvisioned.current = true;
    provisionTeam()
      .then(() => {
        refetch();
      })
      .catch(() => {
        // Non-fatal — user can still use the app
      });
  }, [refetch]);

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const navLinks = [
    { href: "/dashboard", label: "Contacts" },
    { href: "/dashboard/import", label: "Import" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[#e5e5e5] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="text-sm font-medium tracking-tight">
            {team?.name ?? "Taros Simple CRM"}
          </span>
          <nav className="flex items-center gap-1">
            {navLinks.map((link) => {
              const active =
                link.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-xs px-3 py-1.5 border ${active
                    ? "border-black bg-black text-white"
                    : "border-transparent text-[#737373] hover:text-black hover:border-[#e5e5e5]"
                    } transition-none`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[#737373]">{user?.name ?? user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-[#737373] hover:text-black transition-none"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
