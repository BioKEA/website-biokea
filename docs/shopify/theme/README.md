# Store theme files we own

store.biokea.ai runs Shopify's **Horizon** theme (theme id `145016914154`,
the only theme, live). Most of it is stock Horizon and is edited in the
theme editor. The files in this folder are the ones we changed by hand. Each
sits at its theme-relative path, so `templates/page.order.json` here is
`templates/page.order.json` in the theme.

## What in each file is ours

| File                           | Ours                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `templates/page.order.json`    | The whole file. It is `page.json` with the `page-content` block swapped for one `custom-liquid` block (`custom_liquid_order`) that mounts the quote widget from `biokea.ai/widget/quote.{css,js}`. Used by the **Order** page (handle `order`, template suffix `order`). |
| `templates/product.quote.json` | Only the `custom_liquid` string of block `custom_liquid_CGdHbB`: a **Configure this service →** button to `/pages/order?service=barcoding` or `?service=metabarcoding` (for `edna-metabarcoding`). Everything else is editor-owned.                                      |
| `templates/index.json`         | Only the hero button `button_H9gpTf`: `label` "Configure a sequencing order", `link` `/pages/order`. Everything else is editor-owned.                                                                                                                                    |
| `blocks/_header-logo.liquid`   | The `logo_link` setting (schema entry and the `href` that reads it). The rest is stock Horizon.                                                                                                                                                                          |
| `sections/header-group.json`   | Only `logo_link: "https://biokea.ai/"` on the header logo block. Everything else is editor-owned.                                                                                                                                                                        |

The theme editor rewrites JSON templates whenever someone saves in it, so
the copies here go stale for every part that isn't ours. **Never push these
repo copies over the live theme.** Pull the live theme, re-apply our edits
to it, and push only the files you changed. This matters most for
`templates/index.json`: the home page is the template people edit most in
the editor. Make the hero-button edit on a fresh pull every time.

The repo copies are also not byte-identical to what Shopify stores, because
the pre-commit hook runs Prettier over JSON under `docs/`. Push from the
pulled theme directory, never from this folder.

## Procedure: pull → edit → check → push

Shopify CLI must be logged in to the store (`shopify theme list --store
a9zmvz-xs.myshopify.com` should list Horizon).

```bash
THEME=/path/to/scratch/horizon-theme   # any empty or throwaway directory

# 1. Pull the live theme fresh
shopify theme pull --store a9zmvz-xs.myshopify.com --live --path "$THEME"

# 2. Apply our edits (see the table above). page.order.json and
#    blocks/_header-logo.liquid can be copied over whole if unchanged upstream:
#      cp docs/shopify/theme/templates/page.order.json "$THEME/templates/"
#    For the editor-owned JSON files, edit only our keys in the pulled copy,
#    then compare with the repo copy:
#      git diff --no-index docs/shopify/theme/templates/index.json "$THEME/templates/index.json"

# 3. Theme check (must exit 0; the warnings in sections/header.liquid and
#    snippets/divider.liquid are stock Horizon and pre-existing)
shopify theme check --path "$THEME" --fail-level error

# 4. Push only the files you changed, one --only per file
shopify theme push --store a9zmvz-xs.myshopify.com --live --allow-live --path "$THEME" \
  --only templates/page.order.json \
  --only templates/product.quote.json \
  --only templates/index.json
```

Header-logo changes go the same way, with
`--only blocks/_header-logo.liquid --only sections/header-group.json`.

After a push, copy the pushed files back here so the repo matches what is
live (`cp "$THEME/templates/page.order.json" docs/shopify/theme/templates/`
and so on) and commit.

## Verify

```bash
curl -sL https://store.biokea.ai/pages/order | tr '\n' ' ' | grep -o 'widget/quote.js?v=1.3.0'
curl -sL https://store.biokea.ai/products/specimen-barcoding | tr '\n' ' ' | grep -o 'href="/pages/order?service=barcoding"'
curl -sL https://store.biokea.ai/ | tr '\n' ' ' | grep -o 'href="/pages/order"' | head -2
```

Each line should print its match. When the widget version changes, bump
`?v=` in `page.order.json`. The Worker ignores `?v=`; it only busts caches.
