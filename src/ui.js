/* ui.js — DOM helpers, toasts, sheets and confirm dialogs.
   Nothing here writes innerHTML or a style attribute: the shell CSP is
   script-src 'self' / style-src 'self', so computed values go through CSSOM
   (element.style.x = …) and user text goes through textContent only. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Build an element. `props.text` sets textContent; never markup. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') node.textContent = String(value);
    else if (key === 'class') node.className = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

/* ── toast ─────────────────────────────────────────────────────────────── */

/** Toasts are 3.2s, or 5s when they carry an Undo (design 5장). */
export function toast(message, { actionLabel, onAction, ms } = {}) {
  const host = $('#toasts');
  if (!host) return () => {};
  const box = el('div', { class: 'toast' }, [el('span', { text: message })]);
  let done = false;
  const close = () => { if (done) return; done = true; box.remove(); };
  if (actionLabel) {
    box.appendChild(el('button', {
      type: 'button', text: actionLabel,
      onclick: () => { close(); if (onAction) onAction(); },
    }));
  }
  host.appendChild(box);
  setTimeout(close, ms || (actionLabel ? 5000 : 3200));
  return close;
}

/* ── overlays ──────────────────────────────────────────────────────────── */

let dialogSequence = 0;
function openOverlay(build, { onDismiss } = {}) {
  const host = $('#overlayHost');
  const previous = document.activeElement;
  const overlay = el('div', { class: 'overlay' });
  const panel = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  overlay.appendChild(panel);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (previous && previous.focus) previous.focus();
  };
  const dismiss = () => {
    if (closed) return;
    if (onDismiss) onDismiss();
    close();
  };
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); return; }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(panel.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  overlay.addEventListener('click', (event) => { if (event.target === overlay) dismiss(); });
  document.addEventListener('keydown', onKey, true);

  build(panel, close);
  const title = panel.querySelector('h1,h2,h3');
  if (title) {
    title.id = title.id || `folio-dialog-${++dialogSequence}`;
    panel.setAttribute('aria-labelledby', title.id);
  } else {
    panel.setAttribute('aria-label', 'Dialog');
  }
  host.appendChild(overlay);
  const first = panel.querySelector('button, input, select, textarea');
  if (first) first.focus();
  return close;
}

/** Bottom sheet of actions. `items` is [{label, run, disabled}]. */
export function sheet(title, items) {
  return openOverlay((panel, close) => {
    if (title) panel.appendChild(el('h2', { text: title }));
    const menu = el('menu');
    items.filter(Boolean).forEach((item) => {
      menu.appendChild(el('li', {}, [
        el('button', {
          type: 'button', text: item.label, disabled: item.disabled || undefined,
          onclick: () => { close(); if (item.run) item.run(); },
        }),
      ]));
    });
    panel.appendChild(menu);
    panel.appendChild(el('button', { type: 'button', text: 'Cancel', onclick: close }));
  });
}

/** A sheet of mutually exclusive choices. Resolves with the chosen value. */
export function choose(title, options, current) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    openOverlay((panel, close) => {
      panel.appendChild(el('h2', { text: title }));
      const menu = el('menu');
      options.forEach((option) => {
        menu.appendChild(el('li', {}, [
          el('button', {
            type: 'button',
            text: option.value === current ? `${option.label} ·` : option.label,
            'aria-pressed': String(option.value === current),
            onclick: () => { close(); finish(option.value); },
          }),
        ]));
      });
      panel.appendChild(menu);
      panel.appendChild(el('button', { type: 'button', text: 'Cancel', onclick: () => { close(); finish(undefined); } }));
    }, { onDismiss: () => finish(undefined) });
  });
}

/** Confirmation dialog. Resolves true only when the confirm button is pressed. */
export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', extraLabel, danger }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
    openOverlay((panel, close) => {
      panel.appendChild(el('h2', { text: title }));
      if (message) panel.appendChild(el('p', { text: message }));
      const row = el('div', { class: 'row' });
      row.appendChild(el('button', {
        type: 'button', class: danger ? 'danger' : 'primary', text: confirmLabel,
        onclick: () => { close(); finish(true); },
      }));
      if (extraLabel) {
        row.appendChild(el('button', {
          type: 'button', text: extraLabel,
          onclick: () => { close(); finish('extra'); },
        }));
      }
      row.appendChild(el('button', { type: 'button', text: cancelLabel, onclick: () => { close(); finish(false); } }));
      panel.appendChild(row);
    }, { onDismiss: () => finish(false) });
  });
}

/** A sheet built by a caller-supplied function. Used for the document sheet. */
export function customSheet(build) {
  return openOverlay(build);
}

/* ── formatting ────────────────────────────────────────────────────────── */

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let scaled = value / 1024;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) { scaled /= 1024; unit += 1; }
  return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1)} ${units[unit]}`;
}

export function formatCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

export function formatWhen(timestamp) {
  const time = Number(timestamp) || 0;
  if (!time) return '';
  const diff = Date.now() - time;
  const minute = 60000, hour = 3600000, day = 86400000;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} d ago`;
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function todayStamp() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
