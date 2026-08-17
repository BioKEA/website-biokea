# Local dev container — not used for the Cloudflare Worker deploy,
# which builds via wrangler/CI directly. This just runs `astro dev`
# in an isolated Node environment so nobody needs Node installed locally.
# Debian-based, not alpine: workerd (Cloudflare's Workers runtime, used by
# the Astro Cloudflare adapter's platform proxy) only ships glibc binaries
# and silently fails to bind under Alpine's musl libc.
FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 4321

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
