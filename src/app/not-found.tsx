import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-xs text-[#737373] mb-1">404</p>
        <h1 className="text-sm font-medium mb-4">Page not found</h1>
        <Link href="/" className="text-xs underline text-[#737373] hover:text-black">
          Back to home
        </Link>
      </div>
    </div>
  );
}
