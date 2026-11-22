import Link from "next/link";
import { Logo } from "@/components/site/Header";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[calc(100vh/var(--vz))] max-w-page flex-col px-4 sm:px-6 lg:px-10 xl:px-14">
      <div className="flex h-14 items-center">
        <Logo />
      </div>
      <div className="flex flex-1 items-center">
        <section className="inst w-full max-w-3xl" aria-labelledby="nf-title">
          <span aria-hidden className="inst-sq tl" />
          <span aria-hidden className="inst-sq tr" />
          <span aria-hidden className="inst-sq bl" />
          <span aria-hidden className="inst-sq br" />
          <header className="inst-head">
            <span className="inst-code">[404]</span>
            <span className="inst-title">No route to this page</span>
          </header>
          <div className="dots p-6 sm:p-10">
            <h1 id="nf-title" className="font-display text-4xl">
              Nothing lives at this address.
            </h1>
            <p className="mt-4 max-w-lg text-muted">The link may be old, or the tool moved. Every tool sits under the app.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/app/trust/check" className="ibtn h-10 px-5">
                Check a token
              </Link>
              <Link href="/app/trade/quote" className="ibtn-ghost h-10">
                Quote a swap
              </Link>
              <Link href="/" className="ibtn-ghost h-10">
                Home
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
