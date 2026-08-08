import * as React from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { DEFAULT_WORKSPACE_SLUG, getWorkspaceBySlug } from "@nv/domain";

import { AppShell } from "@/components/shell/app-shell";

// Auth pages (small, loaded eagerly)
import LoginPage from "@/app/login/page";
import RegisterPage from "@/app/register/page";
import ForgotPasswordPage from "@/app/forgot-password/page";
import ResetPasswordPage from "@/app/reset-password/page";
import VerifyEmailPage from "@/app/verify-email/page";
import NotFound from "@/app/not-found";

// Public embeddable lead-capture form (no auth, no shell).
const PublicFormPage = React.lazy(() => import("@/app/f/[form]/page"));
const PublicFunnelPage = React.lazy(() => import("@/app/fn/[funnel]/page"));

// Workspace module pages — lazy-loaded so each becomes its own chunk and the
// initial payload stays small (faster load, lower memory on the VPS).
const DashboardPage = React.lazy(() => import("@/app/w/[workspace]/dashboard/page"));
const CalendarioPage = React.lazy(() => import("@/app/w/[workspace]/calendario/page"));
const CampanasPage = React.lazy(() => import("@/app/w/[workspace]/campanas/page"));
const ContactosPage = React.lazy(() => import("@/app/w/[workspace]/contactos/page"));
const GruposPage = React.lazy(() => import("@/app/w/[workspace]/grupos/page"));
const SegmentosPage = React.lazy(() => import("@/app/w/[workspace]/segmentos/page"));
const FormulariosPage = React.lazy(() => import("@/app/w/[workspace]/formularios/page"));
const EmbudosPage = React.lazy(() => import("@/app/w/[workspace]/embudos/page"));
const SecuenciasPage = React.lazy(() => import("@/app/w/[workspace]/secuencias/page"));
const InboxPage = React.lazy(() => import("@/app/w/[workspace]/inbox/page"));
const BuilderPage = React.lazy(() => import("@/app/w/[workspace]/builder/page"));
const AiPage = React.lazy(() => import("@/app/w/[workspace]/ai/page"));
const PlantillasPage = React.lazy(() => import("@/app/w/[workspace]/plantillas/page"));
const BibliotecaPage = React.lazy(() => import("@/app/w/[workspace]/biblioteca/page"));
const AutomatizacionesPage = React.lazy(() => import("@/app/w/[workspace]/automatizaciones/page"));
const AnalyticsPage = React.lazy(() => import("@/app/w/[workspace]/analytics/page"));
const MarketplacePage = React.lazy(() => import("@/app/w/[workspace]/marketplace/page"));
const ConexionesPage = React.lazy(() => import("@/app/w/[workspace]/conexiones/page"));
const ConfiguracionPage = React.lazy(() => import("@/app/w/[workspace]/configuracion/page"));
const HistorialPage = React.lazy(() => import("@/app/w/[workspace]/historial/page"));
const AyudaPage = React.lazy(() => import("@/app/w/[workspace]/ayuda/page"));
const NovedadesPage = React.lazy(() => import("@/app/w/[workspace]/novedades/page"));
const EstadoPage = React.lazy(() => import("@/app/w/[workspace]/estado/page"));

function RouteFallback() {
  return (
    <div className="grid min-h-[40vh] place-items-center text-ink-muted">
      <span className="size-5 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
    </div>
  );
}

/**
 * Wraps a workspace module page in the shell + a Suspense boundary.
 * An unknown workspace slug falls through to the 404 page.
 */
function WorkspacePage({ children }: { children: React.ReactNode }) {
  const { workspace } = useParams<{ workspace: string }>();
  if (!workspace || !getWorkspaceBySlug(workspace)) return <NotFound />;
  return (
    <AppShell>
      <React.Suspense fallback={<RouteFallback />}>{children}</React.Suspense>
    </AppShell>
  );
}

/** Route table — mirrors the original Next.js app-router structure 1:1. */
export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to={`/w/${DEFAULT_WORKSPACE_SLUG}/dashboard`} replace />}
      />

      {/* Auth */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      {/* Public embeddable form (no auth) */}
      <Route
        path="/f/:form"
        element={
          <React.Suspense fallback={<RouteFallback />}>
            <PublicFormPage />
          </React.Suspense>
        }
      />
      <Route
        path="/fn/:funnel"
        element={
          <React.Suspense fallback={<RouteFallback />}>
            <PublicFunnelPage />
          </React.Suspense>
        }
      />

      {/* Workspace shell */}
      <Route path="/w/:workspace" element={<Navigate to="dashboard" replace />} />
      <Route path="/w/:workspace/dashboard" element={<WorkspacePage><DashboardPage /></WorkspacePage>} />
      <Route path="/w/:workspace/calendario" element={<WorkspacePage><CalendarioPage /></WorkspacePage>} />
      <Route path="/w/:workspace/campanas" element={<WorkspacePage><CampanasPage /></WorkspacePage>} />
      <Route path="/w/:workspace/contactos" element={<WorkspacePage><ContactosPage /></WorkspacePage>} />
      <Route path="/w/:workspace/grupos" element={<WorkspacePage><GruposPage /></WorkspacePage>} />
      <Route path="/w/:workspace/segmentos" element={<WorkspacePage><SegmentosPage /></WorkspacePage>} />
      <Route path="/w/:workspace/formularios" element={<WorkspacePage><FormulariosPage /></WorkspacePage>} />
      <Route path="/w/:workspace/embudos" element={<WorkspacePage><EmbudosPage /></WorkspacePage>} />
      <Route path="/w/:workspace/secuencias" element={<WorkspacePage><SecuenciasPage /></WorkspacePage>} />
      <Route path="/w/:workspace/inbox" element={<WorkspacePage><InboxPage /></WorkspacePage>} />
      <Route path="/w/:workspace/builder" element={<WorkspacePage><BuilderPage /></WorkspacePage>} />
      <Route path="/w/:workspace/ai" element={<WorkspacePage><AiPage /></WorkspacePage>} />
      <Route path="/w/:workspace/plantillas" element={<WorkspacePage><PlantillasPage /></WorkspacePage>} />
      <Route path="/w/:workspace/biblioteca" element={<WorkspacePage><BibliotecaPage /></WorkspacePage>} />
      <Route
        path="/w/:workspace/automatizaciones"
        element={<WorkspacePage><AutomatizacionesPage /></WorkspacePage>}
      />
      <Route path="/w/:workspace/analytics" element={<WorkspacePage><AnalyticsPage /></WorkspacePage>} />
      <Route path="/w/:workspace/marketplace" element={<WorkspacePage><MarketplacePage /></WorkspacePage>} />
      <Route path="/w/:workspace/conexiones" element={<WorkspacePage><ConexionesPage /></WorkspacePage>} />
      <Route
        path="/w/:workspace/configuracion"
        element={<WorkspacePage><ConfiguracionPage /></WorkspacePage>}
      />
      <Route path="/w/:workspace/historial" element={<WorkspacePage><HistorialPage /></WorkspacePage>} />
      <Route path="/w/:workspace/ayuda" element={<WorkspacePage><AyudaPage /></WorkspacePage>} />
      <Route path="/w/:workspace/novedades" element={<WorkspacePage><NovedadesPage /></WorkspacePage>} />
      <Route path="/w/:workspace/estado" element={<WorkspacePage><EstadoPage /></WorkspacePage>} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
