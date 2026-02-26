"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: send to error reporting service (e.g. Sentry)
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center font-sans">
          <div className="text-center">
            <p className="text-xs text-[#737373] mb-1">Something went wrong</p>
            <h1 className="text-sm font-medium mb-4">{error.message || "An unexpected error occurred."}</h1>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={reset}
                className="text-xs border border-black px-3 py-1.5 hover:bg-black hover:text-white transition-none"
              >
                Try again
              </button>
              <Link href="/" className="text-xs underline text-[#737373] hover:text-black">
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
