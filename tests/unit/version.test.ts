import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '@/data/version';

describe('APP_VERSION', () => {
  it('matches package.json, so the widget cache-buster tracks releases', () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'),
    ) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });
});
