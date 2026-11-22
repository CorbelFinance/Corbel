import type { Metadata, Viewport } from "next";
import { Tracker } from "@/components/site/Tracker";
import localFont from "next/font/local";
import { BRAND } from "@corbel/config";
import { PREFS_SCRIPT } from "@/lib/prefsScript";
import { DevKit } from "@/components/devkit/DevKit";
import "./globals.css";

// Self-hosted (app/fonts, latin subset): the build and the site never call Google.
// block, not swap: the intro draws its name and labels in these two, and a late swap showed as a jump in the type
const geist = localFont({ src: "./fonts/geist-latin.woff2", weight: "300", variable: "--font-geist", display: "block" });
const inter = localFont({ src: "./fonts/inter-latin.woff2", weight: "100 900", variable: "--font-inter", display: "swap" });
// Preloaded: without it the uppercase labels reflow on swap (CLS 0.175 measured).
const mono = localFont({ src: "./fonts/jetbrainsmono-latin.woff2", weight: "400", variable: "--font-jbmono", display: "block" });

export const metadata: Metadata = {
  title: { default: `${BRAND.name}: the all-in-one app for Robinhood Chain`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  authors: [{ name: BRAND.company }],
  // "./" makes every page canonical to its own path on the site host
  metadataBase: new URL(`https://${BRAND.domains.site}`),
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: `${BRAND.name}: the all-in-one app for Robinhood Chain`,
    description: BRAND.description,
    images: [{ url: "/brand/og-v2.png", width: 1200, height: 630, alt: `${BRAND.name}: the all-in-one app for Robinhood Chain` }],
  },
  twitter: { card: "summary_large_image", title: `${BRAND.name}: the all-in-one app for Robinhood Chain`, description: BRAND.description, images: ["/brand/og-v2.png"] },
};

export const viewport: Viewport = { themeColor: "#060807", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Marks JS as available so reveal states may hide content; without JS everything stays visible. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              // the intro plays on arrival and on reload; a click from one page of the site to another skips it
              // (the site sends no referrer, so a page marks the moment it is left)
              "document.documentElement.classList.add('js');try{var n=performance.getEntriesByType('navigation')[0],l=+sessionStorage.getItem('corbel.left')||0;if(n&&n.type!=='reload'&&Date.now()-l<8000)document.documentElement.classList.add('intro-seen');addEventListener('pagehide',function(){sessionStorage.setItem('corbel.left',String(Date.now()))})}catch(e){}",
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-leaf focus:px-4 focus:py-2 focus:text-bg"
        >
          Skip to content
        </a>
        {children}
        <div aria-hidden className="grain" />
        <DevKit />
        <Tracker />
      </body>
    </html>
  );
}
