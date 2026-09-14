import type { PezhwanConfig } from '@pezhwan/react';

export const pezhwanConfig: PezhwanConfig = {
  baseUrl: process.env.NEXT_PUBLIC_PEZHWAN_URL ?? 'http://localhost:4011',
};
