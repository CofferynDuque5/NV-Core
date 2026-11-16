import type { Form } from "@nv/domain";

/** Pure helpers for the lead-capture forms UI. */

/** Conversion rate (submissions / views) as a 0–100 number, 0 when no views. */
export function conversionRate(form: Pick<Form, "views" | "submissions">): number {
  const views = Number(form.views) || 0;
  const subs = Number(form.submissions) || 0;
  if (views <= 0) return 0;
  return Math.round((subs / views) * 1000) / 10;
}

/** Public shareable URL for a form (rendered by the /f/:id route). */
export function publicFormUrl(origin: string, formId: string): string {
  return `${origin.replace(/\/$/, "")}/f/${formId}`;
}

/**
 * Embeddable snippet for any site. The iframe can't see the host page's URL,
 * so a tiny script forwards the page's utm_* params, its address and its
 * referrer; without JavaScript the plain iframe still works (no origin data).
 */
export function embedSnippet(origin: string, formId: string): string {
  const src = publicFormUrl(origin, formId);
  const id = `nv-form-${formId}`;
  return (
    `<iframe id="${id}" src="${src}" style="border:0;width:100%;max-width:480px;height:520px" loading="lazy" title="Formulario"></iframe>\n` +
    `<script>(function(){var f=document.getElementById("${id}"),q=new URLSearchParams(location.search),p=new URLSearchParams();` +
    `q.forEach(function(v,k){if(k.indexOf("utm_")===0)p.set(k,v)});p.set("nv_page",location.origin+location.pathname);` +
    `if(document.referrer)p.set("nv_ref",document.referrer);f.src="${src}?"+p.toString()})();</script>`
  );
}
