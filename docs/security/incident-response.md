# Incident response

On suspected credential or signing-key compromise: preserve logs, page the
on-call owner, disable the affected client or account, revoke the key or
session family, rotate secrets, and assess affected tenants. Do not delete
evidence while containing the incident.

The incident record includes detection time, scope, indicators, actions,
approvals, customer impact, and corrective actions. Security events are
correlated with request IDs and retained according to the approved policy.

Run a tabletop exercise at least quarterly and after material authentication,
OAuth, or key-management changes.
