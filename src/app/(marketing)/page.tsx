"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const isClient = typeof window !== "undefined";

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, router]);

  if (!isClient || isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[#e5e5e5] px-6 py-4 flex items-center justify-between">
        <span className="font-medium text-sm tracking-tight">Taros Simple CRM</span>
        <nav className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-[#737373] hover:text-black transition-none"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="text-sm border border-black px-3 py-1.5 hover:bg-black hover:text-white transition-none"
          >
            Sign up
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col">
        <section className="border-b border-[#e5e5e5] px-6 py-24 max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight leading-tight mb-6">
            A CRM that gets out<br />of your way.
          </h1>
          <p className="text-[#737373] text-base leading-relaxed mb-10 max-w-md">
            Your contacts in a clean table. No funnels, no dashboards, no
            integrations you&apos;ll never use. Import from LinkedIn, track who&apos;s
            been contacted, share with your team.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="inline-block border border-black px-5 py-2.5 text-sm font-medium hover:bg-black hover:text-white transition-none"
            >
              Get started — it&apos;s free
            </Link>
            <Link
              href="https://github.com/RasmusLiltorp/taros-crm"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block border border-[#d4d4d4] px-5 py-2.5 text-sm text-[#525252] hover:border-black hover:text-black transition-none"
            >
              Check it out -&gt; it&apos;s completely open source
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-16 border-b border-[#e5e5e5]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border border-[#e5e5e5]">
            {[
              {
                title: "Spreadsheet view",
                desc: "Your contacts laid out like a table. Sort, filter, and search without clicking through menus.",
              },
              {
                title: "LinkedIn import",
                desc: "Drop in a CSV from Sales Navigator or any LinkedIn export tool. Columns are auto-detected.",
              },
              {
                title: "Duplicate detection",
                desc: "On import, duplicates are flagged inline. Skip, overwrite, or import as new — per row.",
              },
              {
                title: "Team access",
                desc: "Create a team, invite colleagues by email. Everyone sees the same contacts, nothing more.",
              },
            ].map((f, i) => (
              <div
                key={i}
                className="p-6 border-r border-[#e5e5e5] last:border-r-0"
              >
                <h3 className="text-sm font-medium mb-2">{f.title}</h3>
                <p className="text-sm text-[#737373] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA strip */}
        <section className="px-6 py-16 flex items-center justify-between border-b border-[#e5e5e5]">
          <p className="text-sm text-[#737373]">
            No credit card. No trial period. Just a CRM.
          </p>
          <Link
            href="/register"
            className="text-sm border border-black px-5 py-2.5 hover:bg-black hover:text-white transition-none"
          >
            Create your team →
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="px-6 py-5 border-t border-[#e5e5e5] flex items-center justify-between">
        <span className="text-xs text-[#737373]">Taros Simple CRM</span>
        <span className="text-xs text-[#737373]">
          © {new Date().getFullYear()}
        </span>
      </footer>
    </div>
  );
}
