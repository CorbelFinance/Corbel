import { Header } from "@/components/site/Header";
import { Loader } from "@/components/site/Loader";
import { HashScroll } from "@/components/site/HashScroll";
import { Footer } from "@/components/site/Footer";
import { RevealRoot } from "@/components/site/RevealRoot";
import { IntroSeen } from "@/components/site/IntroSeen";
import { ChainField } from "@corbel/ui/chain-field";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* plays on every full load of any site page; moving between pages keeps the layout, so it does not replay */}
      <Loader />
      <IntroSeen />
      <Header />
      <ChainField />
      <main id="main">{children}</main>
      <Footer />
      <RevealRoot />
      <HashScroll />
    </>
  );
}
