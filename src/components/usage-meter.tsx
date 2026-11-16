export function UsageMeter({ label, used, limit, format }: { label: string; used: number; limit: number | null; format?: (n: number) => string }) {
  const f = format ?? ((n: number) => String(n));
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const color = pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-neutral-900";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-neutral-500">
          {f(used)} / {limit === null ? "ilimitado" : f(limit)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full ${color}`} style={{ width: `${limit === null ? 0 : pct}%` }} />
      </div>
    </div>
  );
}
