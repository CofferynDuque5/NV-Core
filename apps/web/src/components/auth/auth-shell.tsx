import Link from "next/link";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm animate-rise-in">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-violet shadow-brand">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12h6l2-3 3 6 2-3h3" />
            </svg>
          </span>
          <div>
            <div className="font-display text-xl font-semibold text-ink-bright">NV Core</div>
            <div className="text-[9px] font-semibold tracking-[0.22em] text-ink-faint">
              BUSINESS OS
            </div>
          </div>
        </div>

        <div className="nv-panel p-6">
          <div className="mb-5 space-y-1">
            <h1 className="text-lg font-semibold text-ink-bright">{title}</h1>
            {subtitle ? <p className="text-sm text-ink-muted">{subtitle}</p> : null}
          </div>
          {children}
        </div>

        {footer ? <div className="mt-4 text-center text-sm text-ink-muted">{footer}</div> : null}

        <p className="mt-6 text-center text-[11px] text-ink-faint">
          <Link href="/" className="hover:text-ink-muted">
            ← Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
