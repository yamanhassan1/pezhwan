# Authorization security

Authorization is deny-by-default and is evaluated server-side for every
resource operation. Role and permission values come from the server-side
policy; request bodies, headers, and JWT custom claims cannot grant privileges.

Administrative routes require authentication and the `ADMIN` role. Resource
lookups must constrain both the authenticated subject and tenant/application
scope. Tests must cover IDOR/BOLA, role injection, cross-tenant identifiers,
and access after role removal.

Authorization failures return a non-enumerating response and produce an audit
event without exposing policy internals.
