"use client";

import * as React from "react";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initServices } from "@/services/configure-services";
import { QueryProvider } from "./query-provider";
import { ConfirmProvider } from "./confirm-provider";

// Point the service registry at the backend when NEXT_PUBLIC_API_URL is set;
// otherwise the app keeps using the empty adapters (skeletons / empty states).
initServices();

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <TooltipProvider delayDuration={200}>
        <ConfirmProvider>{children}</ConfirmProvider>
      </TooltipProvider>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#14181E",
            border: "1px solid #262C34",
            color: "#E6E9EE",
          },
        }}
      />
    </QueryProvider>
  );
}
