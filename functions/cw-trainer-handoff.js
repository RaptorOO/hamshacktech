/* Serves the CW Trainer hand-off page. Assets (a file name with an extension)
   pass through to the static files. People are not 301'd. The crawler 301 is
   a Cloudflare Single Redirect, documented in the review README, and is not
   created here. */
const DEST = {
  '': 'https://morsecodeone.com/',
  home: 'https://morsecodeone.com/home/',
  icr: 'https://morsecodeone.com/icr/',
  'code-groups': 'https://morsecodeone.com/code-groups/',
  'call-signs': 'https://morsecodeone.com/call-signs/',
  keyer: 'https://morsecodeone.com/keyer/',
  qso: 'https://morsecodeone.com/qso/',
  course: 'https://morsecodeone.com/course/',
  'test-prep': 'https://morsecodeone.com/test-prep/',
  jeopardy: 'https://morsecodeone.com/jeopardy/',
  progress: 'https://morsecodeone.com/progress/'
};

function matching(pathname) {
  var rest = pathname.replace(/^\/cw-trainer\/?/, '').replace(/\/index\.html$/, '').replace(/\/$/, '');
  if (!rest) return DEST[''];
  if (DEST[rest]) return DEST[rest];
  var first = rest.split('/')[0];
  if (DEST[first] && rest === first) return DEST[first];
  return 'https://morsecodeone.com/' + rest;
}

function page(dest) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>CW Trainer has moved</title>' +
    '<link rel="canonical" href="' + dest + '">' +
    '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#100e0c;color:#fafaf9;font:18px/1.45 Inter,system-ui,sans-serif;text-align:center;padding:24px}img{width:72px;height:72px}p{max-width:28rem}</style>' +
    '</head><body><div><img src="/cw-trainer/icons/apple-touch-icon.png" alt="Morse Code One" width="72" height="72">' +
    '<p>CW Trainer has moved to Morse Code One. Bringing your progress with you…</p></div>' +
    '<script src="/cw-trainer/shared/hst-move.js"></script><script>var DEST=' + JSON.stringify(dest) + ';' +
    'var MARK="hct-cw-moved-to-morse-code-one";' +
    'function go(base){location.replace(base+location.search+location.hash);}' +
    'function send(packed){try{localStorage.setItem(MARK,"moved on "+new Date().toISOString());}catch(e){}' +
    'location.replace("https://morsecodeone.com/import/"+location.search+"#"+packed);}' +
    'var marked=false;try{marked=!!localStorage.getItem(MARK);}catch(e){}' +
    'if(marked){go(DEST);}' +
    'else if(window.HSTMove&&HSTMove.hasSavedProgress){HSTMove.hasSavedProgress().then(function(yes){' +
    'if(!yes){go(DEST);return;}' +
    'return HSTMove.collect().then(HSTMove.pack).then(function(packed){' +
    'if(!packed||packed.plain||packed.text.length>HSTMove.maxLink)return;' +
    'send(packed.text);});' +
    '}).catch(function(){});}' +
    '</script></body></html>';
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return context.env.ASSETS.fetch(context.request);
  return new Response(page(matching(url.pathname)), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}
