// Strips light-gray/white backgrounds from logo images so they blend
// into the prescription paper instead of printing as a solid box.

const LIGHTNESS_MIN = 190
const GRAY_TOLERANCE = 24

export function stripLightBackground(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imageData.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    if (Math.min(r, g, b) > LIGHTNESS_MIN && Math.max(r, g, b) - Math.min(r, g, b) < GRAY_TOLERANCE) {
      d[i + 3] = 0
    }
  }
  ctx.putImageData(imageData, 0, 0)
}

/** Loads an image and returns a data URL with its light background removed. Falls back to the original src. */
export function cleanLogoSource(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(src)
          return
        }
        ctx.drawImage(img, 0, 0)
        stripLightBackground(canvas)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(src)
      }
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
}
