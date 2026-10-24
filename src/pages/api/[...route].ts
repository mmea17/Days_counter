import type { APIRoute } from 'astro';
import { app } from '../../api';
import { getCloudflareEnv } from '../../lib/getEnv';

export const prerender = false;

export const ALL: APIRoute = async (context) => {
  const env = await getCloudflareEnv(context.locals);
  return app.fetch(context.request, env);
};
