# Rate limiting `/api/contact`

Cloudflare's Rate Limiting Rules sit at the edge in front of the Worker, so they
drop abusive traffic before it consumes Worker CPU or Resend quota. Configure the
rule in the Cloudflare dashboard — it is not expressible in this repo.

## Why

`src/pages/api/contact.ts` accepts anonymous POSTs that fan out to the Resend API.
Without rate limiting, a script kiddie or a broken form integration can:

- drain Resend credit (~$0.001 per message but scales fast)
- flood `team@biokea.ai` with spam
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
