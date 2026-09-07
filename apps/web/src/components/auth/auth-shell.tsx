import { Link } from "react-router-dom";
import { CalendarClock, MessageCircle, Sparkles, Users } from "lucide-react";

const FEATURES = [
  { icon: MessageCircle, text: "Difunde a WhatsApp, Telegram, Facebook e Instagram" },
  { icon: CalendarClock, text: "Campañas programadas con rotación de imágenes" },
  { icon: Users, text: "CRM, embudos y automatizaciones en un solo lugar" },
  { icon: Sparkles, text: "IA que crea tu contenido y tus flyers" },
];

function Logo({ className }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 12h6l2-3 3 6 2-3h3" />
    </svg>
  );
}

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
    <div className="bg-canvas text-ink relative min-h-screen overflow-hidden">
      {/* Animated backdrop */}
      <div className="nv-aurora" aria-hidden>
        <div className="nv-aurora__grid" />
        <span
          className="nv-orb"
          style={{
            width: 520,
            height: 520,
            top: "-8%",
            left: "-6%",
            background: "hsl(var(--brand-a))",
          }}
        />
        <span
          className="nv-orb"
          style={{
            width: 460,
            height: 460,
            bottom: "-10%",
            right: "-4%",
            background: "hsl(var(--brand-b))",
            animationDelay: "-6s",
            opacity: 0.45,
          }}
        />
        <span
          className="nv-orb"
          style={{
            width: 320,
            height: 320,
            top: "40%",
            left: "55%",
            background: "hsl(var(--brand-a))",
            animationDelay: "-11s",
            opacity: 0.25,
          }}
        />
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-2">
        {/* Marketing panel (desktop) */}
        <div className="hidden flex-col justify-between p-12 lg:flex">
          <div className="flex items-center gap-3">
            <span className="from-brand to-brand-violet shadow-brand grid size-11 place-items-center rounded-xl bg-gradient-to-br">
              <Logo />
            </span>
            <div>
              <div className="font-display text-ink-bright text-xl font-semibold">NV Core</div>
              <div className="text-ink-faint text-[9px] font-semibold tracking-[0.22em]">
                BUSINESS OS
              </div>
            </div>
          </div>

          <div className="max-w-md">
            <h2 className="nv-rise font-display text-ink-bright text-3xl font-semibold leading-tight">
              Tu centro de operaciones para{" "}
              <span className="nv-gradient-text">marketing y ventas</span>.
            </h2>
            <p className="nv-rise text-ink-muted mt-3 text-sm" style={{ animationDelay: "0.08s" }}>
              Difunde, automatiza y mide todo desde un mismo lugar.
            </p>
            <ul className="mt-8 space-y-3">
              {FEATURES.map((f, i) => (
                <li
                  key={f.text}
                  className="nv-rise text-ink flex items-center gap-3 text-sm"
                  style={{ animationDelay: `${0.16 + i * 0.08}s` }}
                >
                  <span className="border-line-soft bg-panel-raised text-brand grid size-8 shrink-0 place-items-center rounded-lg border">
                    <f.icon className="size-4" />
                  </span>
                  {f.text}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-ink-faint text-[11px]">
            © {new Date().getFullYear()} NV Core · Business Operating System
          </p>
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center px-4 py-10">
          <div className="animate-rise-in w-full max-w-sm">
            {/* Brand (mobile / small screens) */}
            <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
              <span className="from-brand to-brand-violet shadow-brand grid size-11 place-items-center rounded-xl bg-gradient-to-br">
                <Logo />
              </span>
              <div>
                <div className="font-display text-ink-bright text-xl font-semibold">NV Core</div>
                <div className="text-ink-faint text-[9px] font-semibold tracking-[0.22em]">
                  BUSINESS OS
                </div>
              </div>
            </div>

            <div className="nv-panel p-6 shadow-2xl shadow-black/20 backdrop-blur-sm">
              <div className="mb-5 space-y-1">
                <h1 className="text-ink-bright text-lg font-semibold">{title}</h1>
                {subtitle ? <p className="text-ink-muted text-sm">{subtitle}</p> : null}
              </div>
              {children}
            </div>

            {footer ? (
              <div className="text-ink-muted mt-4 text-center text-sm">{footer}</div>
            ) : null}

            <p className="text-ink-faint mt-6 text-center text-[11px]">
              <Link to="/" className="hover:text-ink-muted">
                ← Volver al inicio
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
