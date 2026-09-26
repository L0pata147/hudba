/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Pre-fills the server field on the login screen (e.g. for a self-hosted deployment). */
  readonly VITE_DEFAULT_SERVER_URL?: string;
}
