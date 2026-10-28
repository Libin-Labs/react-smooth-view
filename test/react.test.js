import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as element, createRef, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { performance as nodePerformance } from 'node:perf_hooks';
import Animate, { AnimateGroup, useAnimate, useInView } from '../src/index.js';

let dom;
let root;
let container;
let frames;
let clock;
let handle;
let observers;
let mediaListeners;
let reduced;
const originals = new Map();

function replaceGlobal(name, value) {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}

beforeEach(() => {
  dom = new JSDOM('<!doctype html><div id="root"></div>');
  frames = new Map();
  observers = [];
  mediaListeners = new Set();
  reduced = false;
  clock = 0;
  handle = 0;
  replaceGlobal('window', dom.window);
  replaceGlobal('document', dom.window.document);
  replaceGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  replaceGlobal('performance', new Proxy(nodePerformance, {
    get(target, property) {
      if (property === 'now') return () => clock;
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }));
  replaceGlobal('requestAnimationFrame', (callback) => { frames.set(++handle, callback); return handle; });
  replaceGlobal('cancelAnimationFrame', (id) => frames.delete(id));
  replaceGlobal('IntersectionObserver', class {
    constructor(callback, options) { this.callback = callback; this.options = options; this.disconnected = false; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
    emit(intersectionRatio, isIntersecting = intersectionRatio > 0) {
      this.callback([{ target: this.target, intersectionRatio, isIntersecting }]);
    }
  });
  window.matchMedia = () => ({ get matches() { return reduced; }, addEventListener: (_, listener) => mediaListeners.add(listener), removeEventListener: (_, listener) => mediaListeners.delete(listener) });
  container = document.getElementById('root');
  root = createRoot(container);
});

afterEach(async () => {
  replaceGlobal('window', dom.window);
  replaceGlobal('document', dom.window.document);
  await act(() => root.unmount());
  dom.window.close();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  originals.clear();
});

const render = (content) => act(() => root.render(content));
async function tick(time) {
  clock = time;
  const pending = [...frames.values()];
  frames.clear();
  await act(() => pending.forEach((callback) => callback(time)));
}
const animation = (props = {}) => element(Animate, { from: { opacity: 0 }, to: { opacity: 1 }, duration: 100, easing: 'linear', ...props }, element('section', { style: { color: 'red' } }, 'Content'));

test('Animate merges styles, delays, ends exactly once and preserves child and forwarded refs', async () => {
  const childRef = createRef();
  const forwardedRef = createRef();
  const events = [];
  await render(element(Animate, { from: 0, to: 1, attributeName: 'opacity', duration: 100, begin: 50, easing: 'linear', ref: forwardedRef, onAnimationStart: () => events.push('start'), onAnimationEnd: () => events.push('end') }, element('div', { ref: childRef, style: { color: 'red' } })));
  const node = container.firstChild;
  assert.equal(childRef.current, node);
  assert.equal(forwardedRef.current, node);
  assert.equal(node.style.color, 'red');
  await tick(25);
  assert.deepEqual(events, []);
  await tick(100);
  assert.equal(node.style.opacity, '0.5');
  await tick(150);
  assert.equal(node.style.opacity, '1');
  assert.deepEqual(events, ['start', 'end']);
  assert.equal(frames.size, 0);
  await render(null);
  assert.equal(childRef.current, null);
  assert.equal(forwardedRef.current, null);
});

test('full visibility waits for threshold and once keeps the finished style off screen', async () => {
  await render(animation({ viewport: { amount: 'all' } }));
  const observer = observers.at(-1);
  assert.equal(observer.options.threshold, 1);
  assert.equal(frames.size, 0);
  await act(() => observer.emit(0.9));
  assert.equal(frames.size, 0);
  await act(() => observer.emit(1));
  assert.equal(observer.disconnected, true);
  await tick(100);
  assert.equal(container.firstChild.style.opacity, '1');
  await act(() => observer.emit(0));
  assert.equal(container.firstChild.style.opacity, '1');
});

test('once false resets, cancels and replays on viewport reentry', async () => {
  await render(animation({ viewport: { once: false, amount: 0.25, rootMargin: '20px' } }));
  const observer = observers.at(-1);
  assert.equal(observer.options.rootMargin, '20px');
  await act(() => observer.emit(0.5));
  await tick(50);
  assert.equal(container.firstChild.style.opacity, '0.5');
  await act(() => observer.emit(0));
  assert.equal(container.firstChild.style.opacity, '0');
  assert.equal(frames.size, 0);
  await act(() => observer.emit(0.5));
  await tick(150);
  assert.equal(container.firstChild.style.opacity, '1');
});

test('render props attach viewport ref and expose replay and cancel controls', async () => {
  let controls;
  await render(element(Animate, { from: { opacity: 0 }, to: { opacity: 1 }, viewport: true, duration: 100, easing: 'linear' }, (style, current) => {
    controls = current;
    return element('div', { ref: current.ref, style });
  }));
  await act(() => observers.at(-1).emit(1));
  await tick(50);
  await act(() => controls.cancel());
  assert.equal(container.firstChild.style.opacity, '0.5');
  assert.equal(frames.size, 0);
  await act(() => controls.replay());
  assert.equal(container.firstChild.style.opacity, '0');
  await tick(150);
  assert.equal(container.firstChild.style.opacity, '1');
});

test('equivalent inline options and callback updates do not restart an animation', async () => {
  const events = [];
  await render(animation({ onAnimationEnd: () => events.push('old') }));
  await tick(50);
  await render(animation({ onAnimationEnd: () => events.push('new') }));
  assert.equal(container.firstChild.style.opacity, '0.5');
  await tick(100);
  assert.deepEqual(events, ['new']);
});

test('disabled animation renders final styles; canBegin gates playback', async () => {
  await render(animation({ isActive: false }));
  assert.equal(container.firstChild.style.opacity, '1');
  assert.equal(frames.size, 0);
  await render(animation({ canBegin: false }));
  assert.equal(container.firstChild.style.opacity, '0');
  await render(animation());
  await tick(100);
  assert.equal(container.firstChild.style.opacity, '1');
});

test('reduced motion skips frames and cleans up media subscriptions', async () => {
  reduced = true;
  const events = [];
  await render(animation({ onAnimationEnd: () => events.push('end') }));
  assert.equal(container.firstChild.style.opacity, '1');
  assert.equal(frames.size, 0);
  assert.deepEqual(events, ['end']);
  await render(null);
  assert.equal(mediaListeners.size, 0);
});

test('missing IntersectionObserver fails open; useInView supports an independent target', async () => {
  replaceGlobal('IntersectionObserver', undefined);
  function Consumer() {
    const { ref, inView } = useInView();
    const { style } = useAnimate({ from: { opacity: 0 }, to: { opacity: 1 }, duration: 100, canBegin: inView });
    return element('div', { ref, style });
  }
  await render(element(Consumer));
  await tick(100);
  assert.equal(container.firstChild.style.opacity, '1');
});

test('StrictMode and unmount cancel pending work without end callbacks', async () => {
  let ends = 0;
  await render(element(StrictMode, null, animation({ viewport: true, onAnimationEnd: () => { ends += 1; } })));
  await act(() => observers.at(-1).emit(1));
  await tick(25);
  await render(null);
  assert.equal(frames.size, 0);
  assert.ok(observers.every((observer) => observer.disconnected));
  assert.equal(ends, 0);
});

test('group retains leaving nodes until completion and handles reentry', async () => {
  const enter = { from: { opacity: 0 }, to: { opacity: 1 }, duration: 100, easing: 'linear' };
  const leave = { from: { opacity: 1 }, to: { opacity: 0 }, duration: 100, easing: 'linear' };
  const group = (keys) => element(AnimateGroup, { appear: enter, enter, leave, component: 'ul', className: 'items' }, keys.map((key) => element('li', { key }, key)));
  await render(group(['a']));
  await tick(100);
  await render(group(['a', 'b']));
  await tick(200);
  await render(group(['b']));
  assert.equal(container.querySelectorAll('li').length, 2);
  await tick(250);
  await render(group(['a', 'b']));
  await tick(350);
  assert.equal(container.querySelectorAll('li').length, 2);
  await render(group(['b']));
  await tick(450);
  assert.equal(container.querySelectorAll('li').length, 1);
  assert.equal(container.querySelector('li').textContent, 'b');
});

test('server rendering works without browser globals and emits initial styles', () => {
  replaceGlobal('window', undefined);
  replaceGlobal('document', undefined);
  const html = renderToString(animation({ viewport: true }));
  assert.match(html, /opacity:0/);
  assert.match(html, /Content/);
});