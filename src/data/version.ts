// src/data/version.ts
//
// The widget bundle is cache-busted with ?v=<APP_VERSION> (the plan's
// declared deviation from a content-hash manifest), so this must track
// package.json's version — tests/unit/version.test.ts asserts it does.
// Bump both whenever the widget changes.
export const APP_VERSION = '1.0.0';
