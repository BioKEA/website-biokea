// Serialize a value for inline <script type="application/ld+json"> blocks.
// JSON.stringify alone is not safe for HTML embedding: it doesn't escape
// "</script>" sequences (which would break out of the script tag) nor the
// Unicode line separators U+2028 / U+2029 (which historically terminated
// JavaScript strings before ES2019 and still trip some parsers).
export function stringifyJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
