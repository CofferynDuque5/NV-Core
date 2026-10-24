/**
 * Símbolo oficial de NV Marketing: el megáfono (NV-Marketing-Logo-Megafono,
 * `svg/simbolo-blanco.svg`). Se dibuja en blanco para ir sobre la baldosa con
 * el degradado de marca #5F86F2 → #8C7BEF.
 */
export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      strokeWidth="5"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 26h9l17-11v34L17 38H8z" stroke="#fff" strokeLinejoin="round" />
      <path d="M17 38v11h9v-7" stroke="#fff" strokeLinejoin="round" />
      <path d="M43 24a11 11 0 0 1 0 16" stroke="#fff" strokeLinecap="round" />
      <path d="M50 16a21 21 0 0 1 0 32" stroke="rgba(255,255,255,.55)" strokeLinecap="round" />
    </svg>
  );
}
