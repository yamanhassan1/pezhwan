'use client';

import type { ReactNode } from 'react';
import { PezhwanProvider } from '@pezhwan/react';
import { pezhwanConfig } from '@/lib/pezhwan';

export default function AuthProvider({ children }: { children: ReactNode }) {
  return <PezhwanProvider config={pezhwanConfig}>{children}</PezhwanProvider>;
}
