/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PezhwanProvider } from '@pezhwan/react';
import App from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <PezhwanProvider
        config={{ baseUrl: import.meta.env.VITE_PEZHWAN_URL ?? 'http://localhost:4011' }}
      >
        <App />
      </PezhwanProvider>
    </BrowserRouter>
  </StrictMode>,
);
