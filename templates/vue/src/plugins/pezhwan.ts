/// <reference types="vite/client" />
import type { PezhwanPluginOptions } from '@pezhwan/vue';

export const pezhwanConfig: PezhwanPluginOptions = {
  baseUrl: import.meta.env.VITE_PEZHWAN_URL ?? 'http://localhost:4011',
};
