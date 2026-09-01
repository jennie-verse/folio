/* preview.js — the sandbox host for HTML documents (vault engine, plan 6-4).

   Every HTML document — Read or Run — is rendered inside preview-host.html,
   which carries its own far stricter CSP (connect-src 'none', form-action
   'none'). preview-host then puts the document in a second, nested iframe.

   The same-origin sandbox token is never granted, for any reason. Combined
   with allow-scripts it would dissolve the sandbox and let a stored document
   read folio's IndexedDB — and in folio that means every PDF, photo and note,
   not just one HTML file. */

const PROTOCOL = 'folio-preview-v1';

/* These are the OUTER host frame's tokens. preview-host.html needs
   allow-scripts to run its own eight-line bootstrap; the document itself goes
   into a second, nested iframe whose sandbox is chosen by the host from
   `innerSandbox` (see below) — in plain Read mode that inner frame has no
   allow-scripts at all; in Run mode it has the full set. A nested iframe can
   never hold a capability its parent lacks, so the outer list is the ceiling
   and stays as narrow as each mode needs. */
export const SANDBOX_RUN = 'allow-scripts allow-modals allow-forms allow-downloads allow-popups';
export const SANDBOX_READ = 'allow-scripts allow-downloads';

/* The INNER frame's sandbox — the one actually holding the document. Run
   gets the full set; plain Read gets nothing (today's default for a document
   whose HTML failed the instrumented path for any reason); instrumented Read
   gets allow-scripts ONLY, for one purpose — running folio's own scroll/zoom
   messenger (instrument(), below), never the document's own code. That is
   safe specifically because DOMPurify's WHOLE_DOCUMENT sanitize forbids the
   `script` tag outright (handlers/html.js's PURIFY_DOCUMENT), so nothing of
   the original document survives to run even though the frame now can. */
export const INNER_SANDBOX_RUN = SANDBOX_RUN;
export const INNER_SANDBOX_READ_PLAIN = 'allow-downloads';
export const INNER_SANDBOX_READ_SCRIPTED = 'allow-scripts allow-downloads';

/* An opaque origin makes window.localStorage THROW SecurityError, which kills
   a document's script on its first line and leaves every button in it dead.
   Memory-backed storage keeps those documents running; the data is
   per-session by design and never reaches folio's own storage. */
export const STORAGE_SHIM = '<scr' + 'ipt>(function(){function mk(){var m=Object.create(null);var api={getItem:function(k){k=String(k);return (k in m)?m[k]:null},setItem:function(k,v){m[String(k)]=String(v)},removeItem:function(k){delete m[String(k)]},clear:function(){m=Object.create(null)},key:function(i){var ks=Object.keys(m);return i<ks.length?ks[i]:null}};try{Object.defineProperty(api,"length",{get:function(){return Object.keys(m).length}})}catch(e){}return api}function works(n){try{var st=window[n];if(!st)return false;st.setItem("__folio","1");st.removeItem("__folio");return true}catch(e){return false}}["localStorage","sessionStorage"].forEach(function(n){if(works(n))return;var v=mk();try{Object.defineProperty(window,n,{configurable:true,get:function(){return v}})}catch(e){try{window[n]=v}catch(x){}}});try{document.cookie}catch(e){try{var ck="";Object.defineProperty(document,"cookie",{configurable:true,get:function(){return ck},set:function(x){ck=ck?ck+"; "+x:String(x)}})}catch(x){}}try{var rq=window.indexedDB.open("__folio_probe");rq.onsuccess=function(){try{rq.result.close();window.indexedDB.deleteDatabase("__folio_probe")}catch(e){}}}catch(e){try{Object.defineProperty(window,"indexedDB",{configurable:true,get:function(){return undefined}})}catch(x){}}})();<\/scr' + 'ipt>';

/* Diagnostics: scroll position, runtime errors, link taps. Injected at the top
   of <head> so it also catches failures thrown by the document's own head
   scripts — appending it at </body> misses those entirely. */
export function instrument(session) {
  return '<scr' + 'ipt>(function(){var S=' + JSON.stringify(session) + ';function p(t,d){try{parent.postMessage(Object.assign({__folioPreview:1,session:S,type:t},d||{}),"*")}catch(e){}}function s(){p("scroll",{y:(window.scrollY||document.documentElement.scrollTop||0)})}window.addEventListener("error",function(e){p("runtime-error",{message:e.message||"Preview runtime error"})},true);window.addEventListener("unhandledrejection",function(e){var v=e.reason;p("runtime-error",{message:v&&v.message||String(v||"Unhandled promise rejection")})});var r;window.addEventListener("scroll",function(){if(r)cancelAnimationFrame(r);r=requestAnimationFrame(s)},{passive:true});window.addEventListener("message",function(e){var d=e.data;if(!d||d.__folioPreview!==1||d.session!==S)return;if(d.type==="restore"){try{window.scrollTo(0,d.y||0)}catch(x){}}else if(d.type==="zoom"){try{document.documentElement.style.zoom=String(d.ratio||1)}catch(x){}}});document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;var raw=a.getAttribute("href")||"";var inPkg=a.getAttribute("data-folio-path");if(inPkg){e.preventDefault();p("open-asset",{path:inPkg});return}if(raw.charAt(0)==="#"){e.preventDefault();var f=raw.slice(1),id=f;try{id=decodeURIComponent(f)}catch(x){}var target=id?document.getElementById(id):document.documentElement;if(!target&&id){var named=document.getElementsByName(id);target=named&&named[0]}if(target){try{target.scrollIntoView({block:"start"})}catch(x){target.scrollIntoView()}s()}return}if(a.hasAttribute("download"))return;var u=a.href||raw,pcol=(a.protocol||"").toLowerCase();if(pcol==="http:"||pcol==="https:"||pcol==="mailto:"||pcol==="tel:"||pcol==="sms:"){e.preventDefault();p("open",{url:u})}else if(/^javascript:/i.test(raw)){e.preventDefault();p("runtime-error",{message:"javascript: links are blocked"})}},true);function rdy(){p("ready")}if(document.readyState==="complete")rdy();else window.addEventListener("load",rdy);})();<\/scr' + 'ipt>';
}

/** Insert at the very top of <head> so shims run before any document script. */
export function injectHead(html, fragment) {
  let match = /<head\b[^>]*>/i.exec(html);
  if (match) return html.slice(0, match.index + match[0].length) + fragment + html.slice(match.index + match[0].length);
  match = /<html\b[^>]*>/i.exec(html);
  if (match) return html.slice(0, match.index + match[0].length) + fragment + html.slice(match.index + match[0].length);
  match = /<!doctype[^>]*>/i.exec(html);
  if (match) return html.slice(0, match.index + match[0].length) + fragment + html.slice(match.index + match[0].length);
  return fragment + html;
}

/** Without a viewport meta, iOS lays a document out at 980px and renders it
    shrunken. Full documents used to pass through untouched (vault fix). */
export function ensureViewport(html) {
  if (/<meta[^>]+name\s*=\s*["']?\s*viewport/i.test(html)) return html;
  return injectHead(html, '<meta name="viewport" content="width=device-width,initial-scale=1">');
}

export function newSession() {
  return `${Date.now().toString(36)}_${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

/**
 * Mount a document in the sandbox.
 *
 * `options.session` is not optional in practice: `instrument()` and the
 * package shim are baked into the HTML with a session id, and preview-host
 * relays a message from the document only when its id matches the one this
 * mount announced. Minting a second id here instead of reusing the one the
 * HTML was built with drops every message the document sends — link taps,
 * scroll reports, runtime errors, `ready` — with no error anywhere. That is
 * what killed every package link in build 2026.08.12-pkglink4. A mount whose
 * HTML carries no instrumentation may leave it out.
 *
 * @param {HTMLElement} container element the iframe is appended to
 * @param {object} options {html, session, allowScripts, innerSandbox, title, restoreY, onIssue, onScroll, onOpen, onOpenAsset}
 * @returns {{destroy:Function, frame:HTMLIFrameElement, session:string, setZoom:Function}}
 */
export function mount(container, options) {
  const session = options.session || newSession();
  const frame = document.createElement('iframe');
  frame.className = 'frame';
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('sandbox', options.allowScripts ? SANDBOX_RUN : SANDBOX_READ);
  frame.title = options.title || 'Document preview';

  const innerSandbox = options.innerSandbox || (options.allowScripts ? INNER_SANDBOX_RUN : INNER_SANDBOX_READ_PLAIN);
  const payload = {
    protocol: PROTOCOL, type: 'render', session,
    html: options.html, allowScripts: Boolean(options.allowScripts), innerSandbox,
  };

  const seenAssets = new Set();

  function onMessage(event) {
    const data = event.data;
    if (!data || data.protocol !== PROTOCOL) return;
    if (!frame.contentWindow || event.source !== frame.contentWindow || event.origin !== 'null') return;
    if (data.type === 'bootstrap-ready') {
      try { frame.contentWindow.postMessage(payload, '*'); } catch { /* frame gone */ }
      return;
    }
    if (data.session !== session) return;
    if (data.type === 'scroll') {
      if (options.onScroll) options.onScroll(Number(data.y) || 0);
    } else if (data.type === 'open') {
      if (options.onOpen) options.onOpen(String(data.url || ''));
    } else if (data.type === 'open-asset') {
      // A link to a file inside the package. folio opens it in its own viewer;
      // the sandbox is never handed a Blob or a blob: URL.
      if (options.onOpenAsset) options.onOpenAsset(String(data.path || ''));
    } else if (data.type === 'asset-error') {
      const path = String(data.path || 'unknown').slice(0, 300);
      if (!seenAssets.has(path) && options.onIssue) { seenAssets.add(path); options.onIssue('Missing package asset', path, 'warning'); }
    } else if (data.type === 'runtime-error') {
      // Session-only, 300 characters, never stored and never synced (plan 5-4).
      const message = String(data.message || 'Preview error').slice(0, 300);
      if (!/ResizeObserver loop/i.test(message) && options.onIssue) options.onIssue('Preview runtime error', message, 'error');
    } else if (data.type === 'ready') {
      const restore = { protocol: PROTOCOL, session, type: 'restore', y: Number(options.restoreY) || 0 };
      try { frame.contentWindow.postMessage(restore, '*'); } catch { /* frame gone */ }
      setTimeout(() => { try { frame.contentWindow.postMessage(restore, '*'); } catch { /* frame gone */ } }, 450);
    }
  }

  window.addEventListener('message', onMessage);
  container.appendChild(frame);
  frame.addEventListener('load', () => {
    try { frame.contentWindow.postMessage(payload, '*'); } catch { /* frame gone */ }
  }, { once: true });
  requestAnimationFrame(() => { if (frame.isConnected) frame.src = 'preview-host.html'; });

  return {
    frame,
    session,
    /** Rescale the mounted document (ratio 1 = the document's own default).
        Silently a no-op until the inner frame has requested `innerSandbox`
        with allow-scripts — a plain, un-instrumented Read frame simply never
        acts on the message. */
    setZoom(ratio) {
      const message = { protocol: PROTOCOL, session, type: 'zoom', ratio: Number(ratio) || 1 };
      try { frame.contentWindow.postMessage(message, '*'); } catch { /* frame gone */ }
    },
    destroy() {
      window.removeEventListener('message', onMessage);
      frame.remove();
    },
  };
}
