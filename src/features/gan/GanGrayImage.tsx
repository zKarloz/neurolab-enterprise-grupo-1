/** Vista reutilizable de un tensor de imagen en gris: real o generado. */
import { useEffect, useRef } from 'react'
import { Download } from 'lucide-react'
import { Button } from '../../components/ui/Button'

export function GanGrayImage({ pixels, size, label, fileName }: {
  pixels: Uint8Array
  size: number
  label: string
  fileName?: string
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context || pixels.length !== size * size) return
    const image = context.createImageData(size, size)
    pixels.forEach((pixel, index) => {
      image.data[index * 4] = pixel
      image.data[index * 4 + 1] = pixel
      image.data[index * 4 + 2] = pixel
      image.data[index * 4 + 3] = 255
    })
    context.putImageData(image, 0, 0)
  }, [pixels, size])

  function download() {
    const source = canvas.current
    if (!fileName || !source) return
    // Descarga local del lienzo; no se cargan imágenes a un servidor.
    source.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        link.click()
      } finally {
        // Retrasar la revocación hasta que el navegador inicie la descarga.
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    }, 'image/png')
  }

  return <figure className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-2 text-center">
    <canvas ref={canvas} width={size} height={size}
      className="mx-auto aspect-square w-full max-w-28 rounded bg-black"
      style={{ imageRendering: 'pixelated' }} aria-label={label}/>
    <figcaption className="text-xs text-[var(--muted)]">{label}</figcaption>
    {fileName && <Button type="button" variant="outline" onClick={download}><Download size={14}/> PNG</Button>}
  </figure>
}
