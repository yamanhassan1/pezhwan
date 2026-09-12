# CCPA/CPRA compliance

`CcpaService` (`packages/core/src/services/compliance/ccpa.service.ts`)
provides the California Consumer Privacy Act and California Privacy Rights Act
right-to-know and right-to-delete handling. CCPA is broader than GDPR in one
respect — it covers B2B and employee data too — so the service operates at the
household level.

---

## 1. What Pezhwan stores

| CCPA category                | Pezhwan data                                          |
| ---------------------------- | ----------------------------------------------------- |
| Identifiers                  | Email, phone, user ID, tenant ID, IP address         |
| Commercial information       | Subscription status, organization membership          |
| Internet/network activity    | Login history, user agent, device, risk scores       |
| Geolocation data             | Login latitude/longitude (risk engine)               |
| Inferences                   | Bot scores, risk verdicts, breach detection results  |

**Pezhwan does not sell personal information.** The Do Not Sell or Share option
(1798.120) is satisfied by policy: no personal information is disclosed to
third parties for monetary or other valuable consideration.

## 2. Consumer rights implemented

### Right to know (1798.110)

`CcpaService.rightToKnow(householdId)` assembles every profile linked to a
consumer household: `{ householdId, profiles: [{userId, handle}], collectedAt }`.
The `HouseholdCollector` function is injected so all associated digital
profiles are enumerated, matching CCPA's broader scope.

### Right to delete (1798.105)

`CcpaService.rightToDelete(householdId)` returns
`{ householdId, deletedUserIds, deletedAt }` covering the whole household.
Each profile deletion writes an audit entry
(`compliance: 'ccpa', action: 'right_to_delete'`); actual PII removal is
deferred to the configured erasure store via the audit trail + soft-delete
contract.

```ts
const ccpa = new CcpaService({
  collectHousehold: async (id) =>
    UserModel.find({ householdId: id }).select('userId handle').lean(),
}, auditService);

await ccpa.rightToDelete(householdId);
await ccpa.rightToKnow(householdId);
```

## 3. What remains the organization's responsibility

| Requirement                                 | Responsibility                                     |
| ------------------------------------------- | -------------------------------------------------- |
| Opt-out of sale/sharing mechanism           | Organization documents no-sale posture             |
| Right to correct (CPRA 1798.106)            | Organization provides correction mechanism         |
| Privacy notice                              | Organization publishes CCPA disclosures            |
| Service-provider agreements                 | Organization executes contracts with sub-processors |
| 45-day response deadline                    | Organization tracks per request                    |
| Identity verification of requester          | Organization implements                            |
| Data minimization and retention limits      | Organization defines                              |

## 4. Deployment checklist

- [ ] `HouseholdCollector` wired to the user store; household model defined
- [ ] Right-to-know endpoint exposed behind authentication
- [ ] Right-to-delete endpoint exposed behind authentication + identity
  verification
- [ ] Privacy notice updated with CCPA disclosures
- [ ] Response timeline (45 days) tracked; deletion trail retained