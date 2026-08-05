
import type { UseQueryResult } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";

import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";

interface QueryBoundaryProps<T> {
  query: UseQueryResult<T>;
  /** Skeleton shown while loading. */
  skeleton: React.ReactNode;
  /** True when the resolved data should be treated as empty. */
  isEmpty: (data: T) => boolean;
  empty: {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
  };
  children: (data: T) => React.ReactNode;
}

/**
 * Standardises the loading → error → empty → data flow for a TanStack query.
 * Every screen routes through this so the UX is identical everywhere.
 */
export function QueryBoundary<T>({
  query,
  skeleton,
  isEmpty,
  empty,
  children,
}: QueryBoundaryProps<T>) {
  if (query.isLoading || query.data === undefined) return <>{skeleton}</>;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  if (isEmpty(query.data)) {
    return (
      <EmptyState
        icon={empty.icon}
        title={empty.title}
        description={empty.description}
        action={empty.action}
      />
    );
  }
  return <>{children(query.data)}</>;
}
