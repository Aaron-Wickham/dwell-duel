import { domMax } from 'motion/react'

// The nav pill's `layoutId` needs domMax's layout features; LazyMotion loads them after
// hydration, so they stay out of every page's first load.
export default domMax
