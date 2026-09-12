# Pull Request

## Summary

<!-- One or two sentences: what this change does and why. -->

## Linked issue / context

Closes #<!-- issue number, or paste the docs/dependency-maintenance.md link for dependency PRs -->

## Changes

<!-- Bullet list of what changed and where (file paths help reviewers). -->

-

## Test plan

<!-- Which gates did you run locally? CI runs build, typecheck, lint,
     format:check, workspace tests, license + secret scan, and compose
     validation. Check what you exercised, and add new tests if applicable. -->

- [ ] `npm run build`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run format:check`
- [ ] `npm run test:root`
- [ ] Integration / load tests (if the change touches persistence, OTP, or perf):

  `npm run test:integration` / `npm run test:load`

## Security considerations

<!-- Secret scanning is mandatory; leave the first item checked only if you ran it. -->

- [ ] Ran `npm run test:security` — no secrets detected in this PR
- [ ] No credentials, signing keys, or `.env` files are committed
- [ ] Any new endpoints/secrets follow the existing validation + fail-closed patterns

## Changelog

<!-- One line, conventional-commits style, matching CHANGELOG.md format.
     Omit if a `chore:`/`docs:`-only change. -->

- `feat(core): ` / `fix(express): ` …

## Screenshots (if UI change)

<!-- Optional: attach before/after screenshots for admin-console /
     developer-portal changes. -->

## Notes for reviewers

<!-- Anything non-obvious: design tradeoffs, follow-up work, migration steps. -->
