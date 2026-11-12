import { ArrowDown, Network } from 'lucide-react'
import { Surface } from '../../components/ui/Surface'
import type { GanNetworkDescription } from '../../ml/gan/architecture.ts'

/** Diagrama compartiendo Surface y los tokens Tailwind de ambos temas. */
function NetworkCard({ title, description, network }: {
  title: string
  description: string
  network: GanNetworkDescription
}) {
  return <Surface className="min-w-0 space-y-4 p-5 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Network size={18}/><h3 className="text-lg font-semibold">{title}</h3></div>
      <span className="text-sm font-semibold tabular-nums">{network.totalParameters.toLocaleString('es-PE')} parámetros</span>
    </header>
    <p className="text-xs text-[var(--muted)]">{description}</p>
    <ol className="flex flex-col items-center">
      {network.layers.map((layer, index) => <li className="flex w-full flex-col items-center" key={layer.id}>
        {index !== 0 && <ArrowDown className="my-2 text-[var(--muted)]" size={18} aria-hidden="true"/>}
        <div className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3">
          <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{layer.name}</strong><code>{layer.shape}</code></div>
          <p className="mt-1 text-xs text-[var(--muted)]">{layer.description}</p>
          <p className="mt-2 text-xs tabular-nums">{layer.parameters.toLocaleString('es-PE')} parámetros</p>
        </div>
      </li>)}
    </ol>
  </Surface>
}

/** En GAN hay DOS redes. Sus parámetros no se deben sumar como si fueran una única salida predictiva. */
export function GanDiagram({ generator, discriminator }: {
  generator: GanNetworkDescription
  discriminator: GanNetworkDescription
}) {
  return <div className="grid gap-5 lg:grid-cols-2">
    <NetworkCard title="Generador (G)" description="Transforma ruido aleatorio en una imagen candidata." network={generator}/>
    <NetworkCard title="Discriminador (D)" description="Estima si una imagen es real o generada; GAN-2 entrenará ambas redes alternadamente." network={discriminator}/>
  </div>
}
