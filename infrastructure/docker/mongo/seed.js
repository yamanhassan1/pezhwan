// PEZHWAN — MongoDB seed script (runs after init.js on first boot).
//
// This script runs inside the mongo:7 entrypoint after init.js. It is
// idempotent: every guard checks for existing data before writing.
//
// It performs the minimal bootstrap needed for the audit chain to function
// on first start, before the identity-server ensureBootstrap runs.
//
// The real seeding (tenants, applications, admin user) is handled by
// scripts/seed-database.mjs and apps/identity-server ensureBootstrap().

const DB_NAME = 'pezhwan';

try {
  const db = db.getSiblingDB(DB_NAME);

  // --- Audit sequence seed document ---
  // The AuditService.getNextSequence() uses an atomic findOneAndUpdate + $inc
  // on this document. Seeding it with seq: 0 ensures the first sequence
  // number assigned is 1 (clean start).
  const existingSeq = db.auditsequences.findOne({ _id: 'audit' });
  if (!existingSeq) {
    db.auditsequences.insertOne({ _id: 'audit', seq: 0 });
    print('[seed] Created auditsequences seed document (_id: audit, seq: 0)');
  } else {
    print('[seed] auditsequences seed document already exists — skipping');
  }

  // --- Ensure collections exist with basic validation ---
  // Collections created by init.js may have already run. These createIndex
  // calls are idempotent (no-op if index already exists).
  const collections = db.getCollectionNames();
  if (collections.includes('users')) {
    db.users.createIndex({ tenantId: 1, email: 1 }, { unique: true, sparse: true });
    db.users.createIndex({ tenantId: 1, phone: 1 }, { unique: true, sparse: true });
  }
  if (collections.includes('sessions')) {
    db.sessions.createIndex({ userId: 1, applicationId: 1, status: 1 });
    db.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  }

  print('[seed] Seed complete for database: ' + DB_NAME);
} catch (e) {
  print('[seed] Error during seeding: ' + e);
}
