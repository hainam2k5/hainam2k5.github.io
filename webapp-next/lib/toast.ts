// Lightweight imperative toast (DOM-based), matching the static app's UI.toast.
let timer: ReturnType<typeof setTimeout> | null = null;

export function toast(msg: string, type?: "error" | "success") {
  if (typeof document === "undefined") return;
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = "toast show " + (type ? "toast-" + type : "");
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { if (el) el.className = "toast"; }, 3200);
}
