import { useNavigate } from "react-router-dom";
import { Eye } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";

/** Top of every page during «Ver demo»: it's read-only, and how to start for real. */
export function DemoBanner() {
  const demo = useAuthStore((s) => s.demo);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  if (!demo) return null;
  return (
    <div
      className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-sm print:hidden"
      data-testid="demo-banner"
    >
      <Eye className="size-4 shrink-0 text-brand" />
      <span className="flex-1">
        Estás viendo la <strong>demo</strong> con una marca de ejemplo: puedes mirar todo, pero no se guardan cambios.
      </span>
      <Button
        size="sm"
        onClick={() => {
          logout();
          navigate("/register");
        }}
      >
        Crear mi cuenta gratis
      </Button>
    </div>
  );
}
