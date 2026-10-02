// melon·seek — apply the saved theme before first paint (classic, render-blocking script).
// External rather than inline because the server's CSP is script-src 'self'.
// System = no attribute (follows prefers-color-scheme); "light" / "dark" force it.
(function () {
  try {
    var t = localStorage.getItem('melon-seek.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: fall back to System */ }
})();
