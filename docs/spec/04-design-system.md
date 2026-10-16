# Design system

The shared tokens, base rules, components, layouts and icon rules come from `pwa-design-system`.
Its rules DS-1 to DS-8 are in its `docs/spec/01-design-system.md`, and LAY-1 to LAY-4 in its
`docs/spec/02-layout.md`. `vendor/design-system/SOURCE.json` names the version and the commit that
this app uses. `tests/design.test.js` runs each rule of `vendor/design-system/rules.js` over the
files of the app, with no skip. `designs/index.html` shows each part, shared and own.

This document holds the rules of the app only.

## The copy

- **DSV-1** `vendor/design-system/` holds `design-system.css`, `catalog.js`, `rules.js` and
  `SOURCE.json`: the version, the commit and the sha256 of each file, and no other file. Only
  `npm run ds` writes it, from `../pwa-design-system` with no uncommitted change of those files. A
  file that differs from its hash fails `tests/vendor.test.js`. The tests read the copy only, so
  they pass with no `../pwa-design-system`.
- **DSV-2** `index.html` and `designs/index.html` link `vendor/design-system/design-system.css`
  before `styles.css`, and `SHELL` of `sw.js` has both (SW-2). A layer of the two sheets is one
  layer: a rule of `styles.css` comes after the shared rules of its layer.
- **DSV-3** `styles.css` starts with the same layer statement and holds the parts of the app only:
  the `body` rule and the font of the controls, the screen parts, and its versions of shared
  components. A version of a shared component starts with the block `/* @extends <name> */`, in
  the same layer, so that it wins; the block documents the parts, variants and states that the
  app adds. A version holds only the rules that differ from the shared ones, so that a change of
  the shared sheet reaches the app. No other rule of `components` or `layouts` repeats a selector
  of the shared sheet. The app has its own versions of:
  - `input`: the variant `filter`, the search box above the roadmap, with a gap below it (UI-8);
  - `field`: the variant `multiline`, the body field of the item sheet (UI-3);
  - `section-head`: the variant `nested`, on `section-head` and `item-row`, for an H3 section one
    level in (UI-2);
  - `item-row`: `item-row-name` has a vertical padding, so that the title and the line below it
    keep a gap to the edges of the row.
- **DSV-4** A change of a shared part is made in `pwa-design-system`, then `npm run ds` here.
  Nothing edits `vendor/` by hand, and `npm run init` copies it as it is (ENG-17).

## Parts of the app

The parts of `styles.css`, by layer. The shared parts are in the design system.

| Layer | Parts |
|---|---|
| components | versions of `input`, `field`, `section-head`, `item-row` (DSV-3) |
| screens | settings: `settings`, `about`, `version-status` · nav: `dust` · onboarding: `onboarding`, `onboarding-art` |
