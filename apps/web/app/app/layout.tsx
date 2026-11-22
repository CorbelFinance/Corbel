import { Logo } from "@/components/site/Header";
import { NetStatus } from "@/components/site/NetStatus";
import { AppNav } from "@/components/app/AppNav";
import { AppFoot } from "@/components/app/AppFoot";
import { AppSide } from "@/components/app/AppSide";
import { MarketStrip } from "@/components/app/MarketStrip";
import { WalletButton } from "@/components/app/wallet";
import { Socials } from "@/components/site/Socials";

export const metadata = { title: "App" };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-skin min-h-[calc(100vh/var(--vz))]">
      <AppSide />
      <div className="xl:pl-[var(--side)]">
        <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
            <span className="xl:hidden">
              <Logo />
            </span>
            <NetStatus className="hidden lg:flex" />
            <Socials className="hidden xl:flex" />
            <div className="ml-auto hidden min-w-0 justify-end md:flex">
              <MarketStrip />
            </div>
            <span className="ml-auto flex items-center gap-2 md:ml-0">
              <WalletButton />
            </span>
          </div>
          <div className="xl:hidden">
            <AppNav />
          </div>
        </header>
        <main id="main" className="px-4 pb-24 pt-6 sm:px-6 md:pb-16 lg:px-8 xl:pl-2">
          {children}
        </main>
      </div>
      <AppFoot />
    </div>
  );
}
