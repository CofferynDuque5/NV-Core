"use client";

import * as React from "react";

/**
 * Registers a global keydown handler for a key + (meta/ctrl) combination.
 */
export function useKeyboardShortcut(
  key: string,
  handler: () => void,
  options: { meta?: boolean } = {},
): void {
  const { meta = false } = options;
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const matchesMeta = meta ? e.metaKey || e.ctrlKey : true;
      if (e.key.toLowerCase() === key.toLowerCase() && matchesMeta) {
        if (meta) e.preventDefault();
        handler();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, handler, meta]);
}
