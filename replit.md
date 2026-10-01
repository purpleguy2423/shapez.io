# Running shapez on Replit

The project keeps its original Node.js, Yarn, Gulp, and Webpack build system.

- The `Start application` workflow runs `yarn dev`.
- The development server listens on `0.0.0.0:5000` for Replit Preview.
- Root and `gulp/` dependencies are installed from their existing Yarn lockfiles.
- Java and ffmpeg are required by the asset build pipeline.

## Mods

- The selected browser mods are built from `shapez.io-mods/src` before the game starts.
- Bundled mods are served by the same preview workflow as the game.
- `yarn build:mods` rebuilds the mods; `yarn install:mods` reinstalls their separate toolchain if needed.