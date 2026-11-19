import { onRequest as handoff } from './cw-trainer-handoff.js';
import { crawlerRedirect } from './_crawler.js';

export async function onRequest(context) {
  const redirect = crawlerRedirect(context.request);
  if (redirect) return redirect;
  return handoff(context);
}
