/* HamShackTech CW Trainer -- the standard Copy tool layout's behaviour
   ====================================================================
   Goes with hst-copy.css (ICR, Code Groups, Call Signs; Tim, 2026-11-04;
   and the Send tools, Keyer and QSO Practice, 2026-11-05).

   - The Settings drawer (#clDrawer): opened by any [data-cl-open] button,
     closed by [data-cl-close], the scrim, or Escape. While it's open the
     page behind it is inert. On phones it's a sheet from the bottom, and
     the first time it opens only its first section is open.
   - The settings chips (#clQuickItems) under Start: the page sets
     HSTCopy.summary = function () { return ['Letters A–Z', '20 WPM', ...]; }
     and the chips follow it -- after any change in the drawer, and once a
     second (settings also change from other tabs and course links).
*/
(function () {
  'use strict';
  var d = document;
  var api = window.HSTCopy = window.HSTCopy || {};
  var drawer, scrim, page, lastFocus = null, firstOpen = true, lastQuick = '';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function isOpen() { return !!drawer && drawer.classList.contains('open'); }

  function open() {
    if (!drawer || isOpen()) return;
    lastFocus = d.activeElement;
    if (firstOpen && window.matchMedia('(max-width: 640px)').matches) {
      // Phones: open the first section, fold the rest so the sheet stays short.
      Array.prototype.forEach.call(drawer.querySelectorAll('details.cl-sec'), function (s, i) { s.open = i === 0; });
    }
    firstOpen = false;
    scrim.hidden = false;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    if (page) page.inert = true;
    var x = drawer.querySelector('.cl-x');
    if (x) setTimeout(function () { x.focus(); }, 30);
    if (typeof api.onOpen === 'function') api.onOpen();
  }

  function close() {
    if (!isOpen()) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    scrim.hidden = true;
    if (page) page.inert = false;
    refresh();
    if (typeof api.onClose === 'function') api.onClose();
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  function refresh() {
    var box = d.getElementById('clQuickItems');
    if (!box || typeof api.summary !== 'function') return;
    var items = [];
    try { items = (api.summary() || []).filter(Boolean); } catch (e) { return; }
    // An item is a string, or { t: 'Vail · Paddles B', key: true } for the
    // key chip the Send tools show (a brighter border).
    var html = items.map(function (t) {
      return typeof t === 'object' ? '<span class="cl-q' + (t.key ? ' cl-q-key' : '') + '">' + esc(t.t) + '</span>'
                                   : '<span class="cl-q">' + esc(t) + '</span>';
    }).join('');
    if (html !== lastQuick) { box.innerHTML = html; lastQuick = html; }
  }

  function init() {
    drawer = d.getElementById('clDrawer');
    scrim = d.getElementById('clScrim');
    page = d.querySelector('body.cl > .wrap');
    if (!drawer || !scrim) return;
    drawer.setAttribute('aria-hidden', 'true');
    d.addEventListener('click', function (e) {
      setTimeout(refresh, 0);   // a mode chip or a toggle may change what the chips say
      var t = e.target.closest ? e.target.closest('[data-cl-open], [data-cl-close]') : null;
      if (!t) return;
      if (t.hasAttribute('data-cl-open')) open(); else close();
    });
    scrim.addEventListener('click', close);
    // Escape closes the drawer before the page's own keys see it.
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    }, true);
    drawer.addEventListener('input', refresh);
    drawer.addEventListener('change', refresh);
    setInterval(refresh, 1000);
    refresh();
  }

  /* Popups (the Send tools, 2026-11-05): a button with
     data-cl-dialog="infoDialog" opens that <dialog>; a [data-cl-dialog-close]
     button inside it, or a click on its backdrop, closes it. */
  d.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-cl-dialog], [data-cl-dialog-close]') : null;
    if (t && t.hasAttribute('data-cl-dialog')) {
      var dlg = d.getElementById(t.getAttribute('data-cl-dialog'));
      if (dlg && !t.disabled && !dlg.open) dlg.showModal();
    } else if (t) {
      var up = t.closest('dialog'); if (up) up.close();
    } else if (e.target.tagName === 'DIALOG' && e.target.classList.contains('cl-dlg')) {
      e.target.close();                  // the backdrop
    }
  });

  /* The Practice Timer popup:
       HSTCopy.timer({ dialog, getMin: fn, setMin: fn(minutes; 0 = off) })
     The dialog holds [data-min] presets, an <input data-timer-input>, and
     [data-timer-set] / [data-timer-off] buttons. */
  api.timer = function (o) {
    var dlg = o.dialog, input = dlg.querySelector('[data-timer-input]');
    function done(min) { o.setMin(min); dlg.close(); }
    function mark() {
      var m = o.getMin();
      Array.prototype.forEach.call(dlg.querySelectorAll('[data-min]'), function (b) { b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-min')) === m)); });
      input.value = m || '';
    }
    function typed() {
      var min = Math.round(Number(input.value));
      if (!(min >= 1 && min <= 180)) { input.focus(); input.select(); return; }
      done(min);
    }
    dlg.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-min')) done(Number(b.getAttribute('data-min')));
      else if (b.hasAttribute('data-timer-set')) typed();
      else if (b.hasAttribute('data-timer-off')) done(0);
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); typed(); } });
    // Mark the current choice whenever it opens.
    new MutationObserver(function () { if (dlg.open) mark(); }).observe(dlg, { attributes: true, attributeFilter: ['open'] });
  };

  api.open = open;
  api.close = close;
  api.isOpen = isOpen;
  api.refresh = refresh;
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
