# pwa-nexus

A phone PWA that reads each project's `ROADMAP.md` from GitHub and commits add, edit,
move and delete actions back, with an offline queue. Built from `pwa-template`: plain HTML,
CSS and ES modules, no build step and no dependencies.

Core: `src/roadmap.js` (the lossless ROADMAP model), `src/queue.js` (the action queue and the
sync of one repository), `src/github.js` (the Contents API client). Rules: `docs/spec/`.

## Commands

```sh
npm test                           # unit tests (node --test)
npm run serve                      # http://localhost:8080
npm run icons                      # write the PNG icons again from icons/source.png
npm run release                    # bump, commit and tag vX.Y.Z; git push --follow-tags deploys
```

## Conventions

Read `.claude/conventions/` (loaded at session start): GIT, WRITING, CANONICAL,
WORKFLOW, AUTONOMY, ARCHITECTURE, RELEVANT-FILES.
