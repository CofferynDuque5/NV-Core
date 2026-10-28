import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  CURRENCY_LABEL,
  GROUP_CATEGORIES,
  GROUP_COUNTRIES,
  GROUP_COUNTRY_IDS,
  type Group,
  type GroupRulesCheck,
} from "@nv/domain";

import { useCheckGroupRules, useUpdateGroup } from "@/hooks/use-domain-mutations";
import { countryLine } from "@/lib/groups";
import { FormDialog, errorMessage } from "./form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const selectCls =
  "flex h-9 w-full rounded-lg border border-line-soft bg-panel-raised px-3 text-sm text-ink focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25";

function Toggle({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line-soft p-3">
      <input id={id} type="checkbox" className="mt-0.5 size-4 accent-[#5F86F2]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-muted">{hint}</span>
      </span>
    </label>
  );
}

/**
 * One group's posting settings: kept out or not, what kind of group it is,
 * its country (prices go in its currency) and what its rules ask for — with
 * «Revisar reglas» reading the rules again.
 */
export function GroupRulesDialog({ group, onOpenChange }: { group: Group | null; onOpenChange: (v: boolean) => void }) {
  const update = useUpdateGroup();
  const check = useCheckGroupRules();
  const [excluded, setExcluded] = React.useState(false);
  const [category, setCategory] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [requiresPrice, setRequiresPrice] = React.useState(false);
  const [requiresImage, setRequiresImage] = React.useState(false);
  const [forbidsAds, setForbidsAds] = React.useState(false);
  const [rules, setRules] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [result, setResult] = React.useState<GroupRulesCheck | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback((g: Group) => {
    setExcluded(!!g.excluded);
    setCategory(g.category ?? "");
    setCountry(g.country ?? "");
    setRequiresPrice(!!g.requiresPrice);
    setRequiresImage(!!g.requiresImage);
    setForbidsAds(!!g.forbidsAds);
    setRules(g.description ?? "");
    setTags((g.tags ?? []).join(", "));
  }, []);

  React.useEffect(() => {
    if (!group) return;
    load(group);
    setResult(null);
    setError(null);
  }, [group, load]);

  if (!group) return null;
  const detected = countryLine({ ...group, country: null, detectedCountry: group.countrySource === "manual" ? null : group.detectedCountry });
  const currency = country ? GROUP_COUNTRIES[country]?.currency : group.detectedCountry ? GROUP_COUNTRIES[group.detectedCountry]?.currency : null;

  const save = () => {
    setError(null);
    update.mutate(
      {
        id: group.id,
        input: {
          excluded,
          category: category || null,
          country: country || null,
          requiresPrice,
          requiresImage,
          forbidsAds,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          // Synced groups take their description from WhatsApp.
          ...(group.synced ? {} : { description: rules }),
        },
      },
      { onSuccess: () => onOpenChange(false), onError: (err) => setError(errorMessage(err)) },
    );
  };

  const recheck = async () => {
    setError(null);
    try {
      if (!group.synced && rules !== (group.description ?? "")) {
        await update.mutateAsync({ id: group.id, input: { description: rules } });
      }
      const [r] = await check.mutateAsync(group.id);
      if (r) {
        setResult(r);
        load(r.group);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <FormDialog
      open={group !== null}
      onOpenChange={onOpenChange}
      title={`Reglas de «${group.name}»`}
      description="Decide si tus campañas pueden ir a este grupo y qué piden sus reglas."
      onSubmit={save}
      pending={update.isPending}
      error={error}
      size="lg"
    >
      <Toggle
        id="gr-excluded"
        label="Apartar este grupo"
        hint="Ninguna campaña publicará aquí, aunque lo elijas por error."
        checked={excluded}
        onChange={setExcluded}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="gr-category">Tipo de grupo</Label>
          <select id="gr-category" className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Sin indicar</option>
            {GROUP_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {c.neverPost ? " (no se publica)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gr-country">País del grupo</Label>
          <select id="gr-country" className={selectCls} value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">{detected ? `Detectado: ${detected}` : "No detectado: elígelo"}</option>
            {GROUP_COUNTRY_IDS.map((id) => (
              <option key={id} value={id}>
                {GROUP_COUNTRIES[id]!.name} · {GROUP_COUNTRIES[id]!.symbol}
              </option>
            ))}
          </select>
          <p className="text-xs text-ink-muted">
            {currency ? `Los precios salen en ${CURRENCY_LABEL[currency] ?? currency}.` : "Sin país no sabemos en qué moneda poner el precio."}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gr-tags">Etiquetas</Label>
        <Input id="gr-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Ej: caracas, ropa, clientes vip" />
        <p className="text-xs text-ink-muted">Separadas por coma. Sirven para filtrar y elegir grupos rápido.</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Toggle id="gr-price" label="Exige precio" hint="Solo se envía si la campaña tiene precio en su moneda." checked={requiresPrice} onChange={setRequiresPrice} />
        <Toggle id="gr-image" label="Exige foto" hint="Solo se envía si la campaña lleva imagen." checked={requiresImage} onChange={setRequiresImage} />
        <Toggle id="gr-ads" label="Prohíbe publicidad" hint="No se envía ninguna campaña." checked={forbidsAds} onChange={setForbidsAds} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gr-rules">Reglas del grupo</Label>
        <Textarea
          id="gr-rules"
          rows={4}
          value={rules}
          readOnly={group.synced}
          onChange={(e) => setRules(e.target.value)}
          placeholder={group.synced ? "Este grupo no tiene descripción en WhatsApp." : "Pega aquí las reglas del grupo para revisarlas."}
        />
        <p className="text-xs text-ink-muted">
          {group.synced
            ? "Se leen de la descripción del grupo en WhatsApp."
            : "Pega las reglas que fijaron los administradores."}
          {group.rulesCheckedAt ? ` Última revisión: ${new Date(group.rulesCheckedAt).toLocaleString("es")}.` : ""}
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-line-soft p-3">
        <Button type="button" variant="secondary" size="sm" onClick={recheck} disabled={check.isPending || update.isPending}>
          {check.isPending ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Revisar reglas
        </Button>
        {result ? (
          <div data-testid="group-rules-result">
            <p className={result.canPost ? "text-sm font-medium text-state-success" : "text-sm font-medium text-state-danger"}>
              {result.canPost ? "Puedes publicar en este grupo." : "No conviene publicar en este grupo."}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
              {result.notes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-ink-faint">
              {result.source === "whatsapp" ? "Leído de WhatsApp ahora mismo." : "Revisado con las reglas guardadas (WhatsApp no está conectado)."}
            </p>
          </div>
        ) : null}
      </div>
    </FormDialog>
  );
}
