import { notFound, redirect } from "next/navigation";
import { LAYERS, layerById } from "@corbel/config";

export const dynamicParams = false;
export function generateStaticParams() {
  return LAYERS.map((l) => ({ layer: l.id }));
}

export default async function LayerIndex({ params }: { params: Promise<{ layer: string }> }) {
  const { layer } = await params;
  const l = layerById(layer);
  if (!l || !l.tabs[0]) notFound();
  redirect(`/app/${l.id}/${l.tabs[0].id}`);
}
