import { useEffect, useRef } from 'react'

/** Miniatura exacta de los píxeles normalizados que utiliza TensorFlow.js. */
export function CnnPixelCanvas({ pixels, size, label }: { pixels: Uint8Array; size: number; label: string }) {
  const reference = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = reference.current?.getContext('2d')
    if (!context || pixels.length !== size * size) return
    const image = context.createImageData(size, size)
    pixels.forEach((value, index) => {
      image.data[index * 4] = value
      image.data[index * 4 + 1] = value
      image.data[index * 4 + 2] = value
      image.data[index * 4 + 3] = 255
    })
    context.putImageData(image, 0, 0)
  }, [pixels, size])
  return <canvas ref={reference} role="img" aria-label={label} width={size} height={size}
    style={{ imageRendering: 'pixelated' }} className="aspect-square w-full max-w-24 rounded-lg border border-[var(--line)] bg-black" />
}
