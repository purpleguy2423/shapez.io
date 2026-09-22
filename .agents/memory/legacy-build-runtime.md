---
name: Legacy build runtime
description: Compatibility requirements for the archived shapez build toolchain on current Replit runtimes.
---

The archived Webpack 4 build requires `NODE_OPTIONS=--openssl-legacy-provider` when run with modern Node/OpenSSL, and its browser preview must bind to Replit's managed web port.

**Why:** Without the compatibility flag, the build fails with `error:0308010C`; without an explicit web port, BrowserSync can choose a different port and the preview workflow times out.

**How to apply:** Preserve the existing Yarn/Gulp stack, use the compatibility flag for dev builds, and configure the managed workflow to wait on port 5000.