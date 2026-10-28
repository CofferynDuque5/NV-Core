import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { BadgeCheck, KeyRound, Moon, Palette, Sun, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ROLE_DESCRIPTIONS, type UserProfile } from "@nv/domain";

import { useAuthStore } from "@/stores/auth-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useTheme } from "@/providers/theme-provider";
import { authClient } from "@/services/auth-client";
import { PageHeader } from "@/components/common/page-header";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { cn } from "@/lib/utils";

const msg = (err: unknown) => (err instanceof Error ? err.message : "No se pudo guardar. Intenta de nuevo.");

/** Rules shown under the new-password field; all must pass to save. */
export function passwordProblems(next: string, confirm: string, current: string): string[] {
  const out: string[] = [];
  if (next.length < 8) out.push("Mínimo 8 caracteres.");
  if (next && current && next === current) out.push("Debe ser distinta de la actual.");
  if (confirm && next !== confirm) out.push("Las dos contraseñas no coinciden.");
  return out;
}

function AccountPanel({ profile }: { profile: UserProfile | null }) {
  const user = useAuthStore((s) => s.user);
  const updateName = useAuthStore((s) => s.updateName);
  const [name, setName] = React.useState(user?.name ?? "");
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => setName(user?.name ?? ""), [user?.name]);
  const clean = name.replace(/\s+/g, " ").trim();
  const dirty = !!user && clean !== user.name;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateName(clean);
      toast.success("Nombre actualizado.");
    } catch (err) {
      toast.error(msg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <PanelHeader title="Tu cuenta" description="Así te ve tu equipo en tareas, notas y el historial." />
      <form className="space-y-4 p-5" onSubmit={save}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Nombre</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Correo</Label>
            <Input id="profile-email" value={user?.email ?? ""} readOnly disabled />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          {profile?.emailVerified ? (
            <Badge variant="success">
              <BadgeCheck className="size-3" /> Correo verificado
            </Badge>
          ) : profile ? (
            <Badge variant="warning">Correo sin verificar</Badge>
          ) : null}
          {profile?.createdAt ? (
            <span>
              Cuenta creada el{" "}
              {new Date(profile.createdAt).toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          ) : null}
        </div>
        <Button type="submit" disabled={!dirty || clean.length < 2 || saving}>
          {saving ? "Guardando…" : "Guardar nombre"}
        </Button>
      </form>
    </Panel>
  );
}

function PasswordPanel() {
  const changePassword = useAuthStore((s) => s.changePassword);
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const problems = passwordProblems(next, confirm, current);
  const ready = current.length > 0 && next.length > 0 && confirm.length > 0 && problems.length === 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Contraseña cambiada. Cerramos tu sesión en los demás dispositivos.");
    } catch (err) {
      setError(msg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <PanelHeader
        title="Contraseña"
        description="Al cambiarla se cierra tu sesión en los demás dispositivos; en este sigues dentro."
        action={<KeyRound className="size-4 text-ink-faint" />}
      />
      <form className="space-y-4 p-5" onSubmit={save}>
        <div className="space-y-1.5">
          <Label htmlFor="pw-current">Contraseña actual</Label>
          <PasswordInput id="pw-current" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pw-new">Nueva contraseña</Label>
            <PasswordInput id="pw-new" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm">Repite la nueva</Label>
            <PasswordInput id="pw-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>
        {next && problems.length > 0 ? (
          <ul className="space-y-0.5 text-xs text-ink-muted">
            {problems.map((p) => (
              <li key={p}>· {p}</li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="text-danger text-sm">{error}</p> : null}
        <Button type="submit" disabled={!ready || saving}>
          {saving ? "Cambiando…" : "Cambiar contraseña"}
        </Button>
      </form>
    </Panel>
  );
}

function PreferencesPanel() {
  const { theme, setTheme } = useTheme();
  const options = [
    { id: "dark" as const, label: "Oscuro", icon: Moon },
    { id: "light" as const, label: "Claro", icon: Sun },
  ];
  return (
    <Panel id="preferencias">
      <PanelHeader title="Preferencias" description="Se guardan en este navegador." action={<Palette className="size-4 text-ink-faint" />} />
      <div className="space-y-2 p-5">
        <p className="text-sm font-medium">Tema del panel</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tema del panel">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={theme === o.id}
              onClick={() => setTheme(o.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                theme === o.id ? "border-brand bg-brand/10 text-ink-bright" : "border-line-soft text-ink-muted hover:text-ink",
              )}
            >
              <o.icon className="size-4" /> {o.label}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function BrandsPanel() {
  const memberships = useAuthStore((s) => s.memberships);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const { workspace: current } = useParams<{ workspace: string }>();
  return (
    <Panel>
      <PanelHeader title="Tus marcas" description="Dónde eres miembro y con qué rol." />
      {memberships.length === 0 ? (
        <p className="p-5 text-sm text-ink-muted">Aún no eres miembro de ninguna marca.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {memberships.map((m) => {
            const w = workspaces.find((x) => x.slug === m.workspaceSlug);
            return (
              <li key={m.workspaceSlug} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                  style={{ background: w?.accent ?? "#5F86F2" }}
                >
                  {w?.initials ?? m.workspaceSlug.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-bright">{w?.name ?? m.workspaceSlug}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {m.role} · {ROLE_DESCRIPTIONS[m.role]}
                  </p>
                </div>
                {m.workspaceSlug === current ? (
                  <Badge variant="outline">Abierta</Badge>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/w/${m.workspaceSlug}/dashboard`}>Abrir</Link>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export default function PerfilPage() {
  const withToken = useAuthStore((s) => s.withToken);
  const status = useAuthStore((s) => s.status);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    let alive = true;
    withToken((t) => authClient.profile(t))
      .then((p) => alive && setProfile(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [status, withToken]);

  // Opening /perfil#preferencias scrolls to that panel.
  React.useEffect(() => {
    if (window.location.hash === "#preferencias") document.getElementById("preferencias")?.scrollIntoView();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cuenta"
        title="Mi perfil"
        description="Tu nombre, tu contraseña y cómo ves el panel. Es tuyo: no cambia nada de la marca."
        actions={<UserRound className="size-6 text-ink-faint" />}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <AccountPanel profile={profile} />
          <PreferencesPanel />
        </div>
        <div className="space-y-6">
          <PasswordPanel />
          <BrandsPanel />
        </div>
      </div>
    </div>
  );
}
