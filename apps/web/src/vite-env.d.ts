/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL. When unset, the app runs in demo mode (empty adapters). */
  readonly VITE_API_URL?: string;
  /** Public URL of the legal page (sitio/legal.html); defaults to DEFAULT_LEGAL_URL. */
  readonly VITE_LEGAL_URL?: string;
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
