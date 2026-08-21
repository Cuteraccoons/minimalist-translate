# Dictionary compatibility smoke tests

These tests are intentionally local-first. Proprietary dictionaries are **not** committed or distributed.

Current regression coverage uses a user-provided ODE-style MDX locally to verify three parser cases that previously failed in the extension: exact lookup near an index-block boundary, duplicate exact keys containing both a direct article and `@@@LINK`, and ordinary exact lookup.

Run:

```bash
node tests/ode-smoke.mjs /absolute/path/to/ODE_2024.mdx
```

Future public fixtures should cover: external CSS, MDD-hosted CSS/resources, Header `StyleSheet` compact tokens, duplicate keys/link chains, case-sensitive keys, MDD images/audio, and internal tab/collapse markup.
