"use client";

import * as React from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "./query-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </QueryProvider>
  );
}
