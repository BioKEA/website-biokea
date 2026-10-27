// src/lib/pricing/format.ts
//
// One dollar formatter for pages. The widget (src/widget/template.ts) and
// the quote API each carry their own copy because the widget bundle must
// stay self-contained; pages import this one.
export const usd = (n: number): string => '$' + n.toLocaleString('en-US');
