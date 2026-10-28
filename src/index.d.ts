import type { CSSProperties, ElementType, ForwardRefExoticComponent, ReactElement, ReactNode, RefAttributes, RefCallback } from 'react';

export type AnimationStyle = CSSProperties & { [property: `--${string}`]: string | number };
export type Easing = 'linear' | 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | `cubic-bezier(${string})` | `steps(${string})` | ((progress: number) => number);
export interface AnimationStep {
  style: AnimationStyle;
  duration?: number;
  easing?: Easing;
  onAnimationEnd?: () => void;
}
export interface AnimationOptions {
  from?: AnimationStyle | string | number;
  to?: AnimationStyle | string | number;
  attributeName?: keyof AnimationStyle;
  duration?: number;
  begin?: number;
  easing?: Easing;
  steps?: readonly AnimationStep[];
  isActive?: boolean;
  canBegin?: boolean;
  respectReducedMotion?: boolean;
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
}
export interface ViewportOptions {
  once?: boolean;
  amount?: 'some' | 'all' | number;
  root?: Element | Document | null;
  rootMargin?: string;
}
export interface AnimationControls {
  style: AnimationStyle;
  isAnimating: boolean;
  replay: () => void;
  cancel: () => void;
}
export interface RenderControls extends AnimationControls {
  ref: RefCallback<HTMLElement | SVGElement>;
  inView: boolean;
}
export interface AnimateProps extends AnimationOptions {
  viewport?: boolean | ViewportOptions;
  children: ReactElement | ((style: AnimationStyle, controls: RenderControls) => ReactNode);
}
export const Animate: ForwardRefExoticComponent<AnimateProps & RefAttributes<HTMLElement | SVGElement>>;
export default Animate;
export function useAnimate(options?: AnimationOptions): AnimationControls;
export function useInView<T extends Element = HTMLElement>(options?: ViewportOptions & { enabled?: boolean }): {
  ref: RefCallback<T>;
  inView: boolean;
  entry: IntersectionObserverEntry | null;
};
export function useReducedMotion(): boolean;
export function configureBezier(x1: number, y1: number, x2: number, y2: number): (progress: number) => number;
export function configureSpring(options?: { stiff?: number; damping?: number; mass?: number }): (progress: number) => number;
export interface AnimateGroupProps {
  children?: ReactNode;
  appear?: AnimatePropsWithoutChildren;
  enter?: AnimatePropsWithoutChildren;
  leave?: AnimatePropsWithoutChildren;
  component?: ElementType;
  className?: string;
  style?: CSSProperties;
  id?: string;
}
export type AnimatePropsWithoutChildren = Omit<AnimateProps, 'children'>;
export function AnimateGroup(props: AnimateGroupProps): ReactElement;