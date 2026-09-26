/** Pre-paint boot splash (the white-flash bridge). */
export const BOOT_SPLASH_SCRIPT = `(function(){
  try {
    if (sessionStorage.getItem('cf:boot-splash') !== '1' && sessionStorage.getItem('usav:boot-splash') !== '1') return;
    var ID = '__boot_splash_pre';
    if (document.getElementById(ID)) return;
    var style = document.createElement('style');
    style.textContent = '@keyframes __bsSweep{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}@keyframes __bsRing{0%,100%{transform:scale(1);opacity:.6}50%{transform:scale(1.12);opacity:.15}}';
    (document.head || document.documentElement).appendChild(style);
    var root = document.createElement('div');
    root.id = ID;
    root.setAttribute('aria-hidden','true');
    root.style.cssText = 'position:fixed;inset:0;z-index:2000;background:#fff;display:flex;align-items:center;justify-content:center';
    root.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;gap:24px">'
      + '<div style="position:relative;display:flex;height:64px;width:64px;align-items:center;justify-content:center">'
      +   '<span style="position:absolute;inset:0;border-radius:16px;border:2px solid #e5e7eb;animation:__bsRing 1.8s ease-in-out infinite"></span>'
      +   '<img src="/favicon.png" width="44" height="44" style="border-radius:12px" alt=""/>'
      + '</div>'
      + '<div style="height:4px;width:160px;overflow:hidden;border-radius:9999px;background:#f3f4f6">'
      +   '<div style="height:100%;width:33%;border-radius:9999px;background:#0f172a;animation:__bsSweep 1.1s ease-in-out infinite"></div>'
      + '</div>'
      + '<p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af">Loading your workspace…</p>'
      + '</div>';
    (document.body || document.documentElement).appendChild(root);
    setTimeout(function(){ var el = document.getElementById(ID); if (el) el.remove(); }, 10000);
  } catch (e) {}
})();`;
