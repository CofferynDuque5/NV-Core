import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

/**
 * Isotipo de NV Marketing: un megáfono con dos ondas (la campaña saliendo a
 * los grupos). Se dibuja en blanco sobre la baldosa degradada de la marca.
 * Es el mismo trazado que `apps/web/public/icon-*.png`, así el favicon, la
 * app instalada y la interfaz muestran exactamente el mismo símbolo.
 */
export function BrandMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="#fff"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 26h9l17-11v34L17 38H8z" />
      <path d="M17 38v11h9v-7" />
      <path d="M43 24a11 11 0 0 1 0 16" />
      <path d="M50 16a21 21 0 0 1 0 32" opacity=".55" />
    </svg>
  );
}

/** Baldosa degradada con el isotipo centrado (cabecera, menú móvil, login). */
export function BrandTile({
  size = 32,
  radius = "rounded-[9px]",
  className,
  ...rest
}: { size?: number; radius?: string; className?: string } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center bg-gradient-to-br from-brand to-brand-violet shadow-brand",
        radius,
        className,
      )}
      style={{ width: size, height: size }}
      {...rest}
    >
      <BrandMark size={Math.round(size * 0.62)} />
    </span>
  );
}
