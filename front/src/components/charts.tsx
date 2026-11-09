// Gráficos SVG livianos (sin dependencias). Colores desde tokens CSS.
import { useState } from 'react'

export interface BarDatum {
  label: string
  value: number
  highlight?: boolean
}

export function BarChart({ data, height = 190, unit = '' }: { data: BarDatum[]; height?: number; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const nice = niceMax(max)
  const W = 640
  const H = height
  const padL = 34
  const padB = 24
  const padT = 10
  const innerW = W - padL - 6
  const innerH = H - padB - padT
  const slot = innerW / Math.max(1, data.length)
  const bw = Math.min(34, slot * 0.62)
  const ticks = [0, 0.5, 1].map((f) => Math.round(nice * f))
  const labelEvery = Math.ceil(data.length / 10)

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico de barras">
        {ticks.map((t) => {
          const y = padT + innerH - (t / nice) * innerH
          return (
            <g key={t}>
              <line x1={padL} x2={W} y1={y} y2={y} className="grid" />
              <text x={padL - 6} y={y + 4} className="axis" textAnchor="end">
                {t}
              </text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const h = (d.value / nice) * innerH
          const x = padL + i * slot + (slot - bw) / 2
          const y = padT + innerH - h
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={innerH} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={bw}
                height={Math.max(h, d.value > 0 ? 2 : 0)}
                rx={4}
                className={d.highlight ? 'bar bar-hi' : hover === i ? 'bar bar-hover' : 'bar'}
              />
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={H - 6} className="axis" textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="chart-tip" style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%` }}>
          <strong>
            {data[hover].value}
            {unit}
          </strong>
          <span>{data[hover].label}</span>
        </div>
      )}
    </div>
  )
}

function niceMax(v: number) {
  if (v <= 5) return 5
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

/** Medidor semicircular (estilo "revenue gauge"). */
export function Gauge({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const v = Math.max(0, Math.min(100, value))
  const r = 70
  const cx = 90
  const cy = 86
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from / 100)
    const a1 = Math.PI * (1 - to / 100)
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy - r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy - r * Math.sin(a1)
    return `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`
  }
  const needle = Math.PI * (1 - v / 100)
  return (
    <div className="gauge">
      <svg viewBox="0 0 180 100" role="img" aria-label={`${label}: ${v}%`}>
        <path d={arc(0, 100)} className="gauge-track" />
        {v > 0 && <path d={arc(0, v)} className="gauge-fill" />}
        <line
          x1={cx}
          y1={cy}
          x2={cx + (r - 14) * Math.cos(needle)}
          y2={cy - (r - 14) * Math.sin(needle)}
          className="gauge-needle"
        />
        <circle cx={cx} cy={cy} r={5} className="gauge-hub" />
      </svg>
      <div className="gauge-value">{v}%</div>
      <div className="gauge-label">{label}</div>
      {sub && <div className="gauge-sub">{sub}</div>}
    </div>
  )
}

/** Barra apilada horizontal con leyenda. */
export function StackBar({ parts }: { parts: { label: string; value: number; cls: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div>
      <div className="stack" role="img" aria-label="Distribución">
        {parts.map((p) =>
          p.value > 0 ? (
            <span key={p.label} className={`stack-seg ${p.cls}`} style={{ flexGrow: p.value }} title={`${p.label}: ${p.value}`} />
          ) : null,
        )}
        {total === 0 && <span className="stack-seg fill-neutral" style={{ flexGrow: 1 }} />}
      </div>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.label}>
            <span className={`legend-swatch ${p.cls}`} />
            {p.label}
            <strong>{p.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}
