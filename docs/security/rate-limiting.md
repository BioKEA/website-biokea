# Rate limiting `/api/contact`

Cloudflare's Rate Limiting Rules sit at the edge in front of the Worker, so they
drop abusive traffic before it consumes Worker CPU or Resend quota. Configure the
rule in the Cloudflare dashboard — it is not expressible in this repo.

## Why

`src/pages/api/contact.ts` accepts anonymous POSTs that fan out to the Resend API.
Without rate limiting, a script kiddie or a broken form integration can:

- drain Resend credit (~$0.001 per message but scales fast)
- flood `contact@biokea.ai` with spam
- exhaust the Worker's CPU budget

The Zod validation + honeypot + Turnstile (when enabled) are all _inside_ the
Worker. A rate limit outside the Worker is the missing layer.

## Recommended rule

**Dashboard path:** `Cloudflare dashboard → biokea.ai → Security → WAF → Rate
limiting rules → Create rule`.

```
Rule name:     contact-api-post
When incoming requests match:
  Field:       URI Path
  Operator:    equals
  Value:       /api/contact
  AND
  Field:       Request Method
  Operator:    equals
  Value:       POST
Then take action:
  Action:      Block
  Duration:    10 minutes
  Response:    Custom response
    Status:    429
    Body:      {"ok":false,"error":"Too many requests — please try again in a few minutes."}
    Content-Type: application/json
Characteristics (what counts against the limit):
  - IP
Requests per period:
  Count:       5
  Period:      1 minute
```

## Characteristics trade-offs

- **IP only** (recommended). Simple, works immediately, handles most abuse. Under
  shared NAT a handful of legitimate senders could share an IP; 5/min is high
  enough to absorb that.
- **IP + User-Agent**. Adds a slight bot-fingerprint signal. Bots rotate UAs so
  the uplift is small; skip.
- **JA3 / JA4 fingerprint** (Pro plan+). Strong against botnets but requires a
  paid plan. Consider if the free-tier rule proves insufficient.

## Verifying the rule works

```bash
# Fire 10 posts from the same IP; the 6th+ should 429.
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://biokea.ai/api/contact \
    -F name=test -F email=t@example.com -F topic=Funding -F message=hi
done
```

Expected: five `400`s (Zod/Turnstile rejection — that's fine, it means the
request made it to the Worker), then `429`s.

## Monitoring

- Cloudflare → **Security → Events** shows each rate-limit block with client IP,
  country, and path.
- Cloudflare → **Analytics → Security** tracks the daily block volume.
- If the rule starts blocking legitimate users, loosen `Requests per period` or
  increase the window before relaxing the block action.

## When to reconsider

- If legitimate submission volume exceeds ~30/hour, bump the limit.
- If spam still gets through despite Turnstile, tighten to 3/min or add a
  geo-based rule for high-abuse regions.
- If the form grows additional endpoints (e.g., a newsletter signup), add a
  separate rule per endpoint rather than a broad `/api/*` catch-all — catch-alls
  trip test-tooling and monitoring probes.

# Rate limiting `/api/subscribe`

`/api/subscribe` deliberately does **not** require a Turnstile token: the
in-game email opt-in (each game's `BiokeaLeaderboardPrompt`, posting from
games.biokea.ai) has no captcha widget, and we chose not to embed one in six
game bundles. It still verifies a token when one is sent (the `/subscribe`
page), and keeps the honeypot and the unique-email constraint (one welcome
email per address, ever). The edge rate limit is therefore the _only_ bulk
defence for this endpoint, so treat this rule as required, not optional.

What abuse costs without it: junk `subscribers` rows and one unsolicited
welcome email per unique address from `notifications@biokea.ai` — which is
sender-reputation damage on the same domain the quote and contact mail use.

## Configured rule (as of 2026-08-16)

Cloudflare's **Free plan allows one rate-limiting rule per zone, a 10-second
counting period, and a 10-second mitigation timeout** — the 5/min + 10-min
block described above for `/api/contact` needs Pro. So one combined rule
covers both endpoints:

```
When incoming requests match:
  URI Path is in {/api/contact, /api/subscribe}
  AND Request Method equals POST
Characteristics:  IP
Requests per period:  3 per 10 seconds
Action:  Block for 10 seconds (429)
```

What that buys and what it doesn't:

- Humans never notice — one score-post modal or one form submit is one
  request; three in ten seconds from one IP is already unusual.
- The block is shared across both paths (a burst on subscribe also blocks
  contact from that IP for 10 s), which is fine.
- Against a sustained single-IP script the ceiling is ~3 requests per ~20 s
  (≈13k/day) — much looser than a 10-minute block would give. The honeypot
  and the unique-email constraint (one welcome per address, ever) bound the
  damage to at most one email per _distinct_ address the script supplies.
  If Security → Events ever shows this rule firing repeatedly from the same
  IPs, that's the signal to move to Pro for a longer mitigation timeout, or
  to revisit embedding Turnstile in the games.

## Verifying the rule works

```bash
# Invalid email → the Worker answers 400 without writing anything, so this
# probe is safe to repeat. With the 3-per-10 s rule the 4th request should 429
# (verified 2026-08-16: 400 400 400 429 429).
for i in $(seq 1 5); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST https://biokea.ai/api/subscribe \
    -H "Origin: https://biokea.ai" \
    --data "email=not-an-email&source=codon2048&consent=true"
done
```
