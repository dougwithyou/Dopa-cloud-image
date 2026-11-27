"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/client";

export function CopyButton({ text, className = "btn-secondary", label }: { text: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const g = useI18n().t.gallery;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Respaldo para navegadores sin Clipboard API (o contextos no seguros).
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={copy} className={className} aria-live="polite">
      {copied ? g.copiedBang : (label ?? g.copyText)}
    </button>
  );
}
