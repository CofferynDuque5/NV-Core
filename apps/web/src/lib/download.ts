/** Save a CSV string as a file from the browser. */
export function downloadCsv(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Print (→ "Guardar como PDF") in the light theme, so dark panels don't print as grey on white. */
export function printReport() {
  const root = document.documentElement;
  const before = root.className;
  root.classList.remove("dark");
  root.classList.add("light");
  const restore = () => {
    root.className = before;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
}
