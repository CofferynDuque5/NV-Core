import { redirect } from "next/navigation";
import { DEFAULT_WORKSPACE_SLUG } from "@nv/domain";

export default function RootPage() {
  redirect(`/w/${DEFAULT_WORKSPACE_SLUG}/dashboard`);
}
