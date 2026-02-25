export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncArena(env));
  },

  // Manual trigger for testing: GET /sync
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/sync') {
      ctx.waitUntil(syncArena(env));
      return new Response('sync triggered', { status: 200 });
    }
    return new Response('arena-sync worker', { status: 200 });
  }
};

async function syncArena(env) {
  console.log('[arena-sync] starting');
}
