import { RewardsBoard } from "@/components/site/RewardsBoard";

export const metadata = {
  title: "Rewards for using Corbel",
  description: "Use Corbel's tools while signed in and earn points. Each week a pool of $CORBEL goes to five people: the top three and two drawn by a block hash no one can steer. Paid from a contract that holds the whole budget.",
};

export default function RewardsPage() {
  return (
    <main className="mx-auto max-w-page px-4 pb-28 pt-28 sm:px-6 sm:pt-36 lg:px-10 xl:px-14">
      <header className="max-w-3xl">
        <p className="font-mono text-[12px] uppercase tracking-[0.12em] text-leaf">Reward season</p>
        <h1 className="mt-4 font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">Use Corbel, get paid in $CORBEL.</h1>
        <p className="mt-5 text-[16px] text-muted">Every tool you use while signed in earns points. Holders earn more, everyone can win: the top three take prizes, and two more people are drawn from everyone else who used Corbel this week.</p>
      </header>
      <div className="mt-14">
        <RewardsBoard />
      </div>
    </main>
  );
}
