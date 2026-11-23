import Link from "next/link";
import { dashFont } from "@/lib/fonts";
import { Logo } from "@/components/logo";
import { SquiggleLine } from "@/components/landing/visuals";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className={`dash ${dashFont.variable} relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10`}>
      <SquiggleLine className="pointer-events-none absolute -top-10 -right-40 w-[640px] text-white" />
      <Link href="/" className="relative mb-8">
        <Logo />
      </Link>
      <div className="card relative w-full max-w-sm p-6 sm:p-8">{children}</div>
    </main>
  );
}
