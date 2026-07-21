"use client";

import * as React from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { initServices } from "@/services/configure-services";
import { QueryProvider } from "./query-provider";

// Point the service registry at the backend when NEXT_PUBLIC_API_URL is set;
// otherwise the app keeps using the empty adapters (skeletons / empty states).
initServices();

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </QueryProvider>
  );
}
