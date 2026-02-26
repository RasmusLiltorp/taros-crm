import Link from "next/link";

export default function VerifyEmailPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="border border-[#e5e5e5] p-8">
        <h1 className="text-base font-medium mb-3">Check your inbox</h1>
        <p className="text-sm text-[#737373] leading-relaxed">
          We sent a verification link to your email address. Click it to activate your account,
          then come back to log in.
        </p>
        <p className="text-xs text-[#a3a3a3] mt-4">
          Didn&apos;t receive it? Check your spam folder, or{" "}
          <Link href="/register" className="text-black underline">
            try registering again
          </Link>
          .
        </p>
      </div>
      <p className="text-xs text-[#737373] mt-4 text-center">
        Already verified?{" "}
        <Link href="/login" className="text-black underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
