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

function esc(s) {
  return String(s).replace(/[&"<>]/g, function (c) {
    return { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c];
  });
}

function page(dest) {
  var safe = esc(dest);
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>CW Trainer has moved</title>' +
    '<link rel="canonical" href="' + safe + '">' +
    '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#100e0c;color:#fafaf9;font:18px/1.45 Inter,system-ui,sans-serif;text-align:center;padding:24px}img{width:72px;height:72px}p{max-width:28rem}a{color:#fafaf9}button{font:inherit;margin-top:12px}</style>' +
    '</head><body><div>' +
    '<img src="/cw-trainer-moved/alien.png" alt="Morse Code One" width="72" height="72">' +
    '<p role="status" id="status">CW Trainer has moved to Morse Code One. Bringing your progress with you…</p>' +
    '<p><a href="' + safe + '">Go to Morse Code One →</a></p>' +
    '<p><button type="button" id="saveFile" hidden>Save my progress as a file</button></p>' +
    '</div>' +
    '<script src="/cw-trainer/shared/hst-move.js"></script><script>' +
    'var DEST=' + JSON.stringify(dest) + ';' +
    'var MARK="hct-cw-moved-to-morse-code-one";' +
    'var statusEl=document.getElementById("status");' +
    'var saveBtn=document.getElementById("saveFile");' +
    'function go(base){location.replace(base+location.search+location.hash);}' +
    'function send(packed){try{localStorage.setItem(MARK,"moved on "+new Date().toISOString());}catch(e){}' +
    'location.replace("https://morsecodeone.com/import/"+location.search+"#"+packed);}' +
    'function download(text){var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"text/plain"}));a.download="morse-code-one-progress.txt";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},4000);}' +
    'function stuck(){statusEl.textContent="We couldn\'t bring your progress automatically.";}' +
    'function tooBig(text){statusEl.textContent="Your progress is too big to move automatically. Save it as a file, then open it on Morse Code One.";saveBtn.hidden=false;saveBtn.onclick=function(){if(text)download(text);};}' +
    'var marked=false;try{marked=!!localStorage.getItem(MARK);}catch(e){}' +
    'if(marked){go(DEST);}' +
    'else if(!window.HSTMove||!HSTMove.hasSavedProgress){stuck();}' +
    'else{var bundle;HSTMove.hasSavedProgress().then(function(yes){' +
    'if(!yes){go(DEST);return null;}' +
    'return HSTMove.collect();}).then(function(obj){' +
    'if(!obj)return null;bundle=obj;return HSTMove.pack(obj);}).then(function(packed){' +
    'if(!packed)return;' +
    'if(packed.plain||packed.text.length>HSTMove.maxLink){tooBig(packed.text);return;}' +
    'send(packed.text);}).catch(function(err){' +
    'if(err&&err.message==="too-big"){var text="";try{text=JSON.stringify(bundle);}catch(e){}tooBig(text);return;}' +
    'stuck();});}' +
    '</script></body></html>';
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return context.env.ASSETS.fetch(context.request);
  return new Response(page(matching(url.pathname)), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}
