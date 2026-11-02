/**
 * Tiny tagged template for building DOM strings safely.
 * Interpolations are escaped unless wrapped in raw() or produced by html`` itself.
 */
export class Raw { constructor(public readonly value: string) {} toString() { return this.value; } }
export const raw = (s: string) => new Raw(s);

export function escape(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += render(values[i]);
  });
  return new Raw(out);
}

function render(v: unknown): string {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return escape(v);
}

/** Parses an html`` result into a DocumentFragment. */
export function fragment(r: Raw): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = r.value;
  return t.content;
}

/** Replaces the children of `mount` with the rendered template. */
export function mountHtml(mount: HTMLElement, r: Raw): void {
  mount.replaceChildren(fragment(r));
}

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
