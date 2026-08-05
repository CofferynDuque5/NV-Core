import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/providers/theme-provider";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="grid size-9 place-items-center rounded-lg border border-line-soft bg-panel text-ink-muted transition-colors hover:border-line-bright hover:text-ink"
      title={isDark ? "Modo claro" : "Modo oscuro"}
      aria-label="Cambiar tema"
    >
      {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </button>
  );
}
