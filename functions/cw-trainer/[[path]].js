import { onRequest as handoff } from '../cw-trainer-handoff.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.pathname === '/cw-trainer/sw.js') {
    const asset = await context.env.ASSETS.fetch(new URL('/cw-trainer-killswitch.js', url));
    return new Response(asset.body, {
      status: 200,
      headers: {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-cache'
      }
    });
  }
  if (url.pathname === '/cw-trainer/move' || url.pathname === '/cw-trainer/move/') {
    const asset = await context.env.ASSETS.fetch(new URL('/cw-trainer/move/index.html', url));
    return new Response(asset.body, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }
    });
  }
  return handoff(context);
}
