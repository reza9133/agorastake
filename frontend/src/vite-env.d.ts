/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTRACT_ADDRESS?: string;
  readonly VITE_NETWORK?: "localnet" | "studionet" | "testnetAsimov" | "testnetBradbury";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
