import { createElement, createRef } from 'react';
import Animate, { AnimateGroup, configureSpring, useAnimate, useInView } from '../src/index.js';

createElement(Animate, {
  from: { opacity: 0, transform: 'translateY(20px)', '--progress': 0 },
  to: { opacity: 1, transform: 'translateY(0px)', '--progress': 1 },
  viewport: { amount: 'all', once: false },
  easing: configureSpring(),
  ref: createRef<HTMLDivElement>(),
  children: createElement('div'),
});
createElement(AnimateGroup, { leave: { to: { opacity: 0 } }, children: [] });

function HookConsumer() {
  const { ref, inView } = useInView<HTMLDivElement>({ amount: 0.5 });
  const { style, replay, cancel } = useAnimate({ canBegin: inView, from: 0, to: 1, attributeName: 'opacity' });
  return createElement('div', { ref, style, onClick: replay, onDoubleClick: cancel });
}
void HookConsumer;