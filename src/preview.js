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

/* The five ::highlight() colours folio's own stylesheet defines for
   CSS.highlights (assets/app.css). A sandboxed document is its own
   stylesheet realm — nothing from the outer app's CSS reaches it — so a
   document that wants the SAME highlight marks the outer viewer draws for
   text/Markdown/PDF (instrument()'s applyHighlights, below) needs this small
   rule set injected alongside it. Kept in one place so the two never drift. */
export function highlightStyle() {
  return '<style>::highlight(folio-core){background:rgba(239,179,193,.56)}::highlight(folio-agree){background:rgba(142,207,180,.52)}::highlight(folio-question){background:rgba(240,193,147,.58)}::highlight(folio-word){background:rgba(185,216,238,.58)}::highlight(folio-quote){background:rgba(228,215,192,.62)}</style>';
}

/* An opaque origin makes window.localStorage THROW SecurityError, which kills
   a document's script on its first line and leaves every button in it dead.
   Memory-backed storage keeps those documents running; the data is
   per-session by design and never reaches folio's own storage. */
export const STORAGE_SHIM = '<scr' + 'ipt>(function(){function mk(){var m=Object.create(null);var api={getItem:function(k){k=String(k);return (k in m)?m[k]:null},setItem:function(k,v){m[String(k)]=String(v)},removeItem:function(k){delete m[String(k)]},clear:function(){m=Object.create(null)},key:function(i){var ks=Object.keys(m);return i<ks.length?ks[i]:null}};try{Object.defineProperty(api,"length",{get:function(){return Object.keys(m).length}})}catch(e){}return api}function works(n){try{var st=window[n];if(!st)return false;st.setItem("__folio","1");st.removeItem("__folio");return true}catch(e){return false}}["localStorage","sessionStorage"].forEach(function(n){if(works(n))return;var v=mk();try{Object.defineProperty(window,n,{configurable:true,get:function(){return v}})}catch(e){try{window[n]=v}catch(x){}}});try{document.cookie}catch(e){try{var ck="";Object.defineProperty(document,"cookie",{configurable:true,get:function(){return ck},set:function(x){ck=ck?ck+"; "+x:String(x)}})}catch(x){}}try{var rq=window.indexedDB.open("__folio_probe");rq.onsuccess=function(){try{rq.result.close();window.indexedDB.deleteDatabase("__folio_probe")}catch(e){}}}catch(e){try{Object.defineProperty(window,"indexedDB",{configurable:true,get:function(){return undefined}})}catch(x){}}})();<\/scr' + 'ipt>';

/* Diagnostics: scroll position, runtime errors, link taps. Injected at the top
   of <head> so it also catches failures thrown by the document's own head
   scripts — appending it at </body> misses those entirely. */
export function instrument(session) {
  return '<scr' + 'ipt>(function(){var S=' + JSON.stringify(session) + ';function p(t,d){try{parent.postMessage(Object.assign({__folioPreview:1,session:S,type:t},d||{}),"*")}catch(e){}}'
    // Selection/highlight support (folio reading annotations): this document is
    // its own realm, so the outer app can never read its Selection directly —
    // these helpers find quote text, the nearest heading and a 0-1 scroll
    // ratio HERE, then only ever post plain strings/numbers back out.
    + 'function ratio(){var d=document.documentElement;var mx=Math.max(1,(d.scrollHeight||0)-(window.innerHeight||0));return Math.max(0,Math.min(1,(window.scrollY||d.scrollTop||0)/mx))}'
    + 'function headEls(){return Array.prototype.slice.call(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))}'
    + 'function nearestHeading(node){var hs=headEls();if(!hs.length||!node)return null;var best=null;for(var i=0;i<hs.length;i++){var h=hs[i];var pos=h.compareDocumentPosition(node);if(h===node||(pos&4)||(pos&8))best=h}return best?(best.textContent||"").trim().slice(0,80):null}'
    + 'function elAtTop(){try{return document.elementFromPoint(Math.min((window.innerWidth||1)-1,Math.max(0,(window.innerWidth||0)/2)),1)}catch(e){return null}}'
    + 'function textNodes(){var w=document.createTreeWalker(document.body||document.documentElement,NodeFilter.SHOW_TEXT,{acceptNode:function(n){if(!n.nodeValue||!n.nodeValue.length)return NodeFilter.FILTER_REJECT;var pe=n.parentElement;if(pe&&pe.closest&&pe.closest("script,style,textarea,input,button"))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT}});var nodes=[],nd;while((nd=w.nextNode()))nodes.push(nd);return nodes}'
    + 'function findRange(quote,prefix,suffix){if(!quote)return null;var nodes=textNodes();var text=nodes.map(function(n){return n.nodeValue}).join("");var candidates=[];for(var at=text.indexOf(quote);at>=0;at=text.indexOf(quote,at+Math.max(1,quote.length)))candidates.push(at);if(!candidates.length)return null;var startAt=candidates[0];for(var i=0;i<candidates.length;i++){var c=candidates[i];var okP=!prefix||text.slice(Math.max(0,c-prefix.length),c).endsWith(prefix);var okS=!suffix||text.slice(c+quote.length,c+quote.length+suffix.length).startsWith(suffix);if(okP&&okS){startAt=c;break}}var cursor=0,startNode=null,startOffset=0,endNode=null,endOffset=0;for(var j=0;j<nodes.length;j++){var nd2=nodes[j];var next=cursor+nd2.nodeValue.length;if(!startNode&&startAt>=cursor&&startAt<=next){startNode=nd2;startOffset=startAt-cursor}var endAt=startAt+quote.length;if(endAt>=cursor&&endAt<=next){endNode=nd2;endOffset=endAt-cursor;break}cursor=next}if(!startNode||!endNode)return null;var rg=document.createRange();rg.setStart(startNode,startOffset);rg.setEnd(endNode,endOffset);return rg}'
    + 'var HLC=["core","agree","question","word","quote"];function applyHL(items){if(!window.CSS||!CSS.highlights||typeof Highlight!=="function")return;for(var i=0;i<HLC.length;i++)CSS.highlights.delete("folio-"+HLC[i]);var groups={};for(var k=0;k<HLC.length;k++)groups[HLC[k]]=[];(items||[]).forEach(function(item){var rg=findRange(item.quote,item.prefix||"",item.suffix||"");if(rg)groups[HLC.indexOf(item.color)>=0?item.color:"core"].push(rg)});for(var m=0;m<HLC.length;m++){if(groups[HLC[m]].length)CSS.highlights.set("folio-"+HLC[m],new Highlight(...groups[HLC[m]]))}}'
    + 'function selCtx(){var sel=window.getSelection();if(!sel||sel.rangeCount!==1||sel.isCollapsed)return null;var quote=(sel.toString()||"").trim();if(!quote)return null;var full=(document.body&&(document.body.innerText||document.body.textContent))||"";var at=full.indexOf(quote);var rg=sel.getRangeAt(0);var node=rg.startContainer.nodeType===1?rg.startContainer:rg.startContainer.parentElement;return{quote:quote,prefix:at>=0?full.slice(Math.max(0,at-48),at):"",suffix:at>=0?full.slice(at+quote.length,at+quote.length+48):"",heading:nearestHeading(node),scrollRatio:ratio()}}'
    + 'var sf=0;function postSel(){sf=0;p("selection",selCtx()||{quote:null})}document.addEventListener("selectionchange",function(){if(sf)cancelAnimationFrame(sf);sf=requestAnimationFrame(postSel)});'
    + 'function s(){p("scroll",{y:(window.scrollY||document.documentElement.scrollTop||0),ratio:ratio(),heading:nearestHeading(elAtTop())})}window.addEventListener("error",function(e){p("runtime-error",{message:e.message||"Preview runtime error"})},true);window.addEventListener("unhandledrejection",function(e){var v=e.reason;p("runtime-error",{message:v&&v.message||String(v||"Unhandled promise rejection")})});var r;window.addEventListener("scroll",function(){if(r)cancelAnimationFrame(r);r=requestAnimationFrame(s)},{passive:true});window.addEventListener("message",function(e){var d=e.data;if(!d||d.__folioPreview!==1||d.session!==S)return;if(d.type==="restore"){try{window.scrollTo(0,d.y||0)}catch(x){}}else if(d.type==="zoom"){try{document.documentElement.style.zoom=String(d.ratio||1)}catch(x){}}else if(d.type==="highlights"){applyHL(d.items||[])}else if(d.type==="locate"){var rg2=d.quote?findRange(d.quote,d.prefix||"",d.suffix||""):null;if(rg2){try{var tgt=rg2.startContainer.nodeType===1?rg2.startContainer:rg2.startContainer.parentElement;tgt&&tgt.scrollIntoView&&tgt.scrollIntoView({block:"center"})}catch(x){}}else{try{var de=document.documentElement;window.scrollTo(0,(typeof d.scrollRatio==="number"?d.scrollRatio:0)*Math.max(1,de.scrollHeight-window.innerHeight))}catch(x){}}}else if(d.type==="clear-selection"){try{window.getSelection().removeAllRanges()}catch(x){}}});document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;var raw=a.getAttribute("href")||"";var inPkg=a.getAttribute("data-folio-path");if(inPkg){e.preventDefault();p("open-asset",{path:inPkg});return}if(raw.charAt(0)==="#"){e.preventDefault();var f=raw.slice(1),id=f;try{id=decodeURIComponent(f)}catch(x){}var target=id?document.getElementById(id):document.documentElement;if(!target&&id){var named=document.getElementsByName(id);target=named&&named[0]}if(target){try{target.scrollIntoView({block:"start"})}catch(x){target.scrollIntoView()}s()}return}if(a.hasAttribute("download"))return;var u=a.href||raw,pcol=(a.protocol||"").toLowerCase();if(pcol==="http:"||pcol==="https:"||pcol==="mailto:"||pcol==="tel:"||pcol==="sms:"){e.preventDefault();p("open",{url:u})}else if(/^javascript:/i.test(raw)){e.preventDefault();p("runtime-error",{message:"javascript: links are blocked"})}},true);function rdy(){p("ready")}if(document.readyState==="complete")rdy();else window.addEventListener("load",rdy);})();<\/scr' + 'ipt>';
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
      if (options.onScroll) {
        options.onScroll(Number(data.y) || 0, {
          ratio: Number(data.ratio) || 0,
          heading: data.heading ? String(data.heading) : null,
        });
      }
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
    } else if (data.type === 'selection') {
      // The document's own Selection, relayed out because this frame's DOM is
      // opaque to the outer app (see instrument()'s selCtx/postSel). `quote`
      // is absent/null once the selection collapses.
      if (options.onSelection) {
        options.onSelection(data.quote ? {
          quote: String(data.quote),
          prefix: String(data.prefix || ''),
          suffix: String(data.suffix || ''),
          heading: data.heading ? String(data.heading) : null,
          scrollRatio: Number(data.ratio ?? data.scrollRatio) || 0,
        } : null);
      }
    } else if (data.type === 'ready') {
      const restore = { protocol: PROTOCOL, session, type: 'restore', y: Number(options.restoreY) || 0 };
      try { frame.contentWindow.postMessage(restore, '*'); } catch { /* frame gone */ }
      setTimeout(() => { try { frame.contentWindow.postMessage(restore, '*'); } catch { /* frame gone */ } }, 450);
      if (options.onReady) options.onReady();
    }
  }

  window.addEventListener('message', onMessage);
  container.appendChild(frame);
  // Only 'bootstrap-ready' triggers the render post — NOT also the frame's own
  // 'load' event, which used to fire this same postMessage a second time. Both
  // paths raced (postMessage delivery is a queued task, so which one the
  // parent's event loop reacts to first was never guaranteed), and whichever
  // arrived second made preview-host wipe and rebuild the inner iframe from
  // scratch: a visible blank flash, the document's embedded scripts (Run
  // mode) restarting once, and — for Read mode's selection relay — any
  // selection the reader had just made vanishing with the discarded iframe.
  // 'bootstrap-ready' alone is sufficient: it is the host's own inline script
  // announcing it has already attached its message listener.
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
    /** Re-draws this document's own CSS.highlights from `items`
        ({quote, prefix, suffix, color}[]) — the same shape instrument()'s
        applyHL() expects. Silently a no-op until the frame has requested
        instrumented Read/Run, exactly like setZoom above. */
    applyHighlights(items) {
      const message = { protocol: PROTOCOL, session, type: 'highlights', items: items || [] };
      try { frame.contentWindow.postMessage(message, '*'); } catch { /* frame gone */ }
    },
    /** Scrolls this document to a saved quote (falls back to `scrollRatio`
        when the quote can't be found — e.g. the document changed). */
    locate({ quote, locator } = {}) {
      const message = {
        protocol: PROTOCOL, session, type: 'locate',
        quote: quote || '',
        prefix: locator?.textQuote?.prefix || '',
        suffix: locator?.textQuote?.suffix || '',
        scrollRatio: typeof locator?.scrollRatio === 'number' ? locator.scrollRatio : null,
      };
      try { frame.contentWindow.postMessage(message, '*'); } catch { /* frame gone */ }
    },
    clearSelection() {
      const message = { protocol: PROTOCOL, session, type: 'clear-selection' };
      try { frame.contentWindow.postMessage(message, '*'); } catch { /* frame gone */ }
    },
    destroy() {
      window.removeEventListener('message', onMessage);
      frame.remove();
    },
  };
}
