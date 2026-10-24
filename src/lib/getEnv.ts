/**
 * Unified helper to retrieve Cloudflare environment bindings
 * (D1, KV, Variables) across Astro SSR, Cloudflare Workers, and local dev.
 */
export async function getCloudflareEnv(locals?: any): Promise<Record<string, any>> {
  try {
    const cf = await import('cloudflare:workers');
    if (cf?.env) {
      return cf.env;
    }
  } catch (e) {
    // Non-workers fallback
  }

  if (locals?.cfContext?.env) {
    return locals.cfContext.env;
  }

  return (globalThis as any).process?.env || {};
}
