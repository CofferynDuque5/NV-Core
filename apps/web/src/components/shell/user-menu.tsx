"use client";

import { LogIn, Settings, User } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="grid size-9 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand-violet text-xs font-bold text-white ring-1 ring-line-strong"
          title="Cuenta"
        >
          NV
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>Cuenta</DropdownMenuLabel>
        <div className="px-2.5 pb-2 text-xs text-ink-muted">
          No hay ninguna sesión iniciada.
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User /> Perfil
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings /> Preferencias
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogIn /> Iniciar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
