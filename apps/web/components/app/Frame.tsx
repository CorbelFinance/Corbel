import type { LayerStatus } from "@corbel/config";
import { StatusChip } from "@corbel/ui";
import { LayerTabs, type BarTab } from "./LayerTabs";

/** The layer bar: code, name, state and the layer's tabs on one line; it sticks under the app tabs on wide screens. */
export function LayerBar({ num, name, line, status, layer, tabs, current }: { num: string; name: string; line: string; status: LayerStatus; layer: string; tabs: BarTab[]; current: string }) {
  return (
    <div className="-mx-4 -mt-6 border-b border-line bg-bg/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 md:sticky md:top-[108px] md:z-30 lg:-mx-8 lg:px-8 xl:top-16">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2.5">
        <p className="flex items-center gap-3 text-[14px] font-semibold">
          <span className="sr-only">{num}</span>
          <span className="text-text">{name}</span>
          <StatusChip status={status} />
        </p>
        <p className="hidden min-w-0 flex-1 truncate text-sm text-muted xl:block">{line}</p>
        {/* the numbered flow (quote → swap → …) shows on every width: it is the order to use the tools in */}
        <div className="ml-auto min-w-0 max-w-full">
          <LayerTabs layer={layer} tabs={tabs} current={current} />
        </div>
      </div>
    </div>
  );
}
