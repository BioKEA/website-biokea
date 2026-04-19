import type { APIRoute } from 'astro';
import { projects } from '@/data/projects';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ projects }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
