/** "Chrome · Windows" from a browser's user agent (enough to recognise a device). */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "—";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Navegador";
  const os = /Android/.test(ua)
    ? "Android"
    : /iPhone|iPad|iOS/.test(ua)
      ? "iPhone/iPad"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "otro sistema";
  return `${browser} · ${os}`;
}

/** Phone, tablet or computer, from the user agent. */
export function deviceKind(ua: string | null | undefined): "movil" | "tablet" | "computadora" {
  if (!ua) return "computadora";
  if (/iPad|Tablet|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|Android/i.test(ua)) return "movil";
  return "computadora";
}
