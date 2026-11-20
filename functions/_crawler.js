/* Free-plan crawler check for /cw-trainer.
   cf.client.bot is not allowed on this zone. Use botManagement.verifiedBot
   when Cloudflare sends it, and otherwise the user-agent list below.
   A spoofed user agent only gets a 301 to the same page on Morse Code One,
   which is harmless. */
const CRAWLERS = [
  'googlebot',
  'google-inspectiontool',
  'storebot-google',
  'bingbot',
  'duckduckbot',
  'applebot',
  'yandexbot',
  'baiduspider'
];

const PRODUCTION_HOSTS = new Set(['hamshacktech.com', 'www.hamshacktech.com']);

export function isSearchCrawler(request) {
  if (request.cf?.botManagement?.verifiedBot === true) return true;
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  return CRAWLERS.some((name) => ua.includes(name));
}

export function crawlerRedirect(request) {
  const url = new URL(request.url);
  if (!PRODUCTION_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (url.pathname === '/cw-trainer/sw.js') return null;
  if (url.pathname !== '/cw-trainer' && !url.pathname.startsWith('/cw-trainer/')) return null;
  if (!isSearchCrawler(request)) return null;
  // Same path without /cw-trainer, query string kept (?tab=icr opens ICR).
  // Bare /cw-trainer maps to "/" so the Location is never "…com?tab=…".
  // The move page has no twin on Morse Code One; its "bring your practice
  // records" page is /import/ (one hop instead of /move/ -> /import/).
  let rest = url.pathname.slice('/cw-trainer'.length) || '/';
  if (rest === '/move' || rest === '/move/') rest = '/import/';
  return new Response(null, {
    status: 301,
    headers: {
      location: 'https://morsecodeone.com' + rest + url.search,
      'cache-control': 'no-store',
      vary: 'User-Agent'
    }
  });
}
