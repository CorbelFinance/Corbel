/** Site tools' saved choices, applied before the page paints so the theme never flashes (read by the root layout). */
export const PREFS_KEY = "corbel.prefs";
// the site tools panel is gone: settings saved by it are cleared, not applied (a saved "Still" froze the charts
// with no way left to undo it)
export const PREFS_SCRIPT = `try{localStorage.removeItem("${PREFS_KEY}");var d=document.documentElement;delete d.dataset.motion;delete d.dataset.text;delete d.dataset.density}catch(e){}`;
