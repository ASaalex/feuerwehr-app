import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

/**
 * Rendert HTML in einem versteckten iframe (identisch zum Browser-Druck)
 * und gibt das Ergebnis als base64-PDF zurück.
 */
export async function htmlToPdfBase64(htmlStr) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:0;width:794px;height:1123px;border:none;'
    document.body.appendChild(iframe)

    const capture = async () => {
      try {
        const doc = iframe.contentDocument
        // Tatsächliche Inhaltshöhe — kein künstliches Minimum
        const fullHeight = Math.max(
          doc.documentElement.scrollHeight,
          doc.body.scrollHeight
        )

        const canvas = await html2canvas(doc.body, {
          scale: 1.5,
          useCORS: true,
          backgroundColor: '#ffffff',
          width: 794,
          height: fullHeight,
          windowWidth: 794,
          windowHeight: fullHeight,
          scrollX: 0,
          scrollY: 0,
        })

        if (document.body.contains(iframe)) document.body.removeChild(iframe)

        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
        const pageW = 210
        const pageH = 297
        const imgW = pageW
        const imgH = (canvas.height * imgW) / canvas.width
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75)

        let y = 0
        while (y < imgH) {
          if (y > 0) pdf.addPage()
          pdf.addImage(dataUrl, 'JPEG', 0, -y, imgW, imgH)
          y += pageH
          // Nur neue Seite wenn noch mindestens 5mm Inhalt folgen
          if (imgH - y < 5) break
        }

        resolve(pdf.output('datauristring').split(',')[1])
      } catch (err) {
        if (document.body.contains(iframe)) document.body.removeChild(iframe)
        reject(err)
      }
    }

    iframe.onload = () => setTimeout(capture, 300)

    // window.print() entfernen damit kein Druckdialog aufgeht
    const cleanHtml = htmlStr.replace(/<script[\s\S]*?<\/script>/gi, '')
    iframe.contentDocument.open()
    iframe.contentDocument.write(cleanHtml)
    iframe.contentDocument.close()
  })
}
