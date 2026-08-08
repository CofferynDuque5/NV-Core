import type { Form } from "@nv/domain";

/** Pure helpers for the lead-capture forms UI. */

/** Conversion rate (submissions / views) as a 0–100 number, 0 when no views. */
export function conversionRate(form: Pick<Form, "views" | "submissions">): number {
  if (form.views <= 0) return 0;
  return Math.round((form.submissions / form.views) * 1000) / 10;
}

/** Public shareable URL for a form (rendered by the /f/:id route). */
export function publicFormUrl(origin: string, formId: string): string {
  return `${origin.replace(/\/$/, "")}/f/${formId}`;
}

/** Embeddable iframe snippet a user can paste into any site. */
export function embedSnippet(origin: string, formId: string): string {
  const src = publicFormUrl(origin, formId);
  return `<iframe src="${src}" style="border:0;width:100%;max-width:480px;height:520px" loading="lazy" title="Formulario"></iframe>`;
}
