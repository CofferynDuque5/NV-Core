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
      <Input
        ref={ref}
        type={show ? "text" : "password"}
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Ocultar contraseña" : "Ver contraseña"}
        aria-pressed={show}
        className="text-ink-faint hover:text-ink focus-visible:ring-ring absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 transition-colors focus-visible:outline-none focus-visible:ring-2"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
