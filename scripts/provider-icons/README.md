# Provider icon sources

Monochrome provider marks used by the model icon picker, plus the generator that
turns them into the sprite the renderer loads.

```text
scripts/provider-icons/
  NOTICE.txt          upstream MIT notice, embedded into the generated sprite
  build.mjs           generator: vendors/*.svg -> apps/desktop/public/provider-icons.svg
  vendors/<id>.svg    one upstream SVG per symbol id (30 files)
```

## Artwork provenance

`vendors/*.svg` are unmodified files from
[`@lobehub/icons-static-svg`](https://github.com/lobehub/lobe-icons) version
**1.95.1**, pinned as a source snapshot rather than a dependency: the sprite then
builds offline, and upstream artwork churn cannot silently change the app's icons.

MIT License, Copyright (c) 2023 LobeHub. The notice is kept in `NOTICE.txt` and
embedded in the generated sprite.

## Commands

```bash
pnpm build:provider-icons     # regenerate apps/desktop/public/provider-icons.svg
pnpm check:provider-icons     # fail when the committed sprite is stale
```

`apps/desktop/test/model-icons.test.mjs` runs the check mode, so a sprite that no
longer matches `vendors/` fails the desktop test suite.

## Adding a provider

1. Drop the upstream monochrome SVG in `vendors/<id>.svg` (see refresh below).
2. Map the provider id to that `<id>` in `apps/desktop/src/lib/model-icons.tsx`
   (`PROVIDER_ICONS`), or add a `MODEL_ICON_RULES` pattern when the icon should be
   chosen from the model name.
3. Run `pnpm build:provider-icons` and commit the regenerated sprite.

The generator fails when `model-icons.tsx` references a symbol without a vendor
file, and warns when a vendor file is never referenced.

## Refreshing from upstream

```bash
cd "$(mktemp -d)"                                  # any scratch directory
npm pack @lobehub/icons-static-svg@<version>
tar -xzf lobehub-icons-static-svg-<version>.tgz
cp package/icons/<id>.svg <repo>/scripts/provider-icons/vendors/<id>.svg
```

Then regenerate the sprite, review the diff, and update the version recorded
above. Never edit the generated `provider-icons.svg` by hand.

## Differences from the PiLaw reference sprite

This sprite was first assembled from the `D:\pi Agent\PI-Desktop` (PiLaw)
checkout. Compared with that reference, the lobe 1.95.1 sources render the same
geometry for 24 symbols; `mistral`, `huggingface`, and `aws` differ only in how
the path data is split or rounded, and `openrouter`, `azure`, and `antgroup`
carry newer upstream artwork. If the reference artwork is required for any of
them, replace that vendor file with the reference glyph and regenerate.
