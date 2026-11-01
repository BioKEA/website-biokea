import { test, expect } from '@playwright/test';
import { serviceChoices, type ServiceSlug } from '@/data/configurator';

// The store shows each service's price range from a product metafield
// (`biokea.price_range`), because a Shopify product holds only one price.
// That text is typed into Shopify by hand, so this checks the live store
// against the rate card. It hits production, so it only runs on request:
//   STORE_CHECK=1 npx playwright test tests/e2e/store-prices.spec.ts
const STORE = 'https://store.biokea.ai';
const HANDLES: Record<ServiceSlug, string> = {
  barcoding: 'specimen-barcoding',
  metabarcoding: 'edna-metabarcoding',
  metagenomics: 'metagenome-sequencing',
  'targeted-edna': 'targeted-edna',
};

test.skip(!process.env.STORE_CHECK, 'set STORE_CHECK=1 to check the live store');

for (const s of serviceChoices) {
  test(`store price range for ${s.slug} matches the rate card`, async ({ request }) => {
    const res = await request.get(`${STORE}/products/${HANDLES[s.slug]}`);
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain(s.priceLine);
  });
}

test('the home page lists every service with its range', async ({ request }) => {
  const html = await (await request.get(STORE)).text();
  for (const s of serviceChoices) {
    expect(html).toContain(`/products/${HANDLES[s.slug]}`);
    expect(html).toContain(s.priceLine);
  }
});
