import { useAuthStore } from "@/stores/auth-store";

/** Where a demo session lands: the example brand's dashboard. */
export function demoTarget(): string {
  const slug = useAuthStore.getState().memberships[0]?.workspaceSlug;
  return slug ? `/w/${slug}/dashboard` : "/login";
}
