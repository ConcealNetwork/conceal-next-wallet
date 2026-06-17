## Summary

<!-- What does this change, and why? -->

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor / chore
- [ ] Docs

## Test plan

<!-- How did you verify this? Commands run, scenarios covered. -->
- [ ] `npm run dev`
- [ ] `npm run test`
- [ ] `npm run build` `npx serve ./out/`

## Checklist

- [ ] `npm run types`, `npm run lint`, `npm run format` and `npm test` pass
- [ ] `npm run build` succeeds (if the change affects the build)
- [ ] `npm run concealjs:prebuild` was run and committed (only if bumping `conceal-lib-js`)
- [ ] Service-layer changes update the interface **and** both the mock and real implementations
- [ ] Docs updated if behavior changed
- [ ] No secrets, keys, or seed phrases in the diff
