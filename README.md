# Nexus

A phone app to manage the roadmaps of my projects. It reads the `ROADMAP.md` of each GitHub
repository, and commits each change back from the phone. Plain HTML, CSS and ES modules, built
from `pwa-template`: no build step and no dependencies.

- **Projects:** Shopping (`Gekyzo/shopping-list`), Wardrobe (`Gekyzo/pwa-wardrobe`), Financial
  calculator (`Gekyzo/pwa-financial-calculator`), Shifts (`Gekyzo/pwa-shifts`) and Nexus
  (`Gekyzo/pwa-nexus`) by default. Add, rename or remove projects in
  Settings.
- **Roadmap:** the `##` and `###` sections of `ROADMAP.md`, with their `- **Title.** text` items.
- **Actions:** add an item to a section you pick, edit it, move it to another section, or delete
  it. Each action is one commit on the default branch, such as `Add roadmap item: <title>`.
- **Offline:** an action made with no network waits in a queue and commits on the next sync.
  An action whose item changed on GitHub meanwhile is kept with **Discard**, never applied to
  another item.

The app changes only the lines of the item it acts on: every other byte of `ROADMAP.md` stays.

## GitHub token

The app needs a fine-grained personal access token. It stays on the phone and goes only to
`api.github.com`. Export never includes it.

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained
   tokens** → **Generate new token**.
2. **Repository access:** **Only select repositories**, then pick the repositories of the
   projects.
3. **Permissions** → **Repository permissions** → **Contents:** **Read and write**.
4. Generate the token, then paste it in the app: **Settings** → **GitHub** → **Access token**.
   **Test the token** reads `ROADMAP.md` of each project and shows the result of each one.

A repository that you add later needs access in the token too: edit the token on GitHub.

## Develop

```sh
npm run serve   # http://localhost:8080
npm test
```

## Install on Android

Open the deployed URL in Chrome. Use the **Install** button of Settings, or Chrome menu →
**Install app**.

## Release and deploy

1. Write the user-visible changes under `## Unreleased` in `CHANGELOG.md`.
2. `npm run release` (or `npm run release -- minor|major`). It commits `Bump version to X.Y.Z`
   and creates the tag `vX.Y.Z`.
3. `git push --follow-tags`. The workflow `.github/workflows/pages.yml` deploys the tag.

Set the repository's Pages source to "GitHub Actions" once.

## Design system

`styles.css` holds the tokens and the components in five layers. Open `/designs/` on the dev
server for the catalogue. `docs/spec/04-design-system.md` has the rules.
