# Disaster recovery

MongoDB is the durable source of truth and is backed up encrypted with access
restricted to the recovery role. Redis is treated as an optimizer and is not
the only copy of sessions, revocations, or rate-limit policy.

At least quarterly, restore a backup into an isolated environment, validate
indexes and tenant isolation, start the service with recovered signing-key
material, and run authentication and token-verification tests. Record RPO,
RTO, backup age, restore duration, checksums, and reviewer approval.

Recovery must include the documented emergency key-revocation and key
restoration procedures. A failed restore drill is a release blocker until
remediated and rerun.
