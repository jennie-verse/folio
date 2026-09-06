/* package.js — ZIP package import and materialization.

   Ported from vault (build 2026.08.10-compat3). The defences are unchanged:
   ZIP Slip, absolute paths, encrypted entries, symlinks, duplicate and
   case-colliding paths, CRC mismatches, compression bombs, 500 entries.

   Two changes for folio (plan 6-4, 0-H):
     · the compressed-archive limit is 15 MiB, not 10 MiB — sample
       `mindmap-.zip` is 10.98 MB and must import;
     · the entry HTML may sit one folder deep (`mindmap-5/index.html`).

   It is an ES module here because the folio shell allows no inline script and
   loads everything as modules; vault attached it to `window` instead. */

const PackageApi = Object.create(null);

(function (exports) {
  'use strict';

  var LIMITS = Object.freeze({
    archiveBytes: 15 * 1024 * 1024,
    totalUncompressedBytes: 25 * 1024 * 1024,
    singleEntryBytes: 10 * 1024 * 1024,
    entryCount: 500,
    maxCompressionRatio: 100
  });
  var textEncoder = new TextEncoder();
  var MIME = {
    html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',txt:'text/plain',json:'application/json',
    svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',
    ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp3:'audio/mpeg',wav:'audio/wav',
    mp4:'video/mp4',webm:'video/webm',pdf:'application/pdf',xml:'application/xml'
  };

  function fail(message, code) { var e = new Error(message); e.code = code || 'PACKAGE_ERROR'; throw e; }
  function utf8Bytes(value) { return textEncoder.encode(String(value || '')).byteLength; }
  function base64(bytes) {
    var out = '', chunk = 0x8000;
    for (var i=0;i<bytes.length;i+=chunk) out += String.fromCharCode.apply(null, bytes.subarray(i, i+chunk));
    return btoa(out);
  }
  function fromBase64(value) {
    var raw = atob(value), out = new Uint8Array(raw.length);
    for (var i=0;i<raw.length;i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function mimeFor(path) {
    var m = /\.([a-z0-9]+)$/i.exec(path || '');
    return m && MIME[m[1].toLowerCase()] || 'application/octet-stream';
  }
  function decodeUtf8(bytes, label) {
    try { return new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
    catch (_) { fail((label || 'Text file') + ' is not valid UTF-8.', 'INVALID_ENCODING'); }
  }
  function splitRef(ref) {
    var value=String(ref || ''), hash='', query='', i=value.indexOf('#');
    if(i>=0){hash=value.slice(i);value=value.slice(0,i)}
    i=value.indexOf('?');if(i>=0){query=value.slice(i);value=value.slice(0,i)}
    return {path:value, suffix:query+hash};
  }
  function isSpecial(ref) { return /^(?:#|data:|blob:|https?:|\/\/|mailto:|tel:|sms:|about:)/i.test(String(ref || '').trim()); }
  function normalizePath(raw, baseDir, rootRelative) {
    if (typeof raw !== 'string' || !raw) fail('ZIP contains an empty file path.', 'UNSAFE_PATH');
    var value=raw.replace(/\\/g,'/');
    if (/^[a-zA-Z]:/.test(value) || (/^\//.test(value) && !rootRelative)) fail('Unsafe absolute ZIP path: '+raw, 'UNSAFE_PATH');
    if (/%(?![0-9a-f]{2})/i.test(value)) fail('Malformed percent encoding in path: '+raw, 'UNSAFE_PATH');
    var decoded;
    try { decoded=decodeURIComponent(value); } catch (_) { fail('Malformed percent encoding in path: '+raw, 'UNSAFE_PATH'); }
    if (/\\/.test(decoded) || /^[a-zA-Z]:/.test(decoded)) fail('Unsafe encoded ZIP path: '+raw, 'UNSAFE_PATH');
    if (rootRelative && decoded.charAt(0)==='/') decoded=decoded.slice(1);
    var joined=(baseDir ? baseDir.replace(/\/$/,'')+'/' : '')+decoded, out=[];
    joined.split('/').forEach(function(seg){
      if (!seg || seg==='.') return;
      if (seg==='..') { if(!out.length) fail('ZIP path escapes the package root: '+raw, 'UNSAFE_PATH'); out.pop(); return; }
      if (seg.indexOf('\0')>=0) fail('ZIP path contains a null byte.', 'UNSAFE_PATH');
      if (/^(?:__proto__|prototype|constructor)$/i.test(seg)) fail('ZIP path contains a reserved manifest key: '+raw, 'UNSAFE_PATH');
      out.push(seg);
    });
    if (!out.length) fail('ZIP path resolves to an empty path: '+raw, 'UNSAFE_PATH');
    return out.join('/');
  }
  function resolvePackagePath(ref, baseDir) {
    if (!ref || isSpecial(ref)) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) return null;
    var p=splitRef(ref), root=p.path.charAt(0)==='/';
    return {path:normalizePath(p.path, root?'':baseDir, true), suffix:p.suffix};
  }
  function ignoredPath(path) { return /(^|\/)(?:\.DS_Store|__MACOSX)(?:\/|$)/.test(path); }
  function crcTable() {
    var table=new Uint32Array(256);
    for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}
    return table;
  }
  var CRC_TABLE=crcTable();
  function crc32(bytes){var c=0xffffffff;for(var i=0;i<bytes.length;i++)c=CRC_TABLE[(c^bytes[i])&255]^(c>>>8);return(c^0xffffffff)>>>0}
  function findEocd(bytes) {
    var min=Math.max(0,bytes.length-65557);
    for(var i=bytes.length-22;i>=min;i--)if(bytes[i]===0x50&&bytes[i+1]===0x4b&&bytes[i+2]===0x05&&bytes[i+3]===0x06)return i;
    fail('The ZIP central directory is missing or corrupt.', 'CORRUPT_ZIP');
  }
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') fail('This browser cannot decompress ZIP files. Update Safari or use a current browser.', 'NO_DEFLATE');
    try { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); }
    catch (_) { fail('A compressed ZIP entry could not be decompressed.', 'CORRUPT_ZIP'); }
  }
  async function unzip(arrayBuffer) {
    var bytes=new Uint8Array(arrayBuffer), view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(bytes.length>LIMITS.archiveBytes)fail('ZIP exceeds the 15 MB archive limit.','ZIP_LIMIT');
    if(bytes.length<4||view.getUint32(0,true)!==0x04034b50)fail('The selected file is not a supported ZIP archive.','NOT_ZIP');
    var eocd=findEocd(bytes), disk=view.getUint16(eocd+4,true), cdDisk=view.getUint16(eocd+6,true);
    if(disk!==0||cdDisk!==0)fail('Multi-disk ZIP archives are not supported.','UNSUPPORTED_ZIP');
    var count=view.getUint16(eocd+10,true), cdSize=view.getUint32(eocd+12,true), pos=view.getUint32(eocd+16,true);
    if(count===0xffff||cdSize===0xffffffff||pos===0xffffffff)fail('ZIP64 archives are not supported.','UNSUPPORTED_ZIP');
    if(count>LIMITS.entryCount)fail('ZIP contains more than 500 entries.','ZIP_LIMIT');
    if(pos+cdSize>eocd)fail('The ZIP central directory is corrupt.','CORRUPT_ZIP');
    var seen=Object.create(null), seenCase=Object.create(null), entries=[], total=0;
    for(var idx=0;idx<count;idx++){
      if(pos+46>bytes.length||view.getUint32(pos,true)!==0x02014b50)fail('The ZIP central directory is corrupt.','CORRUPT_ZIP');
      var flags=view.getUint16(pos+8,true), method=view.getUint16(pos+10,true), crc=view.getUint32(pos+16,true), comp=view.getUint32(pos+20,true), size=view.getUint32(pos+24,true);
      var nl=view.getUint16(pos+28,true),xl=view.getUint16(pos+30,true),cl=view.getUint16(pos+32,true),ext=view.getUint32(pos+38,true),offset=view.getUint32(pos+42,true);
      var nameBytes=bytes.subarray(pos+46,pos+46+nl), name=decodeUtf8(nameBytes,'ZIP file name'); pos+=46+nl+xl+cl;
      if(flags&1)fail('Encrypted ZIP files are not supported.','ENCRYPTED_ZIP');
      if((ext>>>16&0xf000)===0xa000)fail('ZIP symbolic links are not supported.','UNSAFE_PATH');
      if(name.endsWith('/'))continue;
      var path=normalizePath(name,'',false);if(ignoredPath(path))continue;
      if(seen[path])fail('ZIP contains a duplicate path: '+path,'DUPLICATE_PATH');
      var folded=path.toLocaleLowerCase('en-US');if(seenCase[folded])fail('ZIP contains a case-colliding path: '+path,'CASE_COLLISION');
      seen[path]=1;seenCase[folded]=1;
      if(method!==0&&method!==8)fail('Unsupported ZIP compression method for '+path+'.','UNSUPPORTED_ZIP');
      if(size>LIMITS.singleEntryBytes)fail('ZIP entry exceeds the 10 MB limit: '+path,'ZIP_LIMIT');
      total+=size;if(total>LIMITS.totalUncompressedBytes)fail('ZIP exceeds the 25 MB expanded-size limit.','ZIP_LIMIT');
      if(comp===0&&size>0||comp>0&&size/comp>LIMITS.maxCompressionRatio)fail('ZIP entry has an unsafe compression ratio: '+path,'ZIP_BOMB');
      if(offset+30>bytes.length||view.getUint32(offset,true)!==0x04034b50)fail('ZIP local entry is corrupt: '+path,'CORRUPT_ZIP');
      var lnl=view.getUint16(offset+26,true),lxl=view.getUint16(offset+28,true),start=offset+30+lnl+lxl;
      if(start+comp>bytes.length)fail('ZIP entry data is truncated: '+path,'CORRUPT_ZIP');
      entries.push({path:path,method:method,compressed:bytes.slice(start,start+comp),size:size,crc:crc});
    }
    var files=Object.create(null);
    for(var j=0;j<entries.length;j++){
      var item=entries[j], data=item.method===0?item.compressed:await inflateRaw(item.compressed);
      if(data.length!==item.size||crc32(data)!==item.crc)fail('ZIP integrity check failed: '+item.path,'CORRUPT_ZIP');
      files[item.path]=data;
    }
    return {files:files,totalBytes:total,fileCount:Object.keys(files).length};
  }
  function dataUrl(asset) { return 'data:'+asset.mime+';base64,'+asset.data; }
  function safeScriptText(value){return String(value).replace(/<\/script/gi,'<\\/script').replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')}
  function dirname(path){var i=path.lastIndexOf('/');return i<0?'':path.slice(0,i)}
  function analyze(content) {
    var result={fragment:[],embedded:[],packageLocal:[],rootRelative:[],remote:[],remoteScripts:[],remoteStyles:[],remoteMedia:[],externalLinks:[],special:[],classicScripts:[],packageLocalScripts:[],moduleScripts:[],restricted:[],downloads:[]};
    var doc=new DOMParser().parseFromString(content||'','text/html');
    function add(ref,kind){if(!ref)return;ref=String(ref).trim();if(!ref)return;if(ref.charAt(0)==='#')result.fragment.push(ref);else if(/^(?:data:|blob:)/i.test(ref))result.embedded.push(ref);else if(/^(?:https?:|\/\/)/i.test(ref))(kind==='link'?result.externalLinks:result.remote).push(ref);else if(/^(?:mailto:|tel:|sms:)/i.test(ref))result.special.push(ref);else if(/^\//.test(ref))result.rootRelative.push(ref);else if(/^[a-z][a-z0-9+.-]*:/i.test(ref))result.restricted.push(ref);else result.packageLocal.push(ref);if(kind==='download')result.downloads.push(ref)}
    doc.querySelectorAll('[src],[href],[poster],[data]').forEach(function(el){var attr=el.hasAttribute('src')?'src':el.hasAttribute('href')?'href':el.hasAttribute('poster')?'poster':'data';add(el.getAttribute(attr),el.matches('a[download]')?'download':el.matches('a[href]')?'link':'asset')});
    doc.querySelectorAll('[srcset]').forEach(function(el){String(el.getAttribute('srcset')||'').split(/,(?=\s*(?:[^()]|\([^)]*\))*$)/).forEach(function(c){add(c.trim().split(/\s+/)[0],'asset')})});
    doc.querySelectorAll('script').forEach(function(s){
      var type=(s.getAttribute('type')||'').trim().toLowerCase(),src=String(s.getAttribute('src')||'').trim();
      if(type==='module')result.moduleScripts.push(src||'[inline module]');
      else if(!type||/^(?:text|application)\/javascript$/.test(type)){
        result.classicScripts.push(src||'[inline classic]');
        if(src&&/^(?:https?:|\/\/)/i.test(src))result.remoteScripts.push(src);
        else if(src&&!/^(?:data:|blob:|[a-z][a-z0-9+.-]*:)/i.test(src))result.packageLocalScripts.push(src);
      }
    });
    doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach(function(el){var ref=String(el.getAttribute('href')||'').trim();if(/^(?:https?:|\/\/)/i.test(ref))result.remoteStyles.push(ref)});
    doc.querySelectorAll('img[src],source[src],video[src],video[poster],audio[src],track[src],embed[src],object[data],iframe[src]').forEach(function(el){
      var ref=String(el.getAttribute(el.hasAttribute('src')?'src':el.hasAttribute('poster')?'poster':'data')||'').trim();
      if(/^(?:https?:|\/\/)/i.test(ref))result.remoteMedia.push(ref);
    });
    doc.querySelectorAll('iframe,object,embed').forEach(function(el){result.restricted.push('<'+el.localName+'>')});
    if(/\b(?:new\s+Worker|SharedWorker|serviceWorker|WebAssembly|import\s*\()/i.test(content||''))result.restricted.push('worker, service worker, WebAssembly, or dynamic import');
    Object.keys(result).forEach(function(k){result[k]=result[k].filter(function(v,i,a){return a.indexOf(v)===i})});return result;
  }
  function assetFor(doc,path){return doc.packageAssets&&doc.packageAssets[path]||null}
  function rewriteCss(css,baseDir,doc,depth,seen,warnings){
    depth=depth||0;seen=seen||Object.create(null);if(depth>8){warnings.push('CSS import depth exceeded.');return css}
    css=css.replace(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;?/gi,function(all,ref){
      try{var r=resolvePackagePath(ref,baseDir),a=r&&assetFor(doc,r.path);if(!a){warnings.push('Missing CSS import: '+ref);return '/* folio: missing @import '+ref+' */'}if(a.mime!=='text/css'){warnings.push('Unsupported CSS import type: '+r.path);return ''}if(seen[r.path])return '/* folio: CSS cycle '+r.path+' */';seen[r.path]=1;var nested=decodeUtf8(fromBase64(a.data),r.path);return rewriteCss(nested,dirname(r.path),doc,depth+1,seen,warnings)}catch(e){warnings.push(e.message);return ''}
    });
    return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi,function(all,q,ref){try{var r=resolvePackagePath(ref,baseDir),a=r&&assetFor(doc,r.path);if(!r)return all;if(!a){warnings.push('Missing CSS asset: '+ref);return 'url("data:,folio-missing-asset")'}return 'url("'+dataUrl(a)+r.suffix+'")'}catch(e){warnings.push(e.message);return 'url("data:,folio-blocked-path")'}})
  }
  /* Which assets does the page actually have to DRAW, and which are merely
     linked?

     The two mindmap samples are 100% links: every PDF and SVG is reachable
     only through an <a href>, and inlining them made the srcdoc 3.25 MB and
     16.39 MB. Those files are opened by folio's own viewers on click, so they
     never need to be inside the page.

     `display` wins ties on purpose: a file used by BOTH an <img> and an <a>
     stays inlined, because failing to draw something is worse than carrying
     it. Assets nothing references stay inlined too — only anchor-ONLY assets
     are dropped. */
  function collectRefs(root,baseDir,ALL_ASSETS){
    var display=Object.create(null),anchor=Object.create(null);
    function add(bucket,ref){
      if(!ref||isSpecial(ref))return;
      try{var r=resolvePackagePath(ref,baseDir);if(r)bucket[r.path]=1}catch(_){/* unsafe paths are handled by the rewriter */}
    }
    function addCss(css,dir,depth,seen){
      if(depth>8)return;
      String(css||'').replace(/@import\s+(?:url\(\s*)?["']([^"']+)["']\s*\)?\s*;?/gi,function(all,ref){
        try{
          var r=resolvePackagePath(ref,dir);
          if(r&&!seen[r.path]){
            seen[r.path]=1;display[r.path]=1;
            var a=assetFor({packageAssets:ALL_ASSETS},r.path);
            if(a&&a.mime==='text/css')addCss(decodeUtf8(fromBase64(a.data),r.path),dirname(r.path),depth+1,seen);
          }
        }catch(_){/* ignore */}
        return '';
      });
      String(css||'').replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi,function(all,q,ref){add(display,ref);return ''});
    }
    ALL_ASSETS=ALL_ASSETS||{};

    root.querySelectorAll('[src],[href],[poster],[data]').forEach(function(el){
      var isAnchor=el.localName==='a'&&el.hasAttribute('href')&&!el.hasAttribute('download');
      ['src','poster','data','href'].forEach(function(name){
        if(!el.hasAttribute(name))return;
        // A plain <a href> is a link. Everything else has to render.
        if(name==='href'&&isAnchor)add(anchor,el.getAttribute(name));
        else add(display,el.getAttribute(name));
      });
    });
    root.querySelectorAll('[srcset]').forEach(function(el){
      String(el.getAttribute('srcset')||'').split(/,(?=\s*(?:[^()]|\([^)]*\))*$)/).forEach(function(c){
        add(display,c.trim().split(/\s+/)[0]);
      });
    });
    root.querySelectorAll('style').forEach(function(s){addCss(s.textContent,baseDir,0,Object.create(null))});
    root.querySelectorAll('[style]').forEach(function(el){addCss(el.getAttribute('style'),baseDir,0,Object.create(null))});
    root.querySelectorAll('link[rel~="stylesheet"][href]').forEach(function(link){
      try{
        var r=resolvePackagePath(link.getAttribute('href'),baseDir);
        if(!r)return;
        display[r.path]=1;
        var a=assetFor({packageAssets:ALL_ASSETS},r.path);
        if(a&&a.mime==='text/css')addCss(decodeUtf8(fromBase64(a.data),r.path),dirname(r.path),0,Object.create(null));
      }catch(_){/* ignore */}
    });
    return {display:display,anchor:anchor};
  }

  /** Paths that must stay in the runtime map: everything except anchor-only. */
  function inlinePaths(assets,refs){
    var out=Object.create(null);
    Object.keys(assets||{}).forEach(function(path){
      if(refs.anchor[path]&&!refs.display[path])return;
      out[path]=1;
    });
    return out;
  }

  function rewriteStatic(root,doc,baseDir,warnings){
    var attrs=['src','href','poster'];root.querySelectorAll('*').forEach(function(el){if(el.localName==='script'||(el.localName==='link'&&/\bstylesheet\b/i.test(el.getAttribute('rel')||'')))return;attrs.forEach(function(attr){if(!el.hasAttribute(attr))return;var ref=el.getAttribute(attr);
      /* A link stays a link. The package path is recorded so a tap can be
         handed to folio's own viewer instead of navigating the sandbox to a
         multi-megabyte data: URL. */
      if(attr==='href'&&el.localName==='a'&&!el.hasAttribute('download')){
        /* Tag even when the target is missing from the package. An untagged
           anchor falls through every branch of instrument()'s click handler
           uncaught — no preventDefault, so the click attempts a REAL default
           navigation of the sandboxed frame to a path that was never in the
           ZIP. That fails silently inside the nested frame: no toast, no
           Preview issues entry, nothing the app can see — indistinguishable
           from "the button did nothing" from a live device. Tagging it
           routes the same click through openPackageAsset()'s existing
           "This file is not in the package." toast instead. */
        try{var lr=resolvePackagePath(ref,baseDir);if(lr){el.setAttribute('data-folio-path',lr.path);if(!assetFor(doc,lr.path))warnings.push('Missing package asset: '+ref)}}catch(e){/* left as a dead link */}
        return;
      }
      try{var r=resolvePackagePath(ref,baseDir);if(!r)return;var a=assetFor(doc,r.path);if(!a){warnings.push('Missing package asset: '+ref);el.setAttribute(attr,'data:,folio-missing-asset');return}el.setAttribute(attr,dataUrl(a)+r.suffix)}catch(e){warnings.push(e.message);el.setAttribute(attr,'data:,folio-blocked-path')}})});
    root.querySelectorAll('[srcset]').forEach(function(el){var value=el.getAttribute('srcset')||'',parts=value.split(/,(?=\s*(?:[^()]|\([^)]*\))*$)/);el.setAttribute('srcset',parts.map(function(c){var bits=c.trim().split(/\s+/),ref=bits.shift();try{var r=resolvePackagePath(ref,baseDir),a=r&&assetFor(doc,r.path);if(r&&a)ref=dataUrl(a)+r.suffix;else if(r)warnings.push('Missing package asset: '+ref)}catch(e){warnings.push(e.message)}return [ref].concat(bits).join(' ')}).join(', '))});
    root.querySelectorAll('style').forEach(function(s){s.textContent=rewriteCss(s.textContent||'',baseDir,doc,0,Object.create(null),warnings)});
    root.querySelectorAll('[style]').forEach(function(el){el.setAttribute('style',rewriteCss(el.getAttribute('style')||'',baseDir,doc,0,Object.create(null),warnings))});
    root.querySelectorAll('link[rel~="stylesheet"]').forEach(function(link){var href=link.getAttribute('href');if(!href||/^data:/i.test(href))return;try{var r=resolvePackagePath(href,baseDir),a=r&&assetFor(doc,r.path);if(!a)return;var css=decodeUtf8(fromBase64(a.data),r.path),style=root.createElement?root.createElement('style'):document.createElement('style');style.textContent=rewriteCss(css,dirname(r.path),doc,0,Object.create(null),warnings);link.replaceWith(style)}catch(e){warnings.push(e.message)}})
  }
  /* `keep` is the set of paths allowed into the runtime map; `known` is every
     path in the package, so an anchor can still be tagged with a path whose
     bytes were deliberately left out of the page. */
  function shim(doc,baseDir,sessionId,keep){
    var assets=doc.packageAssets||{},map=Object.create(null),known=Object.create(null);
    Object.keys(assets).forEach(function(k){
      known[k]=1;
      if(!keep||keep[k])map[k]=dataUrl(assets[k]);
    });
    var payload=JSON.stringify({map:map,known:known,base:baseDir,session:sessionId});
    return '<script>(function(){"use strict";var P='+safeScriptText(payload)+',M=P.map,K=P.known,B=P.base,reported=Object.create(null);function post(type,data){try{parent.postMessage(Object.assign({__folioPreview:1,session:P.session,type:type},data||{}),"*")}catch(e){}}function special(v){return /^(?:#|data:|blob:|https?:|\\/\\/|mailto:|tel:|sms:|about:)/i.test(v)}function norm(v){v=String(v||"");if(!v||special(v)||/^[a-z][a-z0-9+.-]*:/i.test(v))return null;var suffix="",i=v.indexOf("#");if(i>=0){suffix=v.slice(i);v=v.slice(0,i)}i=v.indexOf("?");if(i>=0){suffix=v.slice(i)+suffix;v=v.slice(0,i)}try{v=decodeURIComponent(v)}catch(e){}v=v.replace(/\\\\/g,"/");var parts=(v.charAt(0)==="/"?v.slice(1):(B?B+"/":"")+v).split("/"),out=[];for(i=0;i<parts.length;i++){if(!parts[i]||parts[i]===".")continue;if(parts[i]===".."){if(!out.length)return {path:null,suffix:suffix};out.pop()}else out.push(parts[i])}return {path:out.join("/"),suffix:suffix}}function resolve(v){var r=norm(v);if(!r)return String(v||"");if(!r.path)return missing(String(v||""));return M[r.path]?M[r.path]+r.suffix:missing(r.path)}function missing(p){report(p);return "data:,folio-missing-asset"}function report(p){if(!reported[p]){reported[p]=1;post("asset-error",{path:p})}}/* A link keeps its package path and is handed to folio on click; only assets the page must draw are inlined. */function isLink(el,n){return n==="href"&&el&&el.localName==="a"&&!el.hasAttribute("download")}function tagLink(el,v){if(special(String(v||"")))return;var r=norm(v);if(!r||!r.path)return;nativeSet.call(el,"data-folio-path",r.path);if(!K[r.path])report(r.path)}function attr(el,n){var v=el.getAttribute(n);if(!v||special(v))return;if(isLink(el,n)){tagLink(el,v);return}el.setAttribute(n,resolve(v))}var nativeSet=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){n=String(n).toLowerCase();if(isLink(this,n)){tagLink(this,v);return nativeSet.call(this,n,v)}if(n==="src"||n==="href"||n==="poster")v=resolve(v);return nativeSet.call(this,n,v)};if(window.HTMLAnchorElement){var ad=Object.getOwnPropertyDescriptor(window.HTMLAnchorElement.prototype,"href");if(ad&&ad.set&&ad.get)try{Object.defineProperty(window.HTMLAnchorElement.prototype,"href",{configurable:ad.configurable,enumerable:ad.enumerable,get:ad.get,set:function(v){tagLink(this,v);ad.set.call(this,v)}})}catch(e){}}[[window.HTMLImageElement,"src"],[window.HTMLSourceElement,"src"],[window.HTMLVideoElement,"src"],[window.HTMLVideoElement,"poster"],[window.HTMLAudioElement,"src"],[window.HTMLTrackElement,"src"]].forEach(function(x){if(!x[0])return;var d=Object.getOwnPropertyDescriptor(x[0].prototype,x[1]);if(d&&d.set&&d.get)try{Object.defineProperty(x[0].prototype,x[1],{configurable:d.configurable,enumerable:d.enumerable,get:d.get,set:function(v){d.set.call(this,resolve(v))}})}catch(e){}});var ih=Object.getOwnPropertyDescriptor(Element.prototype,"innerHTML");function rewriteHtml(h){var t=document.createElement("template");ih.set.call(t,String(h));t.content.querySelectorAll("[src],[href],[poster]").forEach(function(el){["src","href","poster"].forEach(function(n){if(el.hasAttribute(n))attr(el,n)})});return ih.get.call(t)}if(ih&&ih.set)try{Object.defineProperty(Element.prototype,"innerHTML",{configurable:ih.configurable,enumerable:ih.enumerable,get:ih.get,set:function(v){ih.set.call(this,rewriteHtml(v))}})}catch(e){}var ia=Element.prototype.insertAdjacentHTML;if(ia)Element.prototype.insertAdjacentHTML=function(pos,html){return ia.call(this,pos,rewriteHtml(html))};new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType!==1)return;[n].concat(Array.from(n.querySelectorAll("[src],[href],[poster]"))).forEach(function(el){["src","href","poster"].forEach(function(a){if(el.hasAttribute&&el.hasAttribute(a))attr(el,a)})})})})}).observe(document,{subtree:true,childList:true});window.addEventListener("error",function(e){post("runtime-error",{message:e.message||"Preview resource failed"})},true)})();</script>';
  }
  function inlinePackageScripts(docNode,doc,baseDir,warnings){
    docNode.querySelectorAll('script').forEach(function(s){var type=(s.getAttribute('type')||'').trim().toLowerCase();if(type==='module'){warnings.push('ES module scripts are not supported.');s.type='application/x-vault-unsupported';return}var src=s.getAttribute('src');if(!src)return;if(/^(?:https?:|\/\/)/i.test(src)){warnings.push('Remote script blocked by preview policy: '+src);s.type='application/x-vault-remote-blocked';s.removeAttribute('src');return}try{var r=resolvePackagePath(src,baseDir),a=r&&assetFor(doc,r.path);if(!a){warnings.push('Missing classic script: '+src);s.type='application/x-vault-missing';s.removeAttribute('src');return}if(!/(?:javascript|ecmascript)/i.test(a.mime)&&!/\.js$/i.test(r.path)){warnings.push('Unsupported script type: '+r.path);s.type='application/x-vault-unsupported';s.removeAttribute('src');return}var code=decodeUtf8(fromBase64(a.data),r.path);s.textContent=code.replace(/<\/script/gi,'<\\/script');s.removeAttribute('src');s.removeAttribute('integrity');s.removeAttribute('crossorigin')}catch(e){warnings.push(e.message);s.type='application/x-vault-unsupported';s.removeAttribute('src')}})
  }
  function materialize(doc,sessionId,instrument,storageShim){
    var parsed=new DOMParser().parseFromString(doc.content||'','text/html'),warnings=[],baseDir=dirname(doc.entryPath||'index.html'),base=parsed.querySelector('base[href]');
    if(base){try{var b=resolvePackagePath(base.getAttribute('href'),baseDir);if(b)baseDir=b.path.replace(/\/$/,'')}catch(e){warnings.push('Unsupported <base>: '+e.message)}base.remove()}
    // Classify BEFORE rewriting: rewriteStatic replaces refs with data: URLs
    // and the original package paths are gone after it runs.
    var keep=inlinePaths(doc.packageAssets,collectRefs(parsed,baseDir,doc.packageAssets));
    rewriteStatic(parsed,doc,baseDir,warnings);inlinePackageScripts(parsed,doc,baseDir,warnings);
    var head=parsed.head||parsed.documentElement.insertBefore(parsed.createElement('head'),parsed.body||null);
    head.insertAdjacentHTML('afterbegin',(storageShim||'')+shim(doc,baseDir,sessionId,keep));
    if(instrument)(parsed.body||parsed.documentElement).insertAdjacentHTML('beforeend',instrument);
    return {html:'<!DOCTYPE html>\n'+parsed.documentElement.outerHTML,warnings:warnings.filter(function(v,i,a){return a.indexOf(v)===i})};
  }
  function validateManifest(raw) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('Backup package manifest is invalid.','INVALID_MANIFEST');
    var out=Object.create(null),total=0,folded=Object.create(null),keys=Object.keys(raw);if(keys.length>LIMITS.entryCount)fail('Backup package has too many assets.','INVALID_MANIFEST');
    keys.forEach(function(path){var safe=normalizePath(path,'',false);if(safe!==path)fail('Backup package path is not normalized: '+path,'INVALID_MANIFEST');var low=safe.toLocaleLowerCase('en-US');if(folded[low])fail('Backup package contains a case collision.','INVALID_MANIFEST');folded[low]=1;var a=raw[path];if(!a||typeof a!=='object'||a.encoding!=='base64'||typeof a.data!=='string'||typeof a.mime!=='string')fail('Backup package asset is invalid: '+path,'INVALID_MANIFEST');var bytes;try{bytes=fromBase64(a.data)}catch(_){fail('Backup package asset is not valid base64: '+path,'INVALID_MANIFEST')}if(!Number.isSafeInteger(a.bytes)||a.bytes!==bytes.length)fail('Backup package asset size mismatch: '+path,'INVALID_MANIFEST');if(bytes.length>LIMITS.singleEntryBytes)fail('Backup package asset is too large: '+path,'INVALID_MANIFEST');total+=bytes.length;if(total>LIMITS.totalUncompressedBytes)fail('Backup package is too large.','INVALID_MANIFEST');var mime=mimeFor(path);if(a.mime!==mime)fail('Backup package MIME mismatch: '+path,'INVALID_MANIFEST');out[path]={mime:mime,encoding:'base64',data:a.data,bytes:bytes.length}});return out
  }
  /* Choose the document to open.

     Order: a root index.html, then the only HTML file in the ZIP, then the
     index.html of a single wrapping folder. That last case is what "Compress"
     produces on macOS — every path is prefixed with the folder name, so
     `mindmap-5/index.html` is the entry even though the ZIP root has none
     (plan 0-H). Only ONE top-level folder qualifies: with two, the package is
     genuinely ambiguous and stays an error. */
  function pickEntry(paths) {
    var html=paths.filter(function(p){return /\.html?$/i.test(p)});
    if(!html.length)fail('ZIP has no entry HTML file.','NO_ENTRY_HTML');
    if(html.indexOf('index.html')>=0)return 'index.html';
    if(html.length===1)return html[0];
    var roots=Object.create(null);
    paths.forEach(function(p){var i=p.indexOf('/');if(i>0)roots[p.slice(0,i)]=1;else roots['']=1});
    var names=Object.keys(roots);
    if(names.length===1&&names[0]!==''){
      var wrapped=names[0]+'/index.html';
      if(html.indexOf(wrapped)>=0)return wrapped;
    }
    fail('ZIP has multiple HTML files and no root index.html: '+html.join(', '),'AMBIGUOUS_ENTRY');
  }

  async function importZip(file) {
    var buffer=await file.arrayBuffer(),unzipped=await unzip(buffer),paths=Object.keys(unzipped.files),entry=pickEntry(paths);
    var content=decodeUtf8(unzipped.files[entry],entry),assets=Object.create(null),warnings=[],analysis=analyze(content);
    paths.forEach(function(path){if(path===entry)return;var data=unzipped.files[path],mime=mimeFor(path);assets[path]={mime:mime,encoding:'base64',data:base64(data),bytes:data.length};if(mime==='application/octet-stream')warnings.push('Unknown asset type is download-only: '+path)});
    if(analysis.moduleScripts.length)warnings.push('ES module scripts are not supported.');if(analysis.restricted.length)warnings.push('Restricted features detected: '+analysis.restricted.join(', '));if(analysis.remote.length)warnings.push('Remote resources are blocked or remain online-only.');
    var meta={content:content,packageAssets:assets,importKind:'zip',packageFileName:file.name,entryPath:entry,packageFileCount:paths.length,archiveBytes:buffer.byteLength,uncompressedBytes:unzipped.totalBytes,conversionWarnings:warnings};
    meta.sourceBytes=utf8Bytes(content);meta.assetBytes=utf8Bytes(JSON.stringify(assets));meta.sizeBytes=meta.sourceBytes+meta.assetBytes;return meta;
  }
  exports.LIMITS=LIMITS;exports.importZip=importZip;exports.materialize=materialize;exports.analyze=analyze;
  exports.validateManifest=validateManifest;exports.utf8Bytes=utf8Bytes;exports.normalizePath=normalizePath;
  exports.resolvePackagePath=resolvePackagePath;exports.pickEntry=pickEntry;exports.base64=base64;exports.fromBase64=fromBase64;
})(PackageApi);

export const LIMITS = PackageApi.LIMITS;
export const importZip = PackageApi.importZip;
export const materialize = PackageApi.materialize;
export const analyze = PackageApi.analyze;
export const validateManifest = PackageApi.validateManifest;
export const utf8Bytes = PackageApi.utf8Bytes;
export const normalizePath = PackageApi.normalizePath;
export const resolvePackagePath = PackageApi.resolvePackagePath;
export const pickEntry = PackageApi.pickEntry;
export const base64 = PackageApi.base64;
export const fromBase64 = PackageApi.fromBase64;
