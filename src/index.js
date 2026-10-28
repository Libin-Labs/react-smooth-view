import { Children, Fragment, cloneElement, createElement, forwardRef, isValidElement, useCallback, useEffect, useRef, useState, version } from 'react';
import { createTimeline, normalizeStyle, runTimeline } from './engine.js';

export { configureBezier, configureSpring } from './engine.js';

function equal(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

function useStable(value) {
  const reference = useRef(value);
  if (!equal(reference.current, value)) reference.current = value;
  return reference.current;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

export function useInView({ once = true, amount = 'some', root = null, rootMargin = '0px', enabled = true } = {}) {
  const [node, setNode] = useState(null);
  const [inView, setInView] = useState(false);
  const [entry, setEntry] = useState(null);
  let threshold = amount;
  if (amount === 'all') threshold = 1;
  if (amount === 'some') threshold = 0;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new RangeError('Viewport amount must be "some", "all", or a number between 0 and 1.');
  const ref = useCallback((element) => setNode(element), []);
  useEffect(() => {
    setInView(false);
    setEntry(null);
    if (!enabled || !node) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!active) return;
      const current = entries.find((item) => item.target === node);
      if (!current) return;
      const visible = current.isIntersecting && current.intersectionRatio >= threshold;
      setEntry(current);
      setInView(visible);
      if (visible && once) { active = false; observer.disconnect(); }
    }, { root, rootMargin, threshold });
    observer.observe(node);
    return () => { active = false; observer.disconnect(); };
  }, [node, once, threshold, root, rootMargin, enabled]);
  return { ref, inView, entry };
}

export function useAnimate({ from, to, attributeName, steps = [], duration = 1000, begin = 0, easing = 'ease', isActive = true, canBegin = true, respectReducedMotion = true, onAnimationStart, onAnimationEnd } = {}) {
  const callbacks = useRef({ onAnimationStart, onAnimationEnd, steps });
  callbacks.current = { onAnimationStart, onAnimationEnd, steps };
  const config = useStable({
    from: normalizeStyle(from, attributeName), to: normalizeStyle(to, attributeName), duration, easing,
    steps: steps.map((step) => ({ style: step.style, duration: step.duration, easing: step.easing })),
  });
  const cached = useRef(null);
  if (!cached.current || cached.current.config !== config) {
    const timeline = createTimeline(config);
    timeline.segments.forEach((segment, index) => {
      segment.onAnimationEnd = () => callbacks.current.steps[index + 1]?.onAnimationEnd?.();
    });
    cached.current = { config, timeline };
  }
  const timeline = cached.current.timeline;
  const [style, setStyle] = useState(() => isActive ? timeline.initial : timeline.final);
  const [isAnimating, setIsAnimating] = useState(false);
  const [iteration, setIteration] = useState(0);
  const cancelRef = useRef(() => {});
  const reduced = useReducedMotion();
  const skipMotion = respectReducedMotion && reduced;
  useEffect(() => {
    setIsAnimating(false);
    setStyle(isActive ? timeline.initial : timeline.final);
    if (!isActive || !canBegin) return;
    if (skipMotion) {
      setStyle(timeline.final);
      callbacks.current.onAnimationStart?.();
      timeline.segments.forEach((segment) => segment.onAnimationEnd?.());
      callbacks.current.onAnimationEnd?.();
      return;
    }
    const stop = runTimeline(timeline, {
      begin,
      onUpdate: setStyle,
      onStart: () => { setIsAnimating(true); callbacks.current.onAnimationStart?.(); },
      onEnd: () => { setIsAnimating(false); callbacks.current.onAnimationEnd?.(); },
    });
    cancelRef.current = stop;
    return () => { stop(); cancelRef.current = () => {}; };
  }, [timeline, begin, isActive, canBegin, skipMotion, iteration]);
  const replay = useCallback(() => setIteration((value) => value + 1), []);
  const cancel = useCallback(() => { cancelRef.current(); setIsAnimating(false); }, []);
  let currentStyle = style;
  if (!canBegin) currentStyle = timeline.initial;
  if (!isActive) currentStyle = timeline.final;
  return { style: currentStyle, isAnimating, replay, cancel };
}

function assignRef(ref, node) {
  if (typeof ref === 'function') return ref(node);
  if (ref) ref.current = node;
}

export const Animate = forwardRef(function Animate({ children, viewport = false, ...options }, forwardedRef) {
  const viewportOptions = typeof viewport === 'object' && viewport !== null ? viewport : {};
  const { ref: viewportRef, inView } = useInView({ ...viewportOptions, enabled: Boolean(viewport) });
  const animation = useAnimate({ ...options, canBegin: (options.canBegin ?? true) && (!viewport || inView) });
  const child = typeof children === 'function' ? null : Children.only(children);
  const supportsRefCleanup = Number.parseInt(version, 10) >= 19;
  let childRef = null;
  if (child) childRef = supportsRefCleanup ? child.props.ref : child.ref;
  const ref = useCallback((node) => {
    viewportRef(node);
    const cleanupChild = assignRef(childRef, node);
    const cleanupForwarded = assignRef(forwardedRef, node);
    if (!supportsRefCleanup) return;
    return () => {
      viewportRef(null);
      if (typeof cleanupChild === 'function') cleanupChild(); else assignRef(childRef, null);
      if (typeof cleanupForwarded === 'function') cleanupForwarded(); else assignRef(forwardedRef, null);
    };
  }, [viewportRef, childRef, forwardedRef, supportsRefCleanup]);
  if (typeof children === 'function') return children(animation.style, { ...animation, ref, inView });
  if (!isValidElement(child) || child.type === Fragment) throw new TypeError('Animate requires a single ref-capable element or a render function.');
  return cloneElement(child, { style: { ...child.props.style, ...animation.style }, ref });
});

function keyedChildren(children) {
  const result = [];
  const keys = new Set();
  Children.forEach(children, (child) => {
    if (child === null || child === undefined || typeof child === 'boolean') return;
    if (!isValidElement(child) || child.key === null || keys.has(child.key)) throw new TypeError('AnimateGroup children must be elements with unique, explicit keys.');
    keys.add(child.key);
    result.push(child);
  });
  return result;
}

export function AnimateGroup({ children, appear, enter, leave, component = Fragment, ...containerProps }) {
  const [tracked, setTracked] = useState(() => ({ children, items: keyedChildren(children).map((child) => ({ key: child.key, child, phase: 'appear' })) }));
  if (tracked.children !== children) {
    const incoming = keyedChildren(children);
    const previous = new Map(tracked.items.map((item) => [item.key, item]));
    const nextKeys = new Set(incoming.map((child) => child.key));
    const items = incoming.map((child) => {
      const old = previous.get(child.key);
      return { key: child.key, child, phase: !old || old.phase === 'leave' ? 'enter' : old.phase };
    });
    tracked.items.forEach((item, index) => {
      if (!nextKeys.has(item.key) && leave) items.splice(index, 0, { ...item, phase: 'leave' });
    });
    setTracked({ children, items });
  }
  const configurations = { appear, enter, leave };
  const rendered = tracked.items.map((item) => {
    const config = configurations[item.phase];
    if (!config) return cloneElement(item.child, { key: item.key });
    return createElement(Animate, {
      ...config, key: item.key,
      onAnimationEnd: () => {
        config.onAnimationEnd?.();
        if (item.phase === 'leave') setTracked((current) => ({ ...current, items: current.items.filter((candidate) => candidate.key !== item.key || candidate.phase !== 'leave') }));
      },
    }, item.child);
  });
  return createElement(component, component === Fragment ? null : containerProps, rendered);
}

export default Animate;