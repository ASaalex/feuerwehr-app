import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ausbilderentschaedigungPdf } from '../lib/formPdf'

const STUNDENSATZ = 17      // Euro pro Ausbildungsstunde
const MIN_PRO_STUNDE = 45   // eine Ausbildungsstunde = 45 Minuten
const LEER_TERMIN = { datum: '', minuten: '' }

export default function AusbilderentschaedigungModal({ onClose }) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [mailStatus, setMailStatus] = useState(null)

  const heute = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    ortsteil: '',
    ausbilder: '',
    bankname: '',
    kontoinhaber: '',
    iban: '',
    termine: Array(8).fill(null).map(() => ({ ...LEER_TERMIN })),
  })

  useEffect(() => {
    async function laden() {
      const { data } = await supabase.from('profiles')
        .select('vorname,nachname,strasse,plz,ort,iban,bankname,wehr:wehren(name)')
        .eq('id', profile?.id).single()

      if (data) {
        const wehrName = Array.isArray(data.wehr) ? data.wehr[0]?.name : data.wehr?.name
        const anschriftTeile = [
          data.strasse,
          data.plz && data.ort ? `${data.plz} ${data.ort}` : (data.plz ?? data.ort ?? '')
        ].filter(Boolean)
        const nameZeile = `${data.nachname ?? ''}, ${data.vorname ?? ''}`.trim().replace(/^,\s*/, '')

        setForm(f => ({
          ...f,
          ortsteil: wehrName ?? '',
          ausbilder: [nameZeile, ...anschriftTeile].filter(Boolean).join('\n'),
          kontoinhaber: nameZeile,
          bankname: data.bankname ?? '',
          iban: data.iban ?? '',
        }))
      }
      setLoading(false)
    }
    laden()
  }, [])

  function setTermin(idx, field, value) {
    setForm(f => {
      const termine = [...f.termine]
      termine[idx] = { ...termine[idx], [field]: value }
      return { ...f, termine }
    })
  }

  function addTermin() {
    setForm(f => ({ ...f, termine: [...f.termine, { ...LEER_TERMIN }] }))
  }

  function removeTermin(idx) {
    setForm(f => ({ ...f, termine: f.termine.filter((_, i) => i !== idx) }))
  }

  const gesamtMinuten = form.termine.reduce((sum, t) => sum + (parseFloat(t.minuten) || 0), 0)
  const stunden = gesamtMinuten / MIN_PRO_STUNDE
  const entschaedigung = stunden * STUNDENSATZ
  const anzahlAnlagen = form.termine.filter(t => t.datum).length

  function fmtDe(val, digits = 2) {
    return val.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  }

  function drucken() {
    const base64 = ausbilderentschaedigungPdf(form, STUNDENSATZ, MIN_PRO_STUNDE)
    const win = window.open('data:application/pdf;base64,' + base64, '_blank')
    if (!win) {
      const link = document.createElement('a')
      link.href = 'data:application/pdf;base64,' + base64
      link.download = `Ausbilderentschaedigung_${heute.replaceAll('-', '')}.pdf`
      link.click()
    }
    onClose()
  }

  async function perMailDrucken() {
    if (!profile?.wehr_id) return alert('Du bist keiner Wache zugeordnet.')
    setMailStatus('sending')
    try {
      const base64 = ausbilderentschaedigungPdf(form, STUNDENSATZ, MIN_PRO_STUNDE)
      const { data, error } = await supabase.functions.invoke('resend-email', {
        body: {
          wehr_id: profile.wehr_id,
          datei_inhalt: base64,
          datei_name: `Ausbilderentschaedigung_${heute.replaceAll('-', '')}.pdf`,
          titel: `Ausbilderentschaedigung ${heute}`,
        },
      })
      if (error || !data?.success) {
        setMailStatus(data?.error || error?.message || 'Unbekannter Fehler')
        setTimeout(() => setMailStatus(null), 6000)
      } else {
        setMailStatus('ok')
        setTimeout(() => { setMailStatus(null); onClose() }, 2000)
      }
    } catch (err) {
      setMailStatus(err.message || 'Fehler beim Erstellen')
      setTimeout(() => setMailStatus(null), 6000)
    }
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3>Antrag Ausbilderentschädigung</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>x</button>
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner"></div></div> : (
          <>
            {/* Antragsteller */}
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ausbilder</div>
              <div className="form-group" style={{ margin: 0, marginBottom: 8 }}>
                <label style={{ fontSize: 12 }}>Ortsteilfeuerwehr</label>
                <input value={form.ortsteil} onChange={e => setForm(f => ({ ...f, ortsteil: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>Name / Anschrift</label>
                <textarea value={form.ausbilder} onChange={e => setForm(f => ({ ...f, ausbilder: e.target.value }))} rows={3} />
              </div>
            </div>

            {/* Termine */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ margin: 0 }}>Ausbildungstermine</label>
                <button type="button" className="btn btn-sm btn-secondary" onClick={addTermin}>+ Termin</button>
              </div>
              <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 28px', gap: 0, background: 'var(--gray-100)', padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <span>Datum</span>
                  <span>Ausbildungszeit (min)</span>
                  <span></span>
                </div>
                {form.termine.map((t, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 28px', gap: 4, padding: '4px 8px', borderTop: '1px solid var(--gray-100)', alignItems: 'center', background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                    <input
                      type="date"
                      value={t.datum}
                      onChange={e => setTermin(i, 'datum', e.target.value)}
                      style={{ fontSize: 13, padding: '4px 6px' }}
                    />
                    <input
                      type="number"
                      min={0}
                      value={t.minuten}
                      onChange={e => setTermin(i, 'minuten', e.target.value)}
                      placeholder="min."
                      style={{ fontSize: 13, padding: '4px 6px', textAlign: 'right', fontFamily: 'var(--mono)' }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeTermin(i)}
                      disabled={form.termine.length <= 1}
                      title="Termin entfernen"
                      style={{ padding: 0, color: 'var(--gray-400)' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Bankdaten */}
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bankverbindung</div>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Bank</label>
                <input value={form.bankname} onChange={e => setForm(f => ({ ...f, bankname: e.target.value }))}
                  placeholder="z.B. Volksbank Weimar eG" />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12 }}>Kontoinhaber</label>
                  <input value={form.kontoinhaber} onChange={e => setForm(f => ({ ...f, kontoinhaber: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12 }}>IBAN</label>
                  <input value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value.toUpperCase() }))}
                    style={{ fontFamily: 'var(--mono)', letterSpacing: 1 }} maxLength={22} />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Anzahl beiliegender Ausbildungsnachweise</label>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)' }}>
                {anzahlAnlagen} <span style={{ fontWeight: 400, color: 'var(--gray-400)', fontSize: 12 }}>(automatisch je ausgefülltem Datum)</span>
              </div>
            </div>

            {/* Berechnung Vorschau */}
            {gesamtMinuten > 0 && (
              <div style={{ background: '#E1F5EE', border: '1px solid #A9DFBF', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#085041', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Berechnung ({MIN_PRO_STUNDE} min. = 1 Std., {STUNDENSATZ} €/Std.)</div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#085041' }}>Gesamtzeit</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#085041', fontFamily: 'var(--mono)' }}>{gesamtMinuten} min.</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#085041' }}>Ausbildungsstunden</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#085041', fontFamily: 'var(--mono)' }}>{fmtDe(stunden)} Std.</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#085041' }}>Entschädigung</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#085041', fontFamily: 'var(--mono)' }}>{fmtDe(entschaedigung)} €</div>
                  </div>
                </div>
              </div>
            )}

            {mailStatus && mailStatus !== 'sending' && mailStatus !== 'ok' && (
              <div className="alert alert-error" style={{ marginTop: 8 }}>{mailStatus}</div>
            )}
            {mailStatus === 'ok' && (
              <div className="alert alert-success" style={{ marginTop: 8 }}>✓ An Wachen-Drucker gesendet!</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--gray-100)', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
              <button
                className="btn btn-secondary"
                onClick={perMailDrucken}
                disabled={mailStatus === 'sending' || mailStatus === 'ok'}
              >
                {mailStatus === 'sending' ? (
                  <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />&nbsp;Senden...</>
                ) : mailStatus === 'ok' ? '✓ Gesendet' : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                      <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,7 12,13 2,7"/>
                    </svg>
                    Per Mail drucken
                  </>
                )}
              </button>
              <button className="btn btn-primary" onClick={drucken}>🖨️ Lokal drucken / PDF</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
