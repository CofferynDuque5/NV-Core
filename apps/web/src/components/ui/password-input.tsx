"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "./input";

/**
 * Password field with a show/hide toggle (eye icon). Drop-in replacement for
 * <Input type="password" />.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<typeof Input>, "type">
>(function PasswordInput({ className, ...props }, ref) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={show ? "text" : "password"} className={cn("pr-10", className)} {...props} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ocultar contraseña" : "Ver contraseña"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-faint transition-colors hover:text-ink"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
