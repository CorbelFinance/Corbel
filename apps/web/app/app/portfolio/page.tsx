import { Label } from "@corbel/ui";
import { Portfolio } from "@/components/app/Portfolio";

export const metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <Label tone="leaf">Portfolio</Label>
      </div>
      <h1 className="mt-4 font-display text-4xl">Everything one address holds.</h1>
      <p className="mt-6 max-w-2xl text-lg">Link a wallet or watch any address. Corbel reads it and never asks to sign.</p>
      <div className="mt-10">
        <Portfolio />
      </div>
    </>
  );
}
