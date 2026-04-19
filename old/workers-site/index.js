import { getAssetFromKV } from '@cloudflare/kv-asset-handler'

async function handleEvent(event) {
  try {
    // Get the asset from KV
    let options = {}
    const page = await getAssetFromKV(event, options)

    // Allow headers to be altered
    const response = new Response(page.body, page)

    response.headers.set('X-XSS-Protection', '1; mode=block')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('Feature-Policy', 'none')

    return response
  } catch (e) {
    // Fall back to serving `/index.html` on errors
    return new Response(`"${e.message}"`, {
      status: 500,
    })
  }
}

addEventListener('fetch', (event) => {
  event.respondWith(handleEvent(event))
}) 