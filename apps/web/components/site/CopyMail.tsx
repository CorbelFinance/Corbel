"use client";

import { useState } from "react";

/** The contact address as a mail link, with a copy button beside it (copy works without a mail app). */
export function CopyMail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <a href={`mailto:${email}`} className="font-mono text-sm text-text underline decoration-line underline-offset-4 transition-colors hover:text-leaf hover:decoration-leaf">
        {email}
      </a>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(email).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          });
        }}
        className="border border-line px-2 py-1 font-mono text-[12px] uppercase tracking-[0.1em] text-muted transition-colors hover:border-leaf hover:text-leaf"
        aria-live="polite"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
