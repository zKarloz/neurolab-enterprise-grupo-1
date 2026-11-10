import { useState } from 'react'
import { ArrowRight, Box, Grid3X3, Image as ImageIcon, Layers3, List, Network, Target } from 'lucide-react'
import type { CnnDiagram as Diagram, CnnLayerKind } from '../../ml/cnn/architecture'
import { Surface } from '../../components/ui/Surface'

const icons = {
  input: ImageIcon,
  conv2d: Layers3,
  pool: Grid3X3,
  flatten: List,
  dense: Network,
  output: Target,
} satisfies Record<CnnLayerKind, typeof ImageIcon>

/** Esquema real calculado a partir de las capas, no una ilustración estática. */
export function CnnDiagramView({ diagram }: { diagram: Diagram }) {
  const [selected, setSelected] = useState('')
  const layer = diagram.layers.find((item) => item.id === selected) ?? diagram.layers[0]
  return (
    <Surface className="min-w-0 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Esquema de la red neuronal</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">Selecciona una capa para consultar sus dimensiones y parámetros.</p>
        </div>
        <span className="rounded-full border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)]">{diagram.layers.length} capas visualizadas</span>
      </div>
      <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4" aria-label="Diagrama de capas CNN" role="group">
        <div className="flex min-w-max items-center gap-2 py-2">
          {diagram.layers.map((item, index) => {
            const Icon = icons[item.kind]
            const active = (layer?.id === item.id)
            return (
              <div key={item.id} className="flex items-center gap-2">
                {index > 0 && <ArrowRight size={18} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />}
                <button
                  type="button"
                  onClick={() => setSelected(item.id)}
                  aria-pressed={active}
                  aria-label={`${item.name}, salida ${item.shape}, ${item.parameters} parámetros`}
                  className={`flex min-h-[148px] w-[138px] flex-col items-center justify-center gap-2 rounded-xl border px-3 py-4 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${active ? 'border-[var(--focus)] bg-[var(--surface)] shadow-sm' : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--focus)]'}`}
                >
                  <div className="relative grid size-12 place-items-center rounded-xl bg-[var(--surface-muted)]">
                    {['conv2d', 'pool'].includes(item.kind) && <span className="absolute -right-1 -top-1 size-7 rounded-md border border-[var(--line)] bg-[var(--surface)] opacity-70" aria-hidden="true" />}
                    <Icon size={24} strokeWidth={1.7} className="relative text-[var(--ink)]" aria-hidden="true" />
                  </div>
                  <span className="text-sm font-semibold">{item.name}</span>
                  <span className="text-xs tabular-nums text-[var(--muted)]">{item.shape}</span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
      {layer && <div className="mt-4 grid gap-3 rounded-xl border border-[var(--line)] p-4 sm:grid-cols-[1fr_auto] sm:items-center" aria-live="polite">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold"><Box size={16} /> {layer.name}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{layer.details} · Salida: {layer.shape}</p>
        </div>
        <p className="text-sm tabular-nums"><strong>{layer.parameters.toLocaleString('es-PE')}</strong> <span className="text-xs text-[var(--muted)]">parámetros entrenables</span></p>
      </div>}
      <p className="mt-3 text-xs text-[var(--muted)]">Los conectores representan el flujo de tensores, no neuronas individuales. Los tamaños se calculan a partir de los filtros, kernels y pooling configurados.</p>
    </Surface>
  )
}
