'use client'

// Adapted from the shadcn/ui chart component (Recharts v3), copied in rather than installed.
// Our colour tokens already switch with the theme, so the per-theme colour option is gone.
import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react'
import * as RechartsPrimitive from 'recharts'
import type { TooltipContentProps } from 'recharts'
import { cn } from '@/lib/utils'

export type ChartConfig = Record<string, { label?: ReactNode; color?: string }>

const ChartContext = createContext<{ config: ChartConfig } | null>(null)

function useChart() {
  const context = useContext(ChartContext)
  if (!context) throw new Error('useChart must be used within a <ChartContainer />')
  return context
}

export function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = { width: 320, height: 200 },
  ...props
}: ComponentProps<'div'> & {
  config: ChartConfig
  children: ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children']
  initialDimension?: { width: number; height: number }
}) {
  const uniqueId = useId()
  const chartId = `chart-${(id ?? uniqueId).replace(/[^a-zA-Z0-9_-]/g, '')}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          'flex justify-center text-xs [&_.recharts-layer]:outline-hidden [&_.recharts-surface]:overflow-visible [&_.recharts-surface]:outline-hidden',
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer initialDimension={initialDimension}>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colors = Object.entries(config).filter(([, item]) => item.color)
  if (!colors.length) return null
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart="${id}"] {\n${colors.map(([key, item]) => `  --color-${key}: ${item.color};`).join('\n')}\n}`,
      }}
    />
  )
}

export const ChartTooltip = RechartsPrimitive.Tooltip

export function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  className,
}: Partial<Pick<TooltipContentProps<number, string>, 'active' | 'payload' | 'label'>> & {
  labelFormatter?: (label: string | number | undefined) => ReactNode
  valueFormatter?: (value: number) => ReactNode
  className?: string
}) {
  const { config } = useChart()
  if (!active || !payload?.length) return null

  return (
    <div
      className={cn(
        'flex min-w-[150px] flex-col gap-1.5 rounded-control border border-line bg-surface px-3 py-2.5 text-ink shadow-card',
        className,
      )}
    >
      <span className="whitespace-nowrap text-xs font-bold text-ink2">{labelFormatter ? labelFormatter(label) : label}</span>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.name)
        const value = Number(item.value)
        return (
          <div key={key} className="flex items-center gap-2 text-sm">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="grow">{config[key]?.label ?? item.name}</span>
            <strong className="tabular-nums">{valueFormatter ? valueFormatter(value) : value}</strong>
          </div>
        )
      })}
    </div>
  )
}
