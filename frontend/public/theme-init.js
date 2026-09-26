// Aplica o tema salvo em <html data-theme> ANTES do React renderizar, pra não
// piscar o tema errado. É um arquivo externo (e não um <script> inline) porque a
// CSP de produção só permite scripts da própria origem (script-src 'self').
(function () {
  try {
    var theme = window.localStorage.getItem("canalproart:theme");
    if (theme !== "light" && theme !== "dark") theme = "dark";
    document.documentElement.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#ebe4ff" : "#060818");
  } catch (error) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
