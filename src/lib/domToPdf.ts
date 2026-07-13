import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

/**
 * Rasterizes a DOM element (via html2canvas) into a multi-page A4 jsPDF.
 * Used where jsPDF's text-drawing API can't be trusted to render the content faithfully —
 * e.g. Bangla glyphs (no CJK/Bengali font is embedded in jsPDF's default fonts) or inline
 * SVGs like the prescription QR code. Captures exactly what's on screen instead.
 */
export async function buildPdfFromElement(
  elementId: string,
  options: { onClone?: (clonedElement: HTMLElement) => void } = {}
): Promise<jsPDF> {
  const element = document.getElementById(elementId)
  if (!element) throw new Error(`Element #${elementId} not found`)

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    onclone: (clonedDoc) => {
      const clonedElement = clonedDoc.getElementById(elementId)
      if (clonedElement instanceof HTMLElement) {
        clonedElement.style.boxShadow = 'none'
        clonedElement.style.borderRadius = '0'
        clonedElement.style.margin = '0'
        options.onClone?.(clonedElement)
      }
    },
  })

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  const imgData = canvas.toDataURL('image/png')

  let heightLeft = imgHeight
  let position = 0
  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position -= pageHeight
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
  }

  return pdf
}
