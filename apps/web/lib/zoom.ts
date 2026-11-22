/**
 * The page is drawn smaller on wide screens with CSS zoom (see --vz in globals.css). Pointer events and
 * getBoundingClientRect speak screen pixels; styles speak the page's own pixels. Divide by this to go from one to
 * the other.
 */
export function pageZoom(): number {
  if (typeof window === "undefined") return 1;
  const z = parseFloat(getComputedStyle(document.documentElement).zoom);
  return z > 0 ? z : 1;
}
