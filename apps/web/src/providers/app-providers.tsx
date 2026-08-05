
import * as React from "react";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initServices } from "@/services/configure-services";
import { QueryProvider } from "./query-provider";
import { ConfirmProvider } from "./confirm-provider";
import { ThemeProvider } from "./theme-provider";

// Point the service registry at the backend when VITE_API_URL is set;
// otherwise the app keeps using the empty adapters (skeletons / empty states).
initServices();

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <TooltipProvider delayDuration={200}>
          <ConfirmProvider>{children}</ConfirmProvider>
        </TooltipProvider>
        <Toaster position="bottom-right" theme="system" richColors closeButton />
      </QueryProvider>
    </ThemeProvider>
  );
}
