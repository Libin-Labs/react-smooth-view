import test from 'node:test';
import assert from 'node:assert/strict';
import { configureBezier, configureSpring, createTimeline, interpolateValue, resolveEasing, runTimeline } from '../src/engine.js';

test('interpolates numbers, compatible CSS strings and colors; leaves incompatible values discrete', () => {
  assert.equal(interpolateValue(0, 10, 0.5), 5);
  assert.equal(interpolateValue('translate(0px, 20px)', 'translate(80px, 0px)', 0.5), 'translate(40px, 10px)');
  assert.equal(interpolateValue('#000', '#fff', 0.5), 'rgba(127.5,127.5,127.5,1)');
  assert.equal(interpolateValue('0px', '100%', 0.5), '0px');
  assert.equal(interpolateValue('none', 'block', 1), 'block');
});

test('easing endpoints, spring validation and CSS timing functions', () => {
  for (const easing of [configureBezier(0.1, 0.2, 0.8, 1), configureSpring(), configureSpring({ damping: 50 })]) {
    assert.equal(easing(0), 0);
    assert.equal(easing(1), 1);
    assert.ok(Number.isFinite(easing(0.5)));
  }
  assert.equal(resolveEasing('steps(4, end)')(0.3), 0.25);
  assert.equal(resolveEasing('steps(4, start)')(0), 0.25);
  assert.ok(Math.abs(resolveEasing('cubic-bezier(0,0,1,1)')(0.5) - 0.5) < 0.001);
  assert.throws(() => configureSpring({ mass: 0 }), RangeError);
  assert.throws(() => resolveEasing('unknown'), TypeError);
});

test('timeline preserves partial keyframes and respects delay, callbacks and cancellation', () => {
  const events = [];
  const timeline = createTimeline({ steps: [
    { style: { opacity: 0, height: 20 } },
    { style: { opacity: 1 }, duration: 100, easing: 'linear', onAnimationEnd: () => events.push('step') },
    { style: { height: 40 }, duration: 100, easing: 'linear' },
  ] });
  let callback;
  let latest;
  const stop = runTimeline(timeline, {
    begin: 50, now: () => 0,
    requestFrame: (next) => { callback = next; return 1; }, cancelFrame: () => events.push('cancel'),
    onUpdate: (style) => { latest = style; }, onStart: () => events.push('start'), onEnd: () => events.push('end'),
  });
  callback(20);
  assert.deepEqual(events, []);
  callback(100);
  assert.deepEqual(latest, { opacity: 0.5, height: 20 });
  callback(200);
  assert.deepEqual(latest, { opacity: 1, height: 30 });
  callback(300);
  assert.deepEqual(latest, { opacity: 1, height: 40 });
  assert.deepEqual(events, ['start', 'step', 'end']);
  stop();
  callback(400);
  assert.deepEqual(events, ['start', 'step', 'end', 'cancel']);
});