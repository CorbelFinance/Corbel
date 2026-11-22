import { notFound } from "next/navigation";
import { EarnPool } from "@/components/app/EarnPool";

export const metadata = { title: "Pool" };

export default async function PoolPage({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(pair)) notFound();
  return <EarnPool pair={pair} />;
}
