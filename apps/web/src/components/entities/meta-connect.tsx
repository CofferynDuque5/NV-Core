import * as React from "react";
import { CheckCircle2, Facebook, Instagram, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { MetaCheck, MetaPage } from "@nv/domain";

import { useMetaStatus } from "@/hooks/use-domain-data";
import { useMetaCheck, useMetaConnect, useMetaLogin, useMetaPages } from "@/hooks/use-domain-mutations";
import { Panel, PanelHeader } from "@/components/common/panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormDialog, errorMessage } from "./form-dialog";

/**
 * «Conectar Facebook e Instagram» in one place: Facebook Login when the server
 * has a Meta app, or a pasted token otherwise. Either way the user picks a
 * Page from a list and its Instagram comes along; no ids to copy by hand.
 */
export function MetaConnectDialog({
  open,
  onOpenChange,
  pick,
  onManual,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Result of «Continuar con Facebook», when coming back from Meta. */
  pick?: string | null;
  /** Open the old form to type ids by hand. */
  onManual?: () => void;
}) {
  const status = useMetaStatus();
  const login = useMetaLogin();
  const listPages = useMetaPages();
  const connect = useMetaConnect();
  const [token, setToken] = React.useState("");
  const [pages, setPages] = React.useState<MetaPage[] | null>(null);
  const [pageId, setPageId] = React.useState<string>("");
  const [withInstagram, setWithInstagram] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // A pasted token wins over a «Continuar con Facebook» result (e.g. after it expired).
  const source = token.trim() || !pick ? { token: token.trim() } : { pick };

  function reset() {
    setToken("");
    setPages(null);
    setPageId("");
    setWithInstagram(true);
    setError(null);
  }

  const listMutate = listPages.mutate;
  const search = React.useCallback(
    (input: { token?: string; pick?: string }) => {
      setError(null);
      listMutate(input, {
        onSuccess: (list) => {
          setPages(list);
          // Preselect the first Page that has Instagram, else the first one.
          setPageId((list.find((p) => p.instagram) ?? list[0])?.id ?? "");
        },
        onError: (err) => setError(errorMessage(err)),
      });
    },
    [listMutate],
  );

  // Coming back from «Continuar con Facebook»: list the Pages right away.
  const triedPick = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (open && pick && triedPick.current !== pick) {
      triedPick.current = pick;
      search({ pick });
    }
  }, [open, pick, search]);

  function submit() {
    if (!pages) {
      if ("token" in source && token.trim().length < 20) {
        setError("Pega el token completo (empieza normalmente por «EAA…»).");
        return;
      }
      search(source);
      return;
    }
    if (!pageId) return;
    setError(null);
    connect.mutate(
      { ...source, pageId, instagram: withInstagram },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  }

  const selected = pages?.find((p) => p.id === pageId);

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
      title="Conectar Facebook e Instagram"
      description="Elige tu Página de Facebook; su Instagram profesional se conecta con ella."
      onSubmit={submit}
      pending={listPages.isPending || connect.isPending}
      error={error}
      submitLabel={pages ? "Conectar" : "Buscar mis páginas"}
      size="lg"
    >
      {pages ? (
        <div className="space-y-3" data-testid="meta-pages">
          <p className="text-xs text-ink-muted">
            {pages.length === 1 ? "Encontramos 1 Página." : `Encontramos ${pages.length} Páginas.`} Elige la de esta marca.
          </p>
          <div role="radiogroup" aria-label="Páginas de Facebook" className="max-h-72 space-y-2 overflow-y-auto">
            {pages.map((p) => (
              <label
                key={p.id}
                className={
                  "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors " +
                  (p.id === pageId ? "border-brand/60 bg-brand/10" : "border-line-soft hover:bg-panel-raised")
                }
              >
                <input
                  type="radio"
                  name="meta-page"
                  value={p.id}
                  checked={p.id === pageId}
                  onChange={() => setPageId(p.id)}
                  className="size-4 accent-[#5F86F2]"
                />
                <Facebook className="size-4 shrink-0 text-[#1877F2]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-bright">{p.name}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {p.instagram ? (
                      <>
                        <Instagram className="mr-1 inline size-3 text-[#E1306C]" />
                        {p.instagram.username ? `@${p.instagram.username}` : "Instagram vinculado"}
                      </>
                    ) : (
                      "Sin Instagram profesional vinculado"
                    )}
                    {p.category ? ` · ${p.category}` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {selected?.instagram ? (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={withInstagram}
                onChange={(e) => setWithInstagram(e.target.checked)}
                className="size-4 accent-[#5F86F2]"
              />
              Conectar también su Instagram
            </label>
          ) : selected ? (
            <p className="text-xs text-ink-muted">
              Para publicar en Instagram, pásalo a cuenta profesional (Empresa o Creador) y vincúlalo a esta Página desde
              la app de Instagram: Configuración › Cuenta › Compartir en otras apps › Facebook.
            </p>
          ) : null}
          {"token" in source ? (
            <button type="button" className="text-xs text-brand hover:underline" onClick={() => setPages(null)}>
              Usar otro token
            </button>
          ) : null}
        </div>
      ) : pick && !error ? (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="size-4 animate-spin" /> Leyendo tus páginas de Facebook…
        </div>
      ) : (
        <>
          {status.data?.oauth ? (
            <div className="space-y-2">
              <Button
                type="button"
                className="w-full bg-[#1877F2] text-white hover:bg-[#1877F2]/90"
                onClick={() => login.mutate()}
                disabled={login.isPending}
              >
                {login.isPending ? <Loader2 className="size-4 animate-spin" /> : <Facebook className="size-4" />}
                Continuar con Facebook
              </Button>
              <p className="text-center text-xs text-ink-faint">o pega un token</p>
            </div>
          ) : (
            <p className="rounded-lg border border-line-soft bg-panel-raised px-3 py-2 text-xs text-ink-muted">
              «Continuar con Facebook» se activa cuando el servidor tiene una app de Meta (META_APP_ID y META_APP_SECRET).
              Mientras tanto, pega un token: el resto es igual de fácil.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="meta-token">Token de Meta</Label>
            <textarea
              id="meta-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              rows={3}
              placeholder="EAAG…"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-line-soft bg-panel-raised px-3 py-2 font-mono text-xs text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
            />
            <ol className="list-decimal space-y-0.5 pl-4 text-[11px] text-ink-faint">
              <li>
                Abre el{" "}
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand hover:underline"
                >
                  Graph API Explorer
                </a>{" "}
                con la cuenta que administra la Página.
              </li>
              <li>
                En «Permisos» marca <code>pages_show_list</code>, <code>pages_manage_posts</code>,{" "}
                <code>pages_read_engagement</code>, <code>instagram_basic</code> y <code>instagram_content_publish</code>.
              </li>
              <li>Pulsa «Generate Access Token», acepta y copia el token aquí.</li>
            </ol>
          </div>
          {onManual ? (
            <button type="button" className="text-xs text-ink-faint hover:text-brand hover:underline" onClick={onManual}>
              Avanzado: escribir los IDs a mano
            </button>
          ) : null}
        </>
      )}
    </FormDialog>
  );
}

function CheckLine({ label, result }: { label: string; result?: MetaCheck["facebook"] }) {
  if (!result) return null;
  return (
    <li className="flex items-start gap-2">
      {result.ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-state-success" />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-state-danger" />
      )}
      <span>
        <span className="font-medium text-ink">{label}:</span> {result.ok ? `funciona (${result.name})` : result.error}
      </span>
    </li>
  );
}

/** Conexiones card: state of Facebook/Instagram, connect and test buttons. */
export function MetaConnectCard({ onConnect }: { onConnect: () => void }) {
  const status = useMetaStatus();
  const check = useMetaCheck();
  const fb = status.data?.facebook;
  const ig = status.data?.instagram;

  return (
    <Panel data-testid="meta-card">
      <PanelHeader
        title="Facebook e Instagram"
        description="Conecta tu Página y su Instagram para publicar y medir desde el panel. Al conectarlos, publican con la API oficial de Meta (sin depender del Agente en tu PC)."
        action={
          <>
            {fb || ig ? (
              <Button variant="ghost" size="sm" onClick={() => check.mutate()} disabled={check.isPending}>
                {check.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Probar conexión
              </Button>
            ) : null}
            <Button size="sm" onClick={onConnect}>
              <Facebook className="size-4" /> {fb ? "Cambiar Página" : "Conectar Facebook e Instagram"}
            </Button>
          </>
        }
      />
      <div className="space-y-2 px-5 pb-4 pt-2 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-ink-muted">
          <span className="flex items-center gap-1.5">
            <Facebook className="size-4 text-[#1877F2]" />
            {fb ? <>Página conectada <span className="text-ink-faint">(ID {fb.id})</span></> : "Sin conectar"}
          </span>
          <span className="flex items-center gap-1.5">
            <Instagram className="size-4 text-[#E1306C]" />
            {ig ? <>Instagram conectado <span className="text-ink-faint">(ID {ig.id})</span></> : "Sin conectar"}
          </span>
        </div>
        {check.data ? (
          <ul className="space-y-1 text-xs text-ink-muted" data-testid="meta-check">
            <CheckLine label="Facebook" result={check.data.facebook} />
            <CheckLine label="Instagram" result={check.data.instagram} />
          </ul>
        ) : null}
      </div>
    </Panel>
  );
}

/** Read and clear `?meta=` after Facebook sends the user back. Returns the pick, if any. */
export function useMetaReturn(): [string | null, () => void] {
  const [pick, setPick] = React.useState<string | null>(null);
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("meta");
    if (!result) return;
    if (result === "elige") setPick(url.searchParams.get("pick"));
    else if (result === "cancelado") toast.message("Conexión con Facebook cancelada.");
    else toast.error("Facebook no completó la conexión. Inténtalo de nuevo o pega un token.");
    url.searchParams.delete("meta");
    url.searchParams.delete("pick");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);
  return [pick, () => setPick(null)];
}
