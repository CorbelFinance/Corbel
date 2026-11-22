import { BRAND } from "@corbel/config";
import { Hero, FactStrip, Manifesto, Layers } from "@/components/sections/Top";
import { OneBalance, Comparison } from "@/components/sections/Core";
import { OnChain } from "@/components/sections/OnChain";
import { Safety, OpenData, Token, Roadmap, Faq, Closing } from "@/components/sections/Bottom";
import { StoryGraph } from "@/components/sections/StoryGraph";


export default function Landing() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              { "@type": "Organization", name: BRAND.name, url: `https://${BRAND.domains.site}`, logo: `https://${BRAND.domains.site}/brand/corbel-logo-512.png` },
              { "@type": "WebSite", name: BRAND.name, url: `https://${BRAND.domains.site}`, description: BRAND.description },
            ],
          }),
        }}
      />
      <Hero />
      <FactStrip />
      <Manifesto />
      <StoryGraph />
      <Layers />
      <Comparison />
      <OpenData />
      <OneBalance />
      <OnChain />
      <Safety />
      <Token />
      <Roadmap />
      <Faq />
      <Closing />
    </>
  );
}
