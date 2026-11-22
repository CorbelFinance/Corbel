import { BRAND, ROBINHOOD_CHAIN } from "@corbel/config";
import { LoaderStats } from "./LoaderStats";
import { NetScene } from "./NetScene";
import { Scramble } from "./Scramble";

/**
 * Intro (~3.6 s, every full load of the landing):
 * 1. the range rises, the CORBEL token appears in the middle and every layer is wired to it in turn;
 * 2. the mark and the name rise in the centre over an "opening site" counter;
 * 3. corners carry live data: the latest block and pools created on the chain in the last 24 h;
 * 4. the stage fades, a leaf seam flashes and the screen opens like shutters onto the hero.
 * CSS-timed (the shutters work without JS); skipped under prefers-reduced-motion.
 */
export function Loader() {
  return (
    <div className="loader" aria-hidden>
      <div className="ld-half ld-top" />
      <div className="ld-half ld-bot" />
      <span className="ld-seam" />

      <div className="ld-stage">
        <NetScene story="token" className="ld-terrain" />
        <div className="ld-veil" />

        <p className="ld-label left-5 top-6 sm:left-10">
          <Scramble text={`${ROBINHOOD_CHAIN.name} ${ROBINHOOD_CHAIN.id}`} /> <span className="ld-dim hidden sm:inline">· Uniswap v4</span>
        </p>
        <p className="ld-label right-5 top-6 flex items-center gap-2 sm:right-10">
          <span className="ld-led" />
          Block <LoaderStats part="block" />
        </p>

        <div className="ld-center">
          <div className="ld-mark">
            {/* eslint-disable-next-line @next/next/no-img-element -- static mark, preloaded by the header */}
            <img src="/brand/corbel-logo-128.png" alt="" width={96} height={96} />
            <span>{BRAND.name}</span>
          </div>
          <p className="ld-chip">
            <span className="ld-led" />
            Opening site <span className="ld-count" />
          </p>
        </div>

        <p className="ld-label ld-plate bottom-6 left-5 hidden items-center gap-5 sm:left-10 sm:flex">
          <span className="ld-key ld-key-crest" />
          Token
          <span className="ld-key ld-key-depth" />
          Layer
          <span className="ld-key ld-key-gap" />
          Transaction
        </p>
        <p className="ld-label ld-plate bottom-6 right-5 sm:right-10">
          <LoaderStats part="pools" /> <span className="ld-dim">pools · 24h</span>
        </p>
      </div>
    </div>
  );
}
