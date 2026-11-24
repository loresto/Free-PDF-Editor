import type { ReactNode } from 'react'

type Props = {
  /** Page size in CSS pixels (already multiplied by zoom). */
  width: number
  height: number
  zoom: number
  children: ReactNode
}

const THICKNESS = 18
const STEP = 10 // points between minor ticks
const LABEL_STEP = 50 // points between numbered ticks

/**
 * Point rulers around a page. Ticks are drawn with gradients so the markup stays
 * small even for long pages; numbers repeat every 50 pt.
 */
export function Rulers({ width, height, zoom, children }: Props) {
  const minor = Math.max(4, STEP * zoom)
  const major = Math.max(12, LABEL_STEP * zoom)
  const labels: number[] = []
  for (let value = 0; value <= Math.max(width, height) / zoom; value += LABEL_STEP) labels.push(value)

  return (
    <div className="relative" style={{ paddingLeft: THICKNESS, paddingTop: THICKNESS }}>
      <div
        className="absolute left-0 top-0 rounded-tl border-r border-b border-zinc-200 bg-zinc-100"
        style={{ width: THICKNESS, height: THICKNESS }}
      />
      <div
        className="absolute top-0 border-b border-zinc-200 bg-zinc-50"
        style={{
          left: THICKNESS,
          width,
          height: THICKNESS,
          backgroundImage: `repeating-linear-gradient(to right, #a1a1aa 0 1px, transparent 1px ${minor}px), repeating-linear-gradient(to right, #71717a 0 1px, transparent 1px ${major}px)`,
          backgroundSize: '100% 3px, 100% 7px',
          backgroundPosition: 'left bottom, left bottom',
          backgroundRepeat: 'repeat-x, repeat-x',
        }}
      >
        {labels.map((value) => (
          <span
            key={value}
            className="pointer-events-none absolute top-0.5 text-[8px] leading-none text-zinc-400"
            style={{ left: Math.min(value * zoom + 2, width - 14) }}
          >
            {value}
          </span>
        ))}
      </div>
      <div
        className="absolute border-r border-zinc-200 bg-zinc-50"
        style={{
          left: 0,
          top: THICKNESS,
          width: THICKNESS,
          height,
          backgroundImage: `repeating-linear-gradient(to bottom, #a1a1aa 0 1px, transparent 1px ${minor}px), repeating-linear-gradient(to bottom, #71717a 0 1px, transparent 1px ${major}px)`,
          backgroundSize: '3px 100%, 7px 100%',
          backgroundPosition: 'right top, right top',
          backgroundRepeat: 'repeat-y, repeat-y',
        }}
      >
        {labels.map((value) => (
          <span
            key={value}
            className="pointer-events-none absolute left-0.5 text-[8px] leading-none text-zinc-400"
            style={{ top: Math.min(value * zoom + 1, height - 8) }}
          >
            {value}
          </span>
        ))}
      </div>
      {children}
    </div>
  )
}
