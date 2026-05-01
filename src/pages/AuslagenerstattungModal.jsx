import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const LEER_ZEILE = { firma: '', gegenstand: '', preis: '' }

export default function AuslagenerstattungModal({ onClose }) {
  const { profile } = useAuth()

  const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const [form, setForm] = useState({
    absender: `${profile?.vorname ?? ''} ${profile?.nachname ?? ''}`.trim(),
    iban: '',
    bic: '',
    datum: heute,
    zeilen: Array(8).fill(null).map(() => ({ ...LEER_ZEILE })),
  })

  function setZeile(idx, field, value) {
    setForm(f => {
      const zeilen = [...f.zeilen]
      zeilen[idx] = { ...zeilen[idx], [field]: value }
      return { ...f, zeilen }
    })
  }

  const gesamt = form.zeilen.reduce((sum, z) => {
    const val = parseFloat(z.preis.replace(',', '.')) || 0
    return sum + val
  }, 0)

  function formatEuro(val) {
    return val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  }

  function drucken() {
    const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Antrag auf Auslagenerstattung</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10pt; padding: 20mm 20mm 15mm 20mm; }
  .absender { margin-bottom: 30mm; font-size: 9.5pt; white-space: pre-line; }
  .empfaenger { margin-bottom: 12mm; font-size: 9.5pt; }
  h1 { font-size: 14pt; font-weight: bold; margin-bottom: 4mm; }
  p { font-size: 9.5pt; margin-bottom: 3mm; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 5mm; }
  td, th { border: 1px solid #333; padding: 3px 5px; font-size: 9pt; }
  th { background: #f0f0f0; font-weight: bold; text-align: left; }
  .nr { width: 28px; text-align: center; }
  .preis { width: 80px; text-align: right; }
  .gesamt-row td { font-weight: bold; background: #f5f5f5; }
  .kontobox { margin-bottom: 5mm; }
  .kontobox table td { border: 1px solid #555; height: 18px; min-width: 14px; }
  .kontobox .label { border: none !important; padding: 2px 0; font-size: 8.5pt; background: none; }
  .iban-grid td { width: 14px; text-align: center; font-size: 8pt; }
  .sign-table { margin-top: 8mm; }
  .sign-table td { border: 1px solid #333; height: 35px; padding: 3px 6px; font-size: 8.5pt; vertical-align: bottom; }
  .hint { font-size: 8pt; margin-bottom: 4mm; }
  @media print { @page { size: A4; margin: 0; } body { padding: 18mm 18mm 12mm 18mm; } }
</style>
</head>
<body>

<div class="absender"><strong>Absender:</strong><br>${form.absender.replace(/\n/g, '<br>')}</div>

<div class="empfaenger">
  Gemeinde Grammetal<br>
  Schlossgasse 19<br>
  99428 Grammetal
</div>

<h1>Antrag auf Auslagenerstattung</h1>
<p>Ich bitte um Erstattung folgender Positionen (Beleg/e sind beigefuegt):</p>

<table>
  <tr>
    <th class="nr">Lfd.<br>Nr.</th>
    <th style="width:35%">Firma/Institution</th>
    <th>Gegenstand bzw. Verwendungszweck</th>
    <th class="preis">Bruttopreis</th>
  </tr>
  ${form.zeilen.map((z, i) => `
  <tr>
    <td class="nr">${i + 1}</td>
    <td>${z.firma}</td>
    <td>${z.gegenstand}</td>
    <td class="preis">${z.preis ? (parseFloat(z.preis.replace(',', '.')) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' &euro;' : ''}</td>
  </tr>`).join('')}
  <tr class="gesamt-row">
    <td colspan="3" style="text-align:right; padding-right:8px;">Gesamt</td>
    <td class="preis">${gesamt.toLocaleString('de-DE', { minimumFractionDigits: 2 })} &euro;</td>
  </tr>
</table>

<p>Ich bitte um Ueberweisung. Meine Kontoverbindung lautet:</p>

<table style="margin-bottom:3mm; width:auto;">
  <tr>
    <td style="border:none; padding:2px 0; font-size:8.5pt; white-space:nowrap;">
      IBAN (max. 22 Stellen) &nbsp;<strong>Angabe erforderlich</strong>
    </td>
  </tr>
  <tr>
    <td style="border:1px solid #555; padding: 4px 8px; font-size:10pt; min-width:200px; letter-spacing:2px;">
      ${form.iban}
    </td>
  </tr>
</table>

<table style="margin-bottom:5mm; width:auto;">
  <tr>
    <td style="border:none; padding:2px 0; font-size:8.5pt;">BIC (8 oder 11 Stellen)</td>
  </tr>
  <tr>
    <td style="border:1px solid #555; padding: 4px 8px; font-size:10pt; min-width:120px; letter-spacing:2px;">
      ${form.bic}
    </td>
  </tr>
</table>

<p class="hint">Die Sachliche und rechnerische Richtigkeit wird bestaetigt.</p>

<table class="sign-table">
  <tr>
    <td style="width:45%">${form.datum}</td>
    <td style="width:55%">&nbsp;</td>
  </tr>
  <tr>
    <td style="font-size:8pt; height:16px; border-top:none;">Datum</td>
    <td style="font-size:8pt; height:16px; border-top:none;">Unterschrift</td>
  </tr>
</table>

<script>window.onload = function() { window.print(); }</script>
</body>
</html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3>Antrag auf Auslagenerstattung</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>x</button>
        </div>

        <div className="form-group">
          <label>Absender</label>
          <textarea
            value={form.absender}
            onChange={e => setForm(f => ({ ...f, absender: e.target.value }))}
            placeholder="Name, Strasse, PLZ Ort"
            rows={3}
          />
        </div>

        {/* Positionen */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ marginBottom: 8, display: 'block' }}>Positionen</label>
          <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 90px', gap: 0, background: 'var(--gray-100)', padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Nr.</span>
              <span>Firma / Institution</span>
              <span>Gegenstand / Verwendungszweck</span>
              <span style={{ textAlign: 'right' }}>Preis €</span>
            </div>
            {form.zeilen.map((z, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 90px', gap: 4, padding: '4px 8px', borderTop: '1px solid var(--gray-100)', alignItems: 'center', background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                <span style={{ fontSize: 12, color: 'var(--gray-400)', textAlign: 'center' }}>{i + 1}</span>
                <input
                  value={z.firma}
                  onChange={e => setZeile(i, 'firma', e.target.value)}
                  placeholder="Firma..."
                  style={{ fontSize: 13, padding: '4px 6px' }}
                />
                <input
                  value={z.gegenstand}
                  onChange={e => setZeile(i, 'gegenstand', e.target.value)}
                  placeholder="Verwendungszweck..."
                  style={{ fontSize: 13, padding: '4px 6px' }}
                />
                <input
                  value={z.preis}
                  onChange={e => setZeile(i, 'preis', e.target.value)}
                  placeholder="0,00"
                  style={{ fontSize: 13, padding: '4px 6px', textAlign: 'right', fontFamily: 'var(--mono)' }}
                />
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 90px', padding: '8px 8px', borderTop: '2px solid var(--gray-200)', background: 'var(--gray-50)' }}>
              <span></span>
              <span></span>
              <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', paddingRight: 8 }}>Gesamt:</span>
              <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--gray-800)' }}>
                {formatEuro(gesamt)}
              </span>
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>IBAN</label>
            <input
              value={form.iban}
              onChange={e => setForm(f => ({ ...f, iban: e.target.value.toUpperCase() }))}
              placeholder="DE00 0000 0000 0000 0000 00"
              style={{ fontFamily: 'var(--mono)', letterSpacing: 1 }}
              maxLength={22}
            />
          </div>
          <div className="form-group">
            <label>BIC</label>
            <input
              value={form.bic}
              onChange={e => setForm(f => ({ ...f, bic: e.target.value.toUpperCase() }))}
              placeholder="XXXXXXXX"
              style={{ fontFamily: 'var(--mono)', letterSpacing: 1 }}
              maxLength={11}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Datum</label>
          <input
            value={form.datum}
            onChange={e => setForm(f => ({ ...f, datum: e.target.value }))}
            style={{ maxWidth: 160 }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--gray-100)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={drucken}>
            🖨️ Drucken / Als PDF speichern
          </button>
        </div>
      </div>
    </div>
  )
}
