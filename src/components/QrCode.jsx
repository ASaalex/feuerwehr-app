import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export default function QrCode({ value, size = 220 }) {
  const [dataUrl, setDataUrl] = useState(null)

  useEffect(() => {
    let aktiv = true
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: '#1F2937', light: '#FFFFFF' } })
      .then(url => { if (aktiv) setDataUrl(url) })
      .catch(() => { if (aktiv) setDataUrl(null) })
    return () => { aktiv = false }
  }, [value, size])

  if (!dataUrl) return <div style={{ width: size, height: size, background: 'var(--gray-100)', borderRadius: 12 }} />
  return <img src={dataUrl} alt="QR-Code" width={size} height={size} style={{ borderRadius: 12, background: 'white', padding: 8 }} />
}
