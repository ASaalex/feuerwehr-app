import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { dienstreiseantragPdf } from '../lib/dienstreisePdf'

const REISEART_OPTIONEN = [
  { value: 'dienstreise', label: 'Dienstreise' },
  { value: 'fortbildung', label: 'Aus- und Fortbildungsreise' },
]

const ORT_OPTIONEN = [
  { value: 'wohnung', label: 'Wohnung' },
  { value: 'dienststelle', label: 'Dienststelle' },
  { value: 'aufenthaltsort', label: 'Vorübergeh. Aufenthaltsort' },
  { value: 'familienwohnort', label: 'Weiterer Familienwohnort' },
]

const BEFOERDERUNG_OPTIONEN = [
  { value: 'oeffentlich', label: 'Öffentliche Beförderungsmittel' },
  { value: 'flugzeug', label: 'Flugzeug' },
  { value: 'dienstfahrzeug_selbst', label: 'Dienstfahrzeug (Selbstfahrer)' },
  { value: 'dienstfahrzeug_fahrer', label: 'Dienstfahrzeug (mit Fahrer)' },
  { value: 'privat_kfz', label: 'Privates Kraftfahrzeug' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

const LEER_FORM = {
  reiseart: 'dienstreise',
  name: '',
  adresse: '',
  reiseziel: '',
  zweck: '',
  beginnOrt: 'wohnung',
  beginnDatum: '',
  beginnZeit: '',
  endeOrt: 'wohnung',
  endeDatum: '',
  endeZeit: '',
  befoerderung: '',
  befoerderungSonstigesText: '',
  bankname: '',
  iban: '',
  bic: '',
}

function ToggleGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={`btn btn-sm ${value === o.value ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function formatDatumUhrzeit(datum, zeit) {
  if (!datum) return ''
  const [y, m, d] = datum.split('-')
  return zeit ? `${d}.${m}.${y}, ${zeit} Uhr` : `${d}.${m}.${y}`
}

export default function DienstreiseantragModal({ onClose }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(LEER_FORM)
  const [loading, setLoading] = useState(true)
  const [mailStatus, setMailStatus] = useState(null)

  useEffect(() => {
    async function laden() {
      const { data } = await supabase.from('profiles')
        .select('vorname,nachname,strasse,plz,ort,iban,bankname')
        .eq('id', profile?.id).single()

      if (data) {
        const name = `${data.nachname ?? ''}, ${data.vorname ?? ''}`.trim().replace(/^,\s*/, '')
        const adresse = [
          data.plz && data.ort ? `${data.plz} ${data.ort}` : (data.plz ?? data.ort ?? ''),
          data.strasse,
        ].filter(Boolean).join(', ')

        setForm(f => ({
          ...f,
          name,
          adresse,
          bankname: data.bankname ?? '',
          iban: data.iban ?? '',
        }))
      }
      setLoading(false)
    }
    laden()
  }, [])

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function buildPdfForm() {
    return {
      ...form,
      beginnDatumUhrzeit: formatDatumUhrzeit(form.beginnDatum, form.beginnZeit),
      endeDatumUhrzeit: formatDatumUhrzeit(form.endeDatum, form.endeZeit),
    }
  }

  function dateiName() {
    const datumLabel = form.beginnDatum ? form.beginnDatum.replaceAll('-', '') : new Date().toISOString().slice(0, 10).replaceAll('-', '')
    return `Dienstreiseantrag_${datumLabel}.pdf`
  }

  async function lokalOeffnen() {
    try {
      const base64 = await dienstreiseantragPdf(buildPdfForm())
      const win = window.open('data:application/pdf;base64,' + base64, '_blank')
      if (!win) {
        const link = document.createElement('a')
        link.href = 'data:application/pdf;base64,' + base64
        link.download = dateiName()
        link.click()
      }
      onClose()
    } catch (err) {
      alert('Fehler beim Erstellen der PDF: ' + err.message)
    }
  }

  async function perMailDrucken() {
    if (!profile?.wehr_id) return alert('Du bist keiner Wache zugeordnet.')
    setMailStatus('sending')
    try {
      const base64 = await dienstreiseantragPdf(buildPdfForm())
      const { data, error } = await supabase.functions.invoke('resend-email', {
        body: {
          wehr_id: profile.wehr_id,
          datei_inhalt: base64,
          datei_name: dateiName(),
          titel: `Dienstreiseantrag ${form.name}`,
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

  const labelStyle = { fontSize: 12, marginBottom: 4 }
  const gruppe = { background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }
  const gruppenTitel = { fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>Dienstreiseantrag</h3>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>ThürRKG Anlage 2</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner"></div></div> : (
          <>
            <div style={gruppe}>
              <div style={gruppenTitel}>Art der Reise</div>
              <ToggleGroup options={REISEART_OPTIONEN} value={form.reiseart} onChange={v => set('reiseart', v)} />
            </div>

            <div style={gruppe}>
              <div style={gruppenTitel}>Antragsteller/in</div>
              <div className="form-group" style={{ margin: 0, marginBottom: 8 }}>
                <label style={labelStyle}>Name, Vorname</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={labelStyle}>PLZ, Wohnort, Straße, HsNr.</label>
                <input value={form.adresse} onChange={e => set('adresse', e.target.value)} />
              </div>
            </div>

            <div style={gruppe}>
              <div style={gruppenTitel}>Reiseziel und -zweck</div>
              <div className="form-group" style={{ margin: 0, marginBottom: 8 }}>
                <label style={labelStyle}>Reiseziel (Anschrift)</label>
                <input value={form.reiseziel} onChange={e => set('reiseziel', e.target.value)}
                  placeholder="z.B. Landesfeuerwehr- und Katastrophenschutzschule, ..." />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={labelStyle}>Zweck der Reise</label>
                <input value={form.zweck} onChange={e => set('zweck', e.target.value)} placeholder="z.B. Lehrgang Gruppenführer" />
              </div>
            </div>

            <div style={gruppe}>
              <div style={gruppenTitel}>Geplanter Reiseverlauf</div>

              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 6 }}>Beginn der Reise</div>
              <div style={{ marginBottom: 8 }}>
                <ToggleGroup options={ORT_OPTIONEN} value={form.beginnOrt} onChange={v => set('beginnOrt', v)} />
              </div>
              <div className="form-row" style={{ marginBottom: 16 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={labelStyle}>Datum</label>
                  <input type="date" value={form.beginnDatum} onChange={e => set('beginnDatum', e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={labelStyle}>Uhrzeit</label>
                  <input type="time" value={form.beginnZeit} onChange={e => set('beginnZeit', e.target.value)} />
                </div>
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 6 }}>Ende der Reise</div>
              <div style={{ marginBottom: 8 }}>
                <ToggleGroup options={ORT_OPTIONEN} value={form.endeOrt} onChange={v => set('endeOrt', v)} />
              </div>
              <div className="form-row" style={{ margin: 0 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={labelStyle}>Datum</label>
                  <input type="date" value={form.endeDatum} onChange={e => set('endeDatum', e.target.value)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={labelStyle}>Uhrzeit</label>
                  <input type="time" value={form.endeZeit} onChange={e => set('endeZeit', e.target.value)} />
                </div>
              </div>
            </div>

            <div style={gruppe}>
              <div style={gruppenTitel}>Beförderungsmittel</div>
              <ToggleGroup options={BEFOERDERUNG_OPTIONEN} value={form.befoerderung} onChange={v => set('befoerderung', v)} />
              {form.befoerderung === 'sonstiges' && (
                <div className="form-group" style={{ margin: 0, marginTop: 10 }}>
                  <label style={labelStyle}>Bezeichnung</label>
                  <input value={form.befoerderungSonstigesText} onChange={e => set('befoerderungSonstigesText', e.target.value)} placeholder="z.B. Fahrrad" />
                </div>
              )}
            </div>

            <div style={gruppe}>
              <div style={gruppenTitel}>Bankverbindung (Blatt 2)</div>
              <div className="form-group" style={{ margin: 0, marginBottom: 8 }}>
                <label style={labelStyle}>Geldinstitut (Bezeichnung, Ort)</label>
                <input value={form.bankname} onChange={e => set('bankname', e.target.value)} placeholder="z.B. Volksbank Weimar eG" />
              </div>
              <div className="form-row">
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={labelStyle}>IBAN</label>
                  <input value={form.iban} onChange={e => set('iban', e.target.value.toUpperCase())}
                    style={{ fontFamily: 'var(--mono)', letterSpacing: 1 }} maxLength={22} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={labelStyle}>BIC (nur bei ausländischer Bank)</label>
                  <input value={form.bic} onChange={e => set('bic', e.target.value.toUpperCase())}
                    style={{ fontFamily: 'var(--mono)', letterSpacing: 1 }} maxLength={11} />
                </div>
              </div>
            </div>

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
              <button className="btn btn-primary" onClick={lokalOeffnen}>PDF ansehen / lokal drucken</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
