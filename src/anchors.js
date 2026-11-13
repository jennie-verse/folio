/* anchors.js — in-document Markdown fragment links.

   Headings get a generated id with a fixed prefix so a document can never
   collide with (or clobber) an app element id, and ids are never taken from
   authored HTML. A link `#some-heading` resolves to the heading through a
   Map of slug -> element built from the rendered document only; the DOM is
   never searched by the raw fragment. */

export const ANCHOR_PREFIX = 'md-';

/** GitHub-style slug: lowercase, spaces to hyphens, punctuation removed,
    Unicode letters and digits (Korean included) kept. */
export function slugify(text) {
  return String(text ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Unique slugs in order: second "Intro" becomes intro-1, then intro-2. */
export function uniqueSlugs(texts) {
  const seen = new Map();
  const taken = new Set();
  return texts.map((text) => {
    const base = slugify(text) || 'section';
    let slug = base;
    let n = seen.get(base) || 0;
    while (taken.has(slug)) { n += 1; slug = `${base}-${n}`; }
    seen.set(base, n);
    taken.add(slug);
    return slug;
  });
}

/** Turn the fragment of a link ("#%ED%95%9C" or "#한글") into a slug, or
    null when it is empty or cannot be decoded. */
export function fragmentToSlug(href) {
  const raw = String(href ?? '');
  if (!raw.startsWith('#') || raw.length < 2) return null;
  let value = raw.slice(1);
  try { value = decodeURIComponent(value); } catch { return null; }
  const slug = slugify(value);
  return slug || null;
}

/** Give every heading under `root` a prefixed id and return slug -> heading. */
export function assignHeadingIds(root) {
  const headings = Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const slugs = uniqueSlugs(headings.map((heading) => heading.textContent));
  const map = new Map();
  headings.forEach((heading, i) => {
    heading.id = ANCHOR_PREFIX + slugs[i];
    map.set(slugs[i], heading);
  });
  return map;
}

/** Record authored id/name targets (literal value -> element, first one wins)
    BEFORE their attributes are stripped, so hand-written anchors such as
    `<a id="fn1">` or `<h2 id="custom">` still work as link targets without
    the document ever owning a real DOM id. */
export function collectAuthoredTargets(root) {
  const map = new Map();
  root.querySelectorAll('[id],[name]').forEach((node) => {
    for (const attr of ['id', 'name']) {
      const value = node.getAttribute(attr);
      if (value && !map.has(value)) map.set(value, node);
    }
  });
  return map;
}

/** Target for a link inside this document, or null. Precedence (documented
    contract): 1) an authored id/name equal to the literal fragment (raw, then
    percent-decoded), 2) a generated heading slug. Only elements registered
    for this document can be returned; the DOM is never searched. */
export function resolveFragment(href, registry) {
  const raw = String(href ?? '');
  if (!raw.startsWith('#') || raw.length < 2) return null;
  const authored = registry.authored || new Map();
  const headings = registry.headings || new Map();
  const literal = raw.slice(1);
  if (authored.has(literal)) return authored.get(literal);
  let decoded = null;
  try { decoded = decodeURIComponent(literal); } catch { /* fall through to slug */ }
  if (decoded && authored.has(decoded)) return authored.get(decoded);
  const slug = fragmentToSlug(raw);
  return slug && headings.has(slug) ? headings.get(slug) : null;
}

/** Scroll `body` so `target` sits just under its top edge. */
export function scrollToHeading(body, target, gap = 8) {
  const top = target.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - gap;
  body.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
}
