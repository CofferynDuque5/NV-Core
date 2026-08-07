import { useNavigate } from "react-router-dom";
import { LogIn, LogOut, MessageSquarePlus, Settings, User } from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const openFeedback = useUiStore((s) => s.openFeedback);

  function onLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand-violet text-xs font-bold text-white ring-1 ring-line-strong"
          title={user ? user.name : "Cuenta"}
        >
          {user ? initialsOf(user.name) : "NV"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {user ? (
          <>
            <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
            <div className="px-2.5 pb-2 text-xs text-ink-muted">{user.email}</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User /> Perfil
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings /> Preferencias
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openFeedback}>
              <MessageSquarePlus /> Enviar comentarios
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              <LogOut /> Cerrar sesión
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuLabel>Cuenta</DropdownMenuLabel>
            <div className="px-2.5 pb-2 text-xs text-ink-muted">No hay ninguna sesión iniciada.</div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/login")}>
              <LogIn /> Iniciar sesión
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
