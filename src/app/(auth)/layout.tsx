import Link from "next/link";
import { APP_NAME } from "@/lib/env";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-8 text-2xl font-bold tracking-tight">
        {APP_NAME}
      </Link>
      <div className="card w-full max-w-sm p-6 sm:p-8">{children}</div>
    </main>
  );
}
