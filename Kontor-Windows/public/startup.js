// Runs independently of the application bundle, so a missing bundle is visible.
(() => {
  const panel = document.getElementById("boot-status");
  const ready = () => document.documentElement.dataset.kontorReady === "true";
  function failed(message) {
    if (ready()) return;
    message = panel.dataset.error || message;
    panel.dataset.error = message;
    panel.hidden = false;
    panel.replaceChildren();
    const title = document.createElement("h1");
    title.textContent = "Kontor konnte nicht vollständig geöffnet werden";
    const detail = document.createElement("p");
    detail.textContent = message;
    const hint = document.createElement("p");
    hint.textContent =
      "Bitte diese Meldung und die Datei %TEMP%\\Kontor-Start.log zur Fehlersuche weitergeben. Der Windows-Schutz muss dafür nicht ausgeschaltet werden.";
    panel.append(title, detail, hint);
  }
  window.addEventListener("kontor-start-failed", (e) => failed(e.detail));
  window.addEventListener(
    "error",
    (e) =>
      failed(
        e.message ||
          "Eine benötigte Programmdatei konnte nicht geladen werden.",
      ),
    true,
  );
  window.addEventListener("unhandledrejection", (e) =>
    failed(
      e.reason?.message ||
        "Die Verbindung zum Programm konnte nicht hergestellt werden.",
    ),
  );
  setTimeout(
    () =>
      failed(
        "Der Start dauert ungewöhnlich lange. Möglicherweise fehlt eine Programmdatei oder die Oberfläche konnte nicht geladen werden.",
      ),
    15000,
  );
  new MutationObserver(() => {
    if (ready()) panel.hidden = true;
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-kontor-ready"],
  });
})();
