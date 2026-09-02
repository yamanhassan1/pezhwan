# Key management

Signing keys are asymmetric and are published through JWKS. Every access token
must contain a `kid`. Keys transition through `GENERATED`, `STAGED`, `ACTIVE`,
`VERIFY-ONLY`, `RETIRED`, and `REVOKED`; only `ACTIVE` keys sign and only
non-revoked keys verify or appear in JWKS.

## Operating procedure

1. Generate a key in a protected key directory or external secret provider.
2. Stage and publish it, verify JWKS propagation, then activate it.
3. Keep the previous key in `VERIFY-ONLY` during the maximum token lifetime.
4. Retire it after that window and revoke immediately if compromise is
   suspected.
5. Record the key ID, operator, reason, and change ticket; never record private
   key material.

The key directory must be writable only by the service account and must be
backed up encrypted. Test rotation and revoked-key rejection before release.
