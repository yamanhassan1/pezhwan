/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const API_PROXY_TARGET = process.env.VITE_PEZHWAN_URL ?? 'http://localhost:4011';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    proxy: {
      '/v1': API_PROXY_TARGET,
      '/.well-known': API_PROXY_TARGET,
    },
  },
});