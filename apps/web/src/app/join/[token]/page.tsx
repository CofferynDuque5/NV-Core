import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Loader2, Users } from "lucide-react";
import type { InviteLinkPreview } from "@nv/domain";

import { authClient } from "@/services/auth-client";
import { useAuthStore } from "@/stores/auth-store";
import { isBackendConfigured } from "@/lib/env";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";

/** /join/:token — a teammate opens a shared invite link and joins the brand. */
export default function JoinPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const hydrate = useAuthStore((s) => s.hydrate);
  const withToken = useAuthStore((s) => s.withToken);
  const refreshSession = useAuthStore((s) => s.refreshSession);

  const [preview, setPreview] = React.useState<InviteLinkPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [joining, setJoining] = React.useState(false);

  React.useEffect(() => {
    if (status === "idle" && isBackendConfigured()) void hydrate();
  }, [status, hydrate]);

  React.useEffect(() => {
    authClient
      .inviteLinkPreview(token)
      .then(setPreview)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "No se pudo abrir el enlace."));
  }, [token]);

  const next = encodeURIComponent(`/join/${token}`);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      const res = await withToken((t) => authClient.acceptInviteLink(t, token));
      // Reload memberships so the new brand shows up in the switcher.
      await refreshSession();
      navigate(`/w/${res.workspaceSlug}/campanas`, { replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "No se pudo entrar a la marca.");
      setJoining(false);
    }
  }

  const problem = preview?.problem ?? null;

  return (
    <AuthShell title="Te invitaron a un equipo" subtitle="Únete para ver y trabajar las mismas campañas.">
      {!preview && !error ? (
        <div className="flex justify-center py-8">
          <Loader2 className="text-ink-muted size-6 animate-spin" />
        </div>
      ) : null}

      {preview ? (
        <div className="space-y-4" data-testid="join-preview">
          <div className="border-line-soft bg-panel-raised flex items-center gap-3 rounded-lg border p-3">
            <span className="bg-brand/10 text-brand grid size-10 place-items-center rounded-lg">
              <Users className="size-5" />
            </span>
            <div className="min-w-0 text-sm">
              <div className="text-ink font-semibold">{preview.workspaceName}</div>
              <div className="text-ink-muted text-xs">
                Entrarás como {preview.role}
                {preview.invitedByName ? ` · te invita ${preview.invitedByName}` : ""}
              </div>
            </div>
          </div>

          {problem ? (
            <p className="text-state-danger text-sm">{problem}</p>
          ) : status === "authenticated" && user ? (
            <div className="space-y-2">
              <Button className="w-full" onClick={join} disabled={joining} data-testid="join-accept">
                {joining ? <Loader2 className="size-4 animate-spin" /> : null}
                Unirme como {user.name}
              </Button>
              <p className="text-ink-muted text-center text-xs">Entrarás con tu cuenta {user.email}.</p>
            </div>
          ) : status === "loading" || status === "idle" ? (
            <div className="flex justify-center py-2">
              <Loader2 className="text-ink-muted size-5 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-2">
              <Button asChild className="w-full">
                <Link to={`/register?next=${next}`}>Crear mi cuenta y unirme</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to={`/login?next=${next}`}>Ya tengo cuenta</Link>
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="border-state-danger/30 bg-state-danger/10 text-state-danger mt-4 rounded-lg border px-3 py-2 text-xs">
          {error}
        </p>
      ) : null}
    </AuthShell>
  );
}
