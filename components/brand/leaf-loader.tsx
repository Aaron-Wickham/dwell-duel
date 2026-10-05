import { DURATION } from '@/lib/ui/motion'
import { cn } from '@/lib/utils'
import { D_PATH, LEAF_ANGLES, LEAF_PATH } from './symbol-paths'

// The launch screen's mark as a small looping wait: the leaves pulse in turn. Decorative; whatever
// shows it says in words what's happening. Stills under reduced motion (globals.css).
export function LeafLoader({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={cn('size-6 shrink-0', className)}>
      <g transform="translate(50 50) translate(-55.5 -41.5)">
        {LEAF_ANGLES.map((angle, i) => (
          <path
            key={angle}
            d={LEAF_PATH}
            transform={`rotate(${angle} 50 50)`}
            className="leaf-pulse fill-lime"
            style={{ animationDelay: `${i * DURATION.fast}ms` }}
          />
        ))}
        <path d={D_PATH} fillRule="evenodd" className="fill-current" />
      </g>
    </svg>
  )
}
