export const THEME_KEY = "pulse-theme";

/** runs in <head> before first paint, so the page never flashes the wrong theme */
export const THEME_BOOT = `(function(){try{var p=localStorage.getItem('pulse-theme')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;
