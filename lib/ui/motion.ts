// Script's copy of the motion tokens in app/globals.css, for Motion and WAAPI, which can't read
// CSS variables. tests/lib/ui/motion.test.ts fails when the two drift apart.

type Bezier = readonly [number, number, number, number]

export const EASE = {
  ios: [0.32, 0.72, 0, 1],
  pop: [0.34, 1.56, 0.64, 1],
} as const satisfies Record<string, Bezier>

// Milliseconds.
export const DURATION = {
  press: 120,
  fast: 150,
  hover: 180,
  enter: 210,
  slide: 280,
  page: 360,
  sheet: 450,
} as const

export type EaseName = keyof typeof EASE

export function cssEase(name: EaseName): string {
  return `cubic-bezier(${EASE[name].join(', ')})`
}

// Every sliding pill moves the same way: the desktop nav's, the phone tab bar's and SubNav's. A
// tween rather than a spring, because SubNav slides through WAAPI, which only takes a curve.
export const PILL_SLIDE = { duration: DURATION.slide, easing: cssEase('ios') } as const

// PILL_SLIDE as a Motion transition, for a `layoutId` pill.
export const PILL_TRANSITION = {
  type: 'tween',
  duration: DURATION.slide / 1000,
  ease: [...EASE.ios],
} as const
