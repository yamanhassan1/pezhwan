# Support

Welcome to Pezhwan (پېژوان). This document explains how to get help, where to
ask what, and which versions are supported.

## Community support

General questions, ideas, and discussion happen in the community channels:

```
<GitHub Discussions / community forum placeholder — replace with the real URL>
```

Before asking, please:

- Read the [README](README.md) and the [documentation index](docs/README.md)
- Search the issue tracker and Discussions for existing answers
- Try the [tutorials](docs/tutorials/README.md) for common setups

Community support is best-effort and provided by maintainers and contributors.
There is no SLA on community channels.

## Issue tracker

Bugs and feature requests are tracked as GitHub issues.

### Reporting a bug

- **Search first** — check whether the issue already exists.
- Include:
  - Pezhwan version and package (`@pezhwan/*`) involved
  - Node.js version and platform
  - MongoDB/Redis versions if relevant
  - A minimal reproduction or failing test
  - Expected vs actual behavior
- Tag the issue `bug` so it is easy to route.

### Security vulnerabilities

Do **not** file security vulnerabilities as public issues. Report them privately
following [SECURITY.md](SECURITY.md).

## Feature requests

- Open an issue tagged `enhancement`.
- Describe the problem you are solving, the proposed behavior, and any
  alternatives considered.
- Small, focused proposals are easier to review than broad ones.

For substantial new SDKs or architecture-level changes, discuss the idea in the
community channels and read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a
design document or PR.

## Version support matrix

Pezhwan is in active development and is distributed as `0.1.x`. Only the latest
release is supported with fixes.

| Version | Support level                            |
| ------- | ---------------------------------------- |
| Latest  | Bug fixes, security fixes, documentation |
| Older   | Upgrade required                         |

Pre-`0.1` snapshots from this repository's history are unsupported.

## Documentation and troubleshooting

Good places to start when stuck:

- [Debugging](docs/developer/debugging.md)
- [Development setup](docs/developer/GETTING-STARTED.md)
- [Operations](docs/operations/README.md)

If the docs do not cover your problem, ask in the community channels or open a
`docs` issue so the gap can be fixed. If you find a documentation bug, a PR is
welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
