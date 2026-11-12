import type { TaskView } from '../../shared/types';

export interface MinigameApi {
  send(answer: unknown): void;
}

export interface Minigame {
  el: HTMLElement;
  /** Server sent fresh progress for the same task. */
  update(task: TaskView): void;
  /** Server judged an answer. */
  onResult?(kind: 'progress' | 'done' | 'wrong' | 'expired'): void;
  /** Keyboard input while this panel is focused. Return true if handled. */
  key?(e: KeyboardEvent): boolean;
  destroy(): void;
}

export type MinigameFactory = (task: TaskView, api: MinigameApi) => Minigame;

let uid = 0;
export const nextId = (p: string) => `${p}${++uid}`;

/** Converts a pointer event to SVG viewBox coordinates. */
export function svgPoint(svg: SVGSVGElement, e: { clientX: number; clientY: number }) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const r = pt.matrixTransform(m.inverse());
  return { x: r.x, y: r.y };
}

export function mount(markup: string): { root: HTMLElement; svg: SVGSVGElement; controls: HTMLElement } {
  const root = document.createElement('div');
  root.className = 'mg';
  root.innerHTML = markup;
  const svg = root.querySelector('svg') as SVGSVGElement;
  let controls = root.querySelector('.mg-controls') as HTMLElement;
  if (!controls) {
    controls = document.createElement('div');
    controls.className = 'mg-controls';
    root.appendChild(controls);
  }
  return { root, svg, controls };
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = `btn ${cls}`.trim();
  b.type = 'button';
  b.innerHTML = label;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

export const $ = <T extends Element = SVGElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
