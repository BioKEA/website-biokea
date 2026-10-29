# Order page rollout (one-off; delete after rollout)

## When

The whole order-configurator rollout runs in this order:

1. **Sean applies `migrations/0009_quote_config.sql`** in the Supabase SQL
   Editor. Then confirm the status check took:

   ```sql
   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.quotes'::regclass and contype='c';
   ```

   One check constraint should list `'consult'` among the statuses. If none
   does, the live constraint had a different name and the old check is still
   in force: drop it by the name the query shows and re-run the migration's
   `add constraint`. Without this, every consult quote insert fails with a 502.

2. **This document**: the Order page, product descriptions, theme push and
   menu (sections 1 to 4 below).
3. **Merge to `main` and deploy the site**, then run section 5 and the
   end-to-end store check.

Why the theme goes first: The Worker serves `/widget/*` regardless of `?v=`, so a theme pushed before the site deploy works at once (it loads the current widget until the deploy swaps in 1.3.0); a site deploy before the Order page exists leaves the pricing page's "Configure and pay online" links pointing at a live 404.

The store owner confirms first. Then run these in order: page, product
descriptions, push, menu, verify. `$THEME` is the pulled-and-edited theme directory (see
[README.md](./README.md)). Push from that directory, not from this repo folder.

## 1. Create the Order page

The page must exist before `/pages/order` resolves. The template file can
come second, because the page falls back to `page.json` until
`page.order.json` is live.

**Admin GraphQL** (Shopify connector or the store's custom app):

```graphql
mutation CreatePage($page: PageCreateInput!) {
  pageCreate(page: $page) {
    page {
      id
      title
      handle
      templateSuffix
      isPublished
    }
    userErrors {
      code
      field
      message
    }
  }
}
```

```json
{
  "page": {
    "title": "Order",
    "handle": "order",
    "body": "",
    "isPublished": true,
    "templateSuffix": "order"
  }
}
```

**Admin UI instead:** Online Store → Pages → Add page → Title "Order",
leave the content empty, Visibility **Visible** → Save. Then, in the
**Theme template** box, pick `order`. That option appears only after the
push in step 3, so if it isn't listed yet, save now and come back after the
push. Check that the URL handle is `order`.

## 2. Update the two service product descriptions

Their last sentence still points at an inline widget ("…below…"). Replace only
that final sentence; leave the rest of each description as it is.

| Product handle       | Old final sentence                                      | New final sentence                                             |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `specimen-barcoding` | Configure your count below for an instant quote.        | Configure your project on our Order page for an instant quote. |
| `edna-metabarcoding` | Configure your sample count below for an instant quote. | Configure your project on our Order page for an instant quote. |

Use the Shopify connector's `update-product` tool (`id` = the product GID from `get-product`; set `descriptionHtml` to
the full `<p>…</p>` with the new last sentence), or in the admin go to Products → open the
product → Description → edit the last sentence → Save.

## 3. Push the three templates

```bash
shopify theme check --path "$THEME" --fail-level error
shopify theme push --store a9zmvz-xs.myshopify.com --live --allow-live --path "$THEME" \
  --only templates/page.order.json \
  --only templates/product.quote.json \
  --only templates/index.json
```

If anyone has saved the home page in the theme editor since `$THEME` was
pulled, pull again and redo the `button_H9gpTf` edit before pushing
`templates/index.json`.

## 4. Main menu: add "Order" first

**Admin UI:** Online Store → Navigation → **Main menu** → Add menu item →
Name "Order", Link: search "Order" and pick the page (or type
`/pages/order`) → Add → drag it to the **top** → Save menu.

**Admin GraphQL (`menuUpdate`):** this call **replaces the whole item
list**, so read the menu first and send every existing item back, with
their `id`s, after the new one:

```graphql
query MainMenu {
  # `menus` can't filter by handle; pick the node whose handle is "main-menu"
  menus(first: 25) {
    nodes {
      id
      handle
      title
      items {
        id
        title
        type
        url
        resourceId
        tags
        items {
          id
          title
          type
          url
          resourceId
          tags
        }
      }
    }
  }
}
```

```graphql
mutation UpdateMenu($id: ID!, $title: String!, $handle: String!, $items: [MenuItemUpdateInput!]!) {
  menuUpdate(id: $id, title: $title, handle: $handle, items: $items) {
    menu {
      id
      items {
        id
        title
        url
      }
    }
    userErrors {
      code
      field
      message
    }
  }
}
```

Variables: the `id`, `title` and `handle` exactly as read (you can't change
the default menu's handle), and `items` set to the new item followed by
every existing item as read (nested `items` included):

```json
{
  "id": "gid://shopify/Menu/<from query>",
  "title": "<from query>",
  "handle": "main-menu",
  "items": [
    {
      "title": "Order",
      "type": "PAGE",
      "resourceId": "gid://shopify/Page/<id from step 1>",
      "items": []
    }
  ]
}
```

## 5. Verify live

```bash
curl -sL https://store.biokea.ai/pages/order | tr '\n' ' ' | grep -o 'widget/quote.js?v=1.3.0'
curl -sL https://store.biokea.ai/products/specimen-barcoding | tr '\n' ' ' | grep -o 'href="/pages/order?service=barcoding"'
curl -sL https://store.biokea.ai/ | tr '\n' ' ' | grep -o 'href="/pages/order"' | head -2
```

Each line should print its match. The last one should show two: the menu item
and the hero button.

Afterwards, copy the pushed files from `$THEME` back into `docs/shopify/theme/`
if they changed. Delete this file once the site deploy (step 3 of "When") is
live and verified.
