/**
 * A tool that is not open yet: the page is drawn behind a blur so you can see what is coming, and one
 * card says when it opens, what it will do and where to go meanwhile.
 */
import Link from "next/link";
import type { ReactNode } from "react";

export function SoonGate({ name, line, what, docs, children }: { name: string; line: string; what: string[]; docs: string; children: ReactNode }) {
  return (
    <div className="relative min-h-[34rem] overflow-hidden">
      <div aria-hidden inert className="pointer-events-none select-none opacity-60 blur-[6px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center bg-gradient-to-b from-bg/30 via-bg/60 to-bg px-4 pt-16 sm:pt-24">
        <div className="w-full max-w-lg border border-line bg-bg/95 p-7 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] backdrop-blur-md">
          <p className="flex items-center gap-2 font-medium text-[12px] uppercase tracking-[0.14em] text-muted">
            <span aria-hidden className="led" data-tone="off" />
            Opens soon
          </p>
          <h2 className="mt-4 font-display text-4xl leading-tight tracking-tight">{name} opens soon</h2>
          <p className="mt-2 text-[15px] text-muted">{line}</p>
          {what.length > 0 && (
            <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-[14px] text-text">
              {what.map((w) => (
                <li key={w} className="flex gap-2">
                  <span aria-hidden className="text-leaf">■</span>
                  {w}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Link href="/app/trade/terminal" className="ibtn h-11 justify-center">
              Use the terminal now
            </Link>
            <Link href={docs} className="ibtn-ghost h-11 justify-center">
              How it will work
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
