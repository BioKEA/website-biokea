import type { APIRoute } from 'astro';
import { team } from '@/data/team';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ team }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
