# pwa-nexus

A template for offline Android PWAs: plain HTML, CSS and ES modules, no build step and
no dependencies. Copy it and run `npm run init` to start a new app.

## Commands

```sh
npm test                           # unit tests (node --test)
npm run serve                      # http://localhost:8080
npm run icons                      # write the PNG icons again from icons/source.png
npm run init -- <slug> "<Name>"    # turn a copy into a new app (once)
npm run release                    # bump, commit and tag vX.Y.Z; git push --follow-tags deploys
```

## Conventions

Read `.claude/conventions/` (loaded at session start): GIT, WRITING, CANONICAL,
WORKFLOW, AUTONOMY, ARCHITECTURE, RELEVANT-FILES.
