import { notFound } from "next/navigation";
import { DocsShell } from "@/components/docs/Shell";
import { DOCS, docBySlug } from "@/components/docs/pages";

export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const d = docBySlug((await params).slug);
  if (!d) return {};
  const description = d.lede.length > 158 ? `${d.lede.slice(0, 155).trimEnd()}…` : d.lede;
  return { title: d.title, description };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = docBySlug((await params).slug);
  if (!d) notFound();
  return <DocsShell doc={d} />;
}
