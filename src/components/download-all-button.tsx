"use client";

import { useState } from "react";
import { downloadAll, type ZipEntry } from "@/lib/zip-download";
import { useI18n } from "@/i18n/client";

export function DownloadAllButton({
  entries,
  zipName,
  label,
  className = "btn-primary",
  style,
}: {
  entries: ZipEntry[];
  zipName: string;
  label: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const g = useI18n().t.gallery;

  async function run() {
    setError(null);
    setProgress(0);
    try {
      await downloadAll(entries, zipName, setProgress);
    } catch (err) {
      console.error("[download-all]", err);
      setError(g.downloadFailed);
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
        style={style}
      >
        {progress === null ? label : g.preparingZip(Math.round(progress * 100))}
      </button>
      {error ? <span className="mt-1 text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
