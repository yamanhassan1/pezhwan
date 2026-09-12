#!/usr/bin/env node
/**
 * PEZHWAN — database seed.
 *
 * Idempotently provisions the bootstrap tenant, default application, ADMIN
 * role, and (when ADMIN_EMAIL/ADMIN_PASSWORD are set) the first admin user.
 * Safe to run repeatedly — every step is guarded by an existence check.
 *
 * Delegates provisioning to the identity-server `ensureBootstrap` so the seed
 * path and the server boot path exercise the exact same logic.
 *
 * Usage:  node scripts/seed-database.mjs
 *
 * Reads the same env vars the identity server validates (PEZHWAN_TENANT_ID,
 * PEZHWAN_APPLICATION_ID, PEZHWAN_MONGODB_URI, PEZHWAN_ADMIN_EMAIL,
 * PEZHWAN_ADMIN_PASSWORD).
 */

import mongoose from 'mongoose';
import { createPezhwan } from '@pezhwan/core';
import { ensureBootstrap } from '../apps/identity-server/src/admin.ts';

const TENANT_ID = process.env.PEZHWAN_TENANT_ID ?? 'tenant_local';
const APPLICATION_ID = process.env.PEZHWAN_APPLICATION_ID ?? 'app_pezhwan';
const MONGO_URI = process.env.PEZHWAN_MONGODB_URI ?? 'mongodb://localhost:27017/pezhwan';
const TENANT_NAME = process.env.PEZHWAN_TENANT_NAME ?? `Tenant ${TENANT_ID}`;
const ADMIN_EMAIL = process.env.PEZHWAN_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PEZHWAN_ADMIN_PASSWORD;

async function main() {
  await mongoose.connect(MONGO_URI);

  const runtime = createPezhwan({
    tenantId: TENANT_ID,
    applicationId: APPLICATION_ID,
    issuer: 'https://pezhwan.local',
    audience: 'pezhwan-seed',
    otpDelivery: { sendEmail: async () => {}, sendSms: async () => {} },
  });

  await ensureBootstrap(runtime, {
    tenantId: TENANT_ID,
    applicationId: APPLICATION_ID,
    tenantName: TENANT_NAME,
    tenantSlug: TENANT_ID,
    adminEmail: ADMIN_EMAIL,
    adminPassword: ADMIN_PASSWORD,
  });

  console.log('[seed] done');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed] failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});