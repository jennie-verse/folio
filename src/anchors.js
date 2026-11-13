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

/** Heading for a link inside this document, or null. Only headings that were
    registered for this document can be returned. */
export function resolveFragment(href, map) {
  const slug = fragmentToSlug(href);
  return slug && map.has(slug) ? map.get(slug) : null;
}

/** Scroll `body` so `target` sits just under its top edge. */
export function scrollToHeading(body, target, gap = 8) {
  const top = target.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - gap;
  body.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
}
