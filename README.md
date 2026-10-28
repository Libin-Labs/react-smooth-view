# @lp-labs/react-smooth-view

A small React animation library inspired by react-smooth, with viewport triggers built in. No runtime dependencies other than the application's React peer dependency. No CSS bundle, animation framework, observer polyfill, or wrapper elements required.

Supports React 18+; ships tree-shakeable ESM, CommonJS, source maps, and TypeScript declarations.

## Installation

```sh
npm install @lp-labs/react-smooth-view
```

React 18 or later must be installed in your application. No additional runtime dependencies or stylesheet imports are required.

## Animate On Screen

```jsx
import Animate from '@lp-labs/react-smooth-view';

export function Section() {
  return (
    <Animate
      from={{ opacity: 0, transform: 'translateY(32px)' }}
      to={{ opacity: 1, transform: 'translateY(0px)' }}
      duration={600}
      easing="ease-out"
      viewport={{ amount: 0.2, once: true }}
    >
      <section>Section content</section>
    </Animate>
  );
}
```

`viewport` starts playback when any part of the target intersects the viewport. Use `viewport={{ amount: 'all' }}` to wait until the **entire element** is visible. An element taller than the viewport cannot become fully visible: use `'some'` or a numeric ratio for large sections.

`once: true` is the default. Set `once: false` to reset to the initial style when the element leaves the visibility threshold and replay when it reenters. `root` accepts a scroll container; `rootMargin` expands or contracts the observer boundary, for example `'0px 0px -80px 0px'`.

The observed target is the animated element, including its transform. To observe an untransformed section instead, combine the hooks below. IntersectionObserver measures geometric intersection, not whether another element visually covers the target.

## Animate API

| Prop | Default | Behavior |
| --- | --- | --- |
| `from`, `to` | `{}` | Initial and final style objects, or scalar values with `attributeName` |
| `attributeName` | none | Style property for scalar values, e.g. `opacity` |
| `duration` | `1000` | Duration in milliseconds; also the default duration for each keyframe segment |
| `begin` | `0` | Delay in milliseconds, measured after playback becomes eligible |
| `easing` | `'ease'` | CSS timing keyword, `cubic-bezier(...)`, `steps(n, start/end)`, or a progress function |
| `steps` | `[]` | Keyframes; replaces `to` when nonempty |
| `isActive` | `true` | When false, cancel playback and immediately show final styles |
| `canBegin` | `true` | When false, cancel playback and reset to initial styles |
| `viewport` | `false` | `true` or `{ once, amount, root, rootMargin }` |
| `respectReducedMotion` | `true` | Respect `prefers-reduced-motion`; show final styles without animated frames |
| `onAnimationStart` | none | Called when the delay ends and playback starts |
| `onAnimationEnd` | none | Called once after successful completion, not cancellation |
| `children` | required | One ref-capable React element, or a render function |

Existing child styles and refs are preserved; animated properties take precedence. No wrapper is inserted. Custom components must forward their ref to a DOM element and apply the supplied style. Fragments are not animation targets.

Changing styles, easing, timing, steps, or activation gates restarts playback from the configured initial style. Structurally equivalent inline style objects and callback changes do not restart playback. This implementation deliberately restarts instead of automatically retargeting from a partially animated value.

## Keyframes

```jsx
<Animate
  viewport
  steps={[
    { style: { opacity: 0, transform: 'translateX(0px)' } },
    { style: { opacity: 1 }, duration: 300, easing: 'ease-out' },
    {
      style: { transform: 'translateX(120px)' },
      duration: 600,
      onAnimationEnd: () => console.log('Movement completed'),
    },
  ]}
>
  <div>Animated item</div>
</Animate>
```

The first step defines the initial style and has no duration or completion event. Each later step merges its style into the preceding step, then animates for its own duration. Set explicit initial values for properties you want interpolated. Zero-duration segments apply immediately; negative durations and delays are clamped to zero.

## Render Props

```jsx
<Animate from={{ opacity: 0 }} to={{ opacity: 1 }} viewport>
  {(style, { ref, replay, cancel, isAnimating }) => (
    <article ref={ref} style={style}>
      <button onClick={replay}>Replay</button>
      <button onClick={cancel} disabled={!isAnimating}>Stop</button>
    </article>
  )}
</Animate>
```

The first argument is the interpolated style, as in react-smooth. The optional second argument exposes `ref`, `inView`, `style`, `isAnimating`, `replay()`, and `cancel()`. Attach `ref` to the target when using `viewport` or a forwarded ref. `cancel()` freezes the current style without firing completion; `replay()` restarts with the configured delay and gates. `isAnimating` is false during the initial delay.

## Hooks

```jsx
import { useAnimate, useInView } from '@lp-labs/react-smooth-view';

function Reveal() {
  const { ref, inView } = useInView({ amount: 0.3, once: false });
  const { style, replay, cancel } = useAnimate({
    from: { opacity: 0, transform: 'translateY(24px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    duration: 500,
    canBegin: inView,
  });

  return (
    <section ref={ref}>
      <div style={style}>Animated content</div>
      <button onClick={replay}>Replay</button>
      <button onClick={cancel}>Stop</button>
    </section>
  );
}
```

`useAnimate(options)` accepts animation options, not `viewport` or children. It returns `{ style, isAnimating, replay, cancel }`. `useInView(options)` returns `{ ref, inView, entry }` and additionally supports `enabled: false`. `useReducedMotion()` exposes the user's current motion preference.

## Easing Helpers

```jsx
import { configureBezier, configureSpring } from '@lp-labs/react-smooth-view';

const bezier = configureBezier(0.2, 0.8, 0.2, 1);
const spring = configureSpring({ stiff: 170, damping: 20, mass: 1 });

<Animate from={{ opacity: 0 }} to={{ opacity: 1 }} easing={bezier}>
  <div />
</Animate>;
```

Define custom easing functions outside the component, or retain their identity between renders. A spring is a duration-based analytical easing curve, not a velocity-preserving physics simulation: it may overshoot and is forced to the exact target at completion. `duration` determines total playback time. Supported string timings are `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, `cubic-bezier(...)`, and `steps(n, start/end/jump-start/jump-end)`. Unsupported easing strings throw a descriptive error.

## Enter And Leave

```jsx
import { AnimateGroup } from '@lp-labs/react-smooth-view';

<AnimateGroup
  component="ul"
  appear={{ from: { opacity: 0 }, to: { opacity: 1 }, duration: 250 }}
  enter={{ from: { opacity: 0 }, to: { opacity: 1 }, duration: 250 }}
  leave={{ from: { opacity: 1 }, to: { opacity: 0 }, duration: 200 }}
>
  {items.map((item) => <li key={item.id}>{item.label}</li>)}
</AnimateGroup>;
```

Children must have unique, explicit keys and accept styles/refs. Removed items remain mounted until `leave` completes. A key that reenters cancels its pending removal. Omitted transitions apply immediately. The default container is a Fragment; set `component` for a real container and pass `className`, `style`, or `id`. Supply `from` explicitly for exit transitions; this version does not capture computed DOM styles. Avoid viewport gating or `canBegin: false` on leave transitions, since an off-screen item would otherwise wait indefinitely for completion.

## Scope And Performance

- Uses native `requestAnimationFrame` and `IntersectionObserver`; no production dependencies are bundled. React is external and required from the host application.
- Interpolates numbers, matching numeric CSS strings such as transforms and unit values, hex colors, and comma-separated `rgb()`/`rgba()` colors. CSS custom properties work too.
- String units and structure must match. Named colors, `auto`, unrelated transform lists, gradients with incompatible structures, and other incompatible values switch only at the segment's end. No computed-style or unit-conversion engine is included.
- Animates CSS styles, not arbitrary SVG DOM attributes. Render props can map numeric values onto SVG attributes themselves.
- This is a similar API, not a guaranteed drop-in replacement. Legacy vendor-prefix helpers are omitted because current target browsers support unprefixed animation properties.
- Prefer `opacity` and `transform`; layout properties such as `height` cost more browser work. Render-prop support uses React updates per frame, so this is not intended for thousands of simultaneous animated nodes.
- SSR emits initial styles without accessing browser globals; observation and playback start after mount. Viewport content can remain hidden before hydration. Without IntersectionObserver, playback starts immediately after mounting.
- Reduced motion skips the delay and animated frames, then invokes start, step-completion, and end callbacks. Unmounting cleans up animation frames, observers, and media-query listeners.
- The complete minified ESM entry is approximately **3.6 KiB gzipped**, excluding React. Tree shaking can reduce consumer bundles further; size may vary between releases.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.