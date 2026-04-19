import { describe, it, expect } from 'vitest';
import { stringifyJsonLd } from '@/lib/json-ld';

describe('stringifyJsonLd', () => {
  it('escapes "</script>" sequences so they cannot break out of an inline script tag', () => {
    const out = stringifyJsonLd({ description: 'hello </script><script>alert(1)</script>' });
    // The literal closing-script sequence must not appear; escaping "<" is
    // sufficient to neutralize it.
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c/script>');
  });

  it('escapes lone "<" so HTML parsers cannot misread the script body', () => {
    const out = stringifyJsonLd({ note: '<tag>' });
    expect(out).not.toContain('<tag>');
    expect(out).toContain('\\u003ctag>');
  });

  it('escapes U+2028 and U+2029 line separators', () => {
    const out = stringifyJsonLd({ note: 'a\u2028b\u2029c' });
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
  });

  it('still round-trips to the original value via JSON.parse', () => {
    const original = { a: 1, b: 'hello', c: ['one', 'two'], d: { e: true } };
    const out = stringifyJsonLd(original);
    expect(JSON.parse(out)).toEqual(original);
  });

  it('produces valid JSON', () => {
    const out = stringifyJsonLd({ '@context': 'https://schema.org', '@type': 'Thing' });
    expect(() => JSON.parse(out)).not.toThrow();
  });
});
