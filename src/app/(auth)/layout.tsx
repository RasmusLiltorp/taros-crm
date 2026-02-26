import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[#e5e5e5] px-6 py-4">
        <Link href="/" className="text-sm font-medium tracking-tight">
          Taros Simple CRM
        </Link>
      </header>
      <main className="flex-1 flex items-start justify-center pt-20 px-4">
        {children}
      </main>
    </div>
  );
}
