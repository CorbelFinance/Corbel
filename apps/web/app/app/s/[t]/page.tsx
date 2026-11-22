import { SharedView } from "@/components/app/SharedView";

/** A read-only share link: holdings with the address left out, until the link expires. Not indexed. */
export const metadata = { title: "Shared wallet", robots: { index: false, follow: false } };

export default async function SharedPage({ params }: { params: Promise<{ t: string }> }) {
  const { t } = await params;
  return (
    <div className="mx-auto max-w-3xl">
      <SharedView t={t} />
    </div>
  );
}
