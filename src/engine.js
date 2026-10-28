const clamp = (value) => Math.min(1, Math.max(0, value));

export function configureBezier(x1, y1, x2, y2) {
  if (![x1, y1, x2, y2].every(Number.isFinite) || x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    throw new RangeError('Bezier x coordinates must be between 0 and 1; all coordinates must be finite.');
  }
  const curve = (position, first, second) => 3 * (1 - position) ** 2 * position * first + 3 * (1 - position) * position ** 2 * second + position ** 3;
  return (progress) => {
    if (progress <= 0 || progress >= 1) return clamp(progress);
    let low = 0;
    let high = 1;
    let position = progress;
    for (let iteration = 0; iteration < 22; iteration += 1) {
      const current = curve(position, x1, x2);
      if (Math.abs(current - progress) < 0.0000001) break;
      if (current < progress) low = position;
      else high = position;
      position = (low + high) / 2;
    }
    return curve(position, y1, y2);
  };
}

export function configureSpring({ stiff = 170, damping = 26, mass = 1 } = {}) {
  if (![stiff, damping, mass].every(Number.isFinite) || stiff <= 0 || damping < 0 || mass <= 0) {
    throw new RangeError('Spring stiffness and mass must be positive; damping must be nonnegative.');
  }
  const frequency = Math.sqrt(stiff / mass);
  const ratio = damping / (2 * Math.sqrt(stiff * mass));
  return (progress) => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    if (ratio < 1) {
      const damped = frequency * Math.sqrt(1 - ratio * ratio);
      return 1 - Math.exp(-ratio * frequency * progress) * (Math.cos(damped * progress) + ratio * frequency / damped * Math.sin(damped * progress));
    }
    if (ratio === 1) return 1 - (1 + frequency * progress) * Math.exp(-frequency * progress);
    const root = Math.sqrt(ratio * ratio - 1);
    const slow = -frequency * (ratio - root);
    const fast = -frequency * (ratio + root);
    return 1 - (fast * Math.exp(slow * progress) - slow * Math.exp(fast * progress)) / (fast - slow);
  };
}

const easings = {
  linear: (progress) => progress,
  ease: configureBezier(0.25, 0.1, 0.25, 1),
  'ease-in': configureBezier(0.42, 0, 1, 1),
  'ease-out': configureBezier(0, 0, 0.58, 1),
  'ease-in-out': configureBezier(0.42, 0, 0.58, 1),
};

export function resolveEasing(easing = 'ease') {
  if (typeof easing === 'function') return easing;
  if (easings[easing]) return easings[easing];
  const bezier = /^cubic-bezier\(([^)]+)\)$/.exec(easing);
  if (bezier) {
    const coordinates = bezier[1].split(',').map(Number);
    if (coordinates.length === 4) return configureBezier(...coordinates);
  }
  const steps = /^steps\(\s*(\d+)\s*(?:,\s*(start|end|jump-start|jump-end))?\s*\)$/.exec(easing);
  if (steps && Number(steps[1]) > 0) {
    const count = Number(steps[1]);
    const start = steps[2] === 'start' || steps[2] === 'jump-start';
    return (progress) => Math.min(1, (Math.floor(progress * count) + (start ? 1 : 0)) / count);
  }
  throw new TypeError(`Unsupported easing: ${easing}`);
}

function normalizeColor(value) {
  return value.replace(/#([\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b/gi, (_, hex) => {
    const expanded = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    const channels = [0, 2, 4].map((offset) => parseInt(expanded.slice(offset, offset + 2), 16));
    return `rgba(${channels.join(',')},${expanded.length === 8 ? parseInt(expanded.slice(6), 16) / 255 : 1})`;
  }).replace(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/gi,
    (_, red, green, blue, alpha = '1') => `rgba(${red},${green},${blue},${alpha})`);
}

export function interpolateValue(from, to, progress) {
  if (progress === 0) return from;
  if (progress === 1) return to;
  if (typeof from === 'number' && typeof to === 'number') return from + (to - from) * progress;
  if (typeof from !== 'string' || typeof to !== 'string') return from;
  const start = normalizeColor(from);
  const end = normalizeColor(to);
  const pattern = /[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi;
  const startNumbers = start.match(pattern)?.map(Number);
  const endNumbers = end.match(pattern)?.map(Number);
  if (!startNumbers || !endNumbers || startNumbers.length !== endNumbers.length || start.replace(pattern, '#') !== end.replace(pattern, '#')) return from;
  let index = 0;
  return end.replace(pattern, () => {
    const current = index++;
    return String(Number((startNumbers[current] + (endNumbers[current] - startNumbers[current]) * progress).toFixed(5)));
  });
}

export function interpolateStyle(from, to, progress) {
  const result = { ...from };
  for (const key of Object.keys(to)) result[key] = interpolateValue(from[key], to[key], progress);
  return result;
}

export function normalizeStyle(value, attributeName) {
  if (value !== null && typeof value === 'object') return value;
  return attributeName && value !== undefined ? { [attributeName]: value } : {};
}

export function createTimeline({ from = {}, to = {}, steps = [], duration = 1000, easing = 'ease' }) {
  let style = { ...from };
  const initial = steps.length ? { ...style, ...steps[0].style } : style;
  const segments = [];
  let elapsed = 0;
  style = initial;
  const frames = steps.length ? steps.slice(1) : [{ style: to, duration, easing }];
  for (const frame of frames) {
    const next = { ...style, ...frame.style };
    const length = Math.max(0, frame.duration ?? duration);
    segments.push({ from: style, to: next, start: elapsed, duration: length, easing: resolveEasing(frame.easing ?? easing), onAnimationEnd: frame.onAnimationEnd });
    elapsed += length;
    style = next;
  }
  return { initial, final: style, segments, duration: elapsed };
}

export function runTimeline(timeline, { begin = 0, onUpdate, onStart, onEnd, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame, now = () => performance.now() }) {
  let cancelled = false;
  let started = false;
  let completedSegments = 0;
  let frame;
  const startTime = now() + Math.max(0, begin);
  function tick(timestamp) {
    if (cancelled) return;
    const elapsed = timestamp - startTime;
    if (elapsed < 0) { frame = requestFrame(tick); return; }
    if (!started) { started = true; onStart?.(); }
    if (cancelled) return;
    for (const segment of timeline.segments) {
      if (elapsed < segment.start) break;
      const progress = segment.duration ? clamp((elapsed - segment.start) / segment.duration) : 1;
      onUpdate(interpolateStyle(segment.from, segment.to, progress === 1 ? 1 : segment.easing(progress)));
      if (cancelled) return;
      if (progress < 1) break;
    }
    while (completedSegments < timeline.segments.length) {
      const segment = timeline.segments[completedSegments];
      if (elapsed < segment.start + segment.duration) break;
      completedSegments += 1;
      segment.onAnimationEnd?.();
      if (cancelled) return;
    }
    if (elapsed >= timeline.duration) { onUpdate(timeline.final); onEnd?.(); }
    else frame = requestFrame(tick);
  }
  frame = requestFrame(tick);
  return () => { cancelled = true; cancelFrame(frame); };
}