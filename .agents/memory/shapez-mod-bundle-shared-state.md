---
name: Shared state across mod bundles
description: Avoid duplicate pipe-fluid registrations when separate browser mod bundles import the same helper.
---

The browser mod loader evaluates each downloaded bundle independently, so shared imports are not singletons across mods. When multiple bundles import helpers that register a fluid, keep the resulting wrapper in a `window`-scoped cache keyed by fluid and reuse it in later bundles.

**Why:** Each bundle has its own Webpack module cache, but all bundles register into the same game-level pipe-fluid registry.

**How to apply:** When two mod bundles share registration side effects, cache the registered object globally before calling the registration API again.