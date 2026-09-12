/**
 * Pure helpers shared by the three platform parsers. No Playwright, no I/O:
 * everything here takes strings / plain objects and returns plain objects, so
 * the fixture tests can exercise the exact code the scrapers run.
 */
import type { OfferPromo } from '../../models/types';

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

export const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

/** JSON.parse that never throws. */
export function safeJson(text: string | null | undefined): Json | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as Json;
  } catch {
    return undefined;
  }
}

/**
 * Content of `<script id="...">...</script>` (or `<script type="application/json" id=...>`),
 * decoded. Handles the three encodings seen in the wild:
 *   1. plain JSON
 *   2. a JSON string literal body (`"` escapes, as Uber Eats emits) -> unescape then parse
 *   3. `window.__X__ = {...};` assignments (DoorDash / Grubhub style) via extractAssignedJson
 */
export function extractScriptJson(html: string, id: string): Json | undefined {
  const re = new RegExp(`<script[^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i');
  const m = html.match(re);
  if (!m) return undefined;
  return decodeEmbeddedJson(m[1]);
}

export function decodeEmbeddedJson(raw: string): Json | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const direct = safeJson(t);
  if (direct !== undefined) return direct;
  // JSON string body without the surrounding quotes: {"a":1}
  const unescaped = safeJson(`"${t.replace(/(?<!\\)"/g, '\\"')}"`);
  if (typeof unescaped === 'string') {
    const inner = safeJson(unescaped);
    if (inner !== undefined) return inner;
  }
  // Uber Eats: JSON.stringify(state) with every `\` percent-encoded (%5C) and every `"` written
  // as " (verified on the live home page). Undo both.
  const uber = safeJson(t.replace(/\\u0022/g, '"').replace(/%5C/g, '\\'));
  if (uber !== undefined) return uber;
  const loose = safeJson(t.replace(/\\u0022/g, '"').replace(/\\u0026/g, '&').replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>'));
  if (loose !== undefined) return loose;
  return undefined;
}

/** `window.__APOLLO_STATE__ = {...};` -> the object. Balanced-brace scan, tolerant of trailing code. */
export function extractAssignedJson(html: string, name: string): Json | undefined {
  const idx = html.search(new RegExp(`(?:window\\.|\\b)${escapeRegExp(name)}\\s*=\\s*`));
  if (idx < 0) return undefined;
  const start = html.indexOf('{', idx);
  const startArr = html.indexOf('[', idx);
  const open = start >= 0 && (startArr < 0 || start < startArr) ? start : startArr;
  if (open < 0) return undefined;
  const text = scanBalanced(html, open);
  if (!text) return undefined;
  const direct = safeJson(text);
  if (direct !== undefined) return direct;
  // JSON.parse("...") wrapper
  const m = html.slice(idx).match(/JSON\.parse\((["'])([\s\S]*?)\1\)/);
  if (m) {
    const str = safeJson(`"${m[2].replace(/(?<!\\)"/g, '\\"')}"`);
    if (typeof str === 'string') return safeJson(str);
  }
  return undefined;
}

function scanBalanced(text: string, open: number): string | undefined {
  const openCh = text[open];
  const closeCh = openCh === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === openCh) depth += 1;
    else if (ch === closeCh) {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return undefined;
}

/** Every `<script>` body on the page decoded as JSON where possible (for state we cannot name). */
export function allScriptJson(html: string): Json[] {
  const out: Json[] = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const body = m[1].trim();
    if (body.length < 50 || body.length > 8_000_000) continue;
    if (body[0] === '{' || body[0] === '[') {
      const j = decodeEmbeddedJson(body);
      if (j !== undefined) out.push(j);
    }
  }
  return out;
}

/** Depth-first walk collecting objects that satisfy `pred`. Bounded so hostile payloads cannot hang us. */
export function findObjects(root: Json | undefined, pred: (o: JsonObject, path: string) => boolean, limit = 500): JsonObject[] {
  const out: JsonObject[] = [];
  const seen = new Set<object>();
  const stack: Array<[Json, string, number]> = [[root ?? null, '', 0]];
  while (stack.length && out.length < limit) {
    const [node, path, depth] = stack.pop()!;
    if (depth > 40 || node === null || typeof node !== 'object') continue;
    if (seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i -= 1) stack.push([node[i], `${path}[${i}]`, depth + 1]);
      continue;
    }
    if (pred(node, path)) out.push(node);
    for (const [k, v] of Object.entries(node)) stack.push([v, path ? `${path}.${k}` : k, depth + 1]);
  }
  return out;
}

export const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
export const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};
export const get = (o: unknown, ...path: Array<string | number>): Json | undefined => {
  let cur: unknown = o;
  for (const p of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[p];
  }
  return cur as Json | undefined;
};

/** Uber/DoorDash "rich text": either a string or `{ text: "..." }` / `{ textSpans: [{text}] }`. */
export function richText(v: unknown): string | undefined {
  if (typeof v === 'string') return str(v);
  if (isObject(v)) {
    const t = str(v.text) ?? str(v.title) ?? str(v.displayText);
    if (t) return t;
    const spans = v.textSpans ?? v.spans ?? v.richTextElements;
    if (Array.isArray(spans)) {
      const joined = spans.map((s) => richText(s) ?? '').join(' ').replace(/\s+/g, ' ').trim();
      if (joined) return joined;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Text -> numbers
// ---------------------------------------------------------------------------

/** "$4.99" | "4.99" | "$0" | "Free" -> number; undefined when no money is present. */
export function parseMoney(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  if (/\bfree\b/i.test(text) && !/\$\s*\d/.test(text)) return 0;
  const m = text.replace(/,/g, '').match(/(-?)\$?\s*(\d+(?:\.\d{1,2})?)/);
  if (!m) return undefined;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return undefined;
  return m[1] === '-' || /^\(.*\)$/.test(text.trim()) ? -n : n;
}

/** "25-40 min" | "25–40 min" | "35 min" | "30 minutes" -> [min, max] */
export function parseEta(text: string | null | undefined): [number, number] | undefined {
  if (!text) return undefined;
  const range = text.match(/(\d{1,3})\s*(?:-|–|—|to)\s*(\d{1,3})\s*min/i);
  if (range) return [Number(range[1]), Number(range[2])];
  const single = text.match(/(\d{1,3})\s*min/i);
  if (single) return [Number(single[1]), Number(single[1]) + 10];
  return undefined;
}

/** "4.6 (2k+)" -> { rating: 4.6, ratingCount: 2000 }; "4.7★ (3,900+)" -> 3900 */
export function parseRating(text: string | null | undefined): { rating?: number; ratingCount?: number } {
  if (!text) return {};
  const out: { rating?: number; ratingCount?: number } = {};
  const r = text.match(/(?:^|[^\d.$])([0-5](?:\.\d)?)(?=\s*(?:\(|★|☆|stars?|\s*•|$))/);
  if (r) out.rating = Number(r[1]);
  const c = text.match(/\(\s*([\d.,]+)\s*(k)?\+?\s*(?:ratings?|reviews?)?\s*\)/i) ?? text.match(/([\d.,]+)\s*(k)?\+?\s*(?:ratings|reviews)/i);
  if (c) {
    const n = Number(c[1].replace(/,/g, ''));
    if (Number.isFinite(n)) out.ratingCount = Math.round(c[2] ? n * 1000 : n);
  }
  return out;
}

/** Cents (int or numeric string) -> dollars. */
export function centsToDollars(v: unknown): number | undefined {
  const n = num(v);
  return n === undefined ? undefined : Math.round(n) / 100;
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Find "Delivery fee ...... $2.99" style rows in flattened page text. */
export function findFeeLine(text: string, label: RegExp): number | undefined {
  const re = new RegExp(`${label.source}[^$\\d\\n]{0,40}?(free|-?\\$\\s*\\d+(?:\\.\\d{1,2})?)`, 'i');
  const m = text.match(re);
  return m ? parseMoney(m[1]) : undefined;
}

/**
 * Promo copy -> OfferPromo rule, when the copy is machine-readable:
 *  "20% off orders $25+" / "$5 off your order of $20 or more" / "Free delivery on $15+"
 * Returns undefined for copy we cannot turn into a rule (we never invent discounts).
 */
export function parsePromoText(text: string | undefined, code?: string, now: Date = new Date()): OfferPromo | undefined {
  if (!text) return undefined;
  const t = text.replace(/\s+/g, ' ').trim();
  const min =
    t.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*(?:\+|or more|minimum|min\b)/i) ??
    t.match(/orders?\s+(?:of|over|above)\s+\$\s*(\d+(?:\.\d{1,2})?)/i) ??
    t.match(/spend\s+\$\s*(\d+(?:\.\d{1,2})?)/i);
  const minSubtotal = min ? Number(min[1]) : 0;
  const base = { code: code ?? t.match(/\b[A-Z][A-Z0-9]{3,}\b/)?.[0] ?? 'PROMO', description: t, startsAt: now, endsAt: new Date(now.getTime() + 24 * 3600 * 1000) };
  const pct = t.match(/(\d{1,2})\s*%\s*off/i);
  if (pct) return { ...base, rule: { type: 'percent', value: Number(pct[1]), minSubtotal } };
  const flat = t.match(/\$\s*(\d+(?:\.\d{1,2})?)\s*off/i) ?? t.match(/save\s+\$\s*(\d+(?:\.\d{1,2})?)/i);
  if (flat) return { ...base, rule: { type: 'flat', value: Number(flat[1]), minSubtotal } };
  if (/free delivery|\$0(?:\.00)? delivery/i.test(t)) return { ...base, rule: { type: 'freeDelivery', value: 0, minSubtotal } };
  return undefined;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case/punctuation-insensitive containment used to match cart items to menu items. */
export function nameMatches(candidate: string, wanted: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const a = norm(candidate);
  const b = norm(wanted);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const ta = new Set(a.split(' '));
  const tb = b.split(' ');
  const hit = tb.filter((t) => ta.has(t)).length;
  return hit / tb.length >= 0.75;
}
