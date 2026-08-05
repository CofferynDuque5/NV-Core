/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL. When unset, the app runs in demo mode (empty adapters). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
