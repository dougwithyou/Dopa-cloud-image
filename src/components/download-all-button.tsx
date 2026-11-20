"use client";

import { useState } from "react";
import { downloadAll, type ZipEntry } from "@/lib/zip-download";

export function DownloadAllButton({
  entries,
  zipName,
  label,
  className = "btn-primary",
}: {
  entries: ZipEntry[];
  zipName: string;
  label: string;
  className?: string;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setProgress(0);
    try {
      await downloadAll(entries, zipName, setProgress);
    } catch (err) {
      setError((err as Error).message || "No se pudo completar la descarga");
    } finally {
      setProgress(null);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={run}
        disabled={progress !== null || entries.length === 0}
        className={`whitespace-nowrap ${className}`}
      >
        {progress === null ? label : `Preparando ZIP… ${Math.round(progress * 100)}%`}
      </button>
      {error ? <span className="mt-1 text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
