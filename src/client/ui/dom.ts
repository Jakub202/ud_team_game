type Attrs = Record<string, any>;
type Child = Node | string | number | null | undefined | false | Child[];

/** Tiny hyperscript helper: h('div.card#id', {onclick}, children) */
export function h(tag: string, attrs?: Attrs | Child, ...children: Child[]): HTMLElement {
  if (attrs instanceof Node || typeof attrs !== 'object' || Array.isArray(attrs) || attrs === null) {
    if (attrs !== undefined) children.unshift(attrs as Child);
    attrs = {};
  }
  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  for (const part of rest) {
    if (part.startsWith('.')) el.classList.add(part.slice(1));
    else if (part.startsWith('#')) el.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs as Attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function svgEl(markup: string): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGSVGElement;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag: string, attrs: Record<string, any> = {}, ...children: (SVGElement | string | null | undefined | false)[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (!c) continue;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Renders `**bold**` in rule text. */
export function richText(text: string): HTMLElement {
  const span = document.createElement('span');
  text.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (part.startsWith('**')) span.appendChild(h('strong', part.slice(2, -2)));
    else if (part) span.appendChild(document.createTextNode(part));
  });
  return span;
}

export function fmtTime(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
