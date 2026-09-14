/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PROXY_TARGET = process.env.VITE_PEZHWAN_URL ?? 'http://localhost:4011';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': API_PROXY_TARGET,
      '/.well-known': API_PROXY_TARGET,
    },
  },
});
