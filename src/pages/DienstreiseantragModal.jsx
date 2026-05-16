import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { dienstreiseantragPdf } from '../lib/dienstreisePdf'

function formatDatum(dateStr, timeStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return timeStr ? `${d}.${m}.${y} ${timeStr}` : `${d}.${m}.${y}`
}

const LEER_FORM = {
  art: 'dienstreise',
  dienststelle: '',
  name_vorname: '',
  dienstort: '',
  personal_nr: '',
  hausruf: '',
  wohnadresse: '',
  reiseziel_1: '',
  reiseziel_2: '',
  unterkunft: 'keine',
  beginn_von: 'wohnung',
  beginn_date: '',
  beginn_time: '',
  beginn_dienstgeschaeft_date: '',
  beginn_dienstgeschaeft_time: '',
  ende_an: 'wohnung',
  ende_date: '',
  ende_time: '',
  ende_dienstgeschaeft_date: '',
  ende_dienstgeschaeft_time: '',
  verbindung_urlaub: false,
  bahncard: 'nein',
  bahncard_art: '',
  befoerderungsmittel: 'oeffentlich',
  sonstiges_kfz: '',
  fahrkarte: '',
  platzkarte_hin: '',
  platzkarte_rueck: '',
  uebernachtung: false,
  uebernachtung_betrag: '',
  fruehstueck: 'nein',
  fruehstueck_betrag: '',
  hotelkontingent: 'nein',
  gruendung_uebernachtung: '',
  sonstige_kosten: '',
  mitfahrer: '',
  abschlag: 'nein',
  abschlag_betrag: '',
  geldinstitut: '',
  iban: '',
  bic: '',
}

export default function DienstreiseantragModal({ onClose }) {
  const { profile } = useAuth()
  const [form, setForm] = useState(LEER_FORM)
  const [mailStatus, setMailStatus] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function laden() {
      const { data: p } = await supabase
        .from('profiles')
        .select('vorname,nachname,strasse,plz,ort,iban,bic')
        .eq('id', profile?.id)
        .single()

      let wehrName = '', wehrOrt = ''
      if (profile?.wehr_id) {
        const { data: w } = await supabase
          .from('wehren')
          .select('name,ort')
          .eq('id', profile.wehr_id)
          .single()
        if (w) { wehrName = w.name || ''; wehrOrt = w.ort || '' }
      }

      if (p) {
        const name = `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim()
        const adresse = [p.strasse, p.plz && p.ort ? `${p.plz} ${p.ort}` : (p.plz || p.ort || '')]
          .filter(Boolean).join(', ')
        setForm(f => ({
          ...f,
          dienststelle: wehrName,
          name_vorname: name,
          dienstort: wehrOrt || p.ort || '',
          wohnadresse: adresse,
          geldinstitut: '',
          iban: p.iban ?? '',
          bic: p.bic ?? '',
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
      beginn_datum: formatDatum(form.beginn_date, form.beginn_time),
      beginn_dienstgeschaeft: formatDatum(form.beginn_dienstgeschaeft_date, form.beginn_dienstgeschaeft_time),
      ende_datum: formatDatum(form.ende_date, form.ende_time),
      ende_dienstgeschaeft: formatDatum(form.ende_dienstgeschaeft_date, form.ende_dienstgeschaeft_time),
    }
  }

  async function perMailDrucken() {
    if (!profile?.wehr_id) return alert('Du bist keiner Wache zugeordnet.')
    setMailStatus('sending')
    try {
      const base64 = await dienstreiseantragPdf(buildPdfForm())
      const datumLabel = form.beginn_date
        ? formatDatum(form.beginn_date, '').replaceAll('.', '')
        : new Date().toLocaleDateString('de-DE').replaceAll('.', '')
      const { data, error } = await supabase.functions.invoke('resend-email', {
        body: {
          wehr_id: profile.wehr_id,
          datei_inhalt: base64,
          datei_name: `Dienstreiseantrag_${datumLabel}.pdf`,
          titel: `Dienstreiseantrag ${form.name_vorname} ${datumLabel}`,
        },
      })
      if (error || !data?.success) {
        setMailStatus(data?.error || error?.message || 'Unbekannter Fehler')
        setTimeout(() => setMailStatus(null), 6000)
      } else {
        setMailStatus('ok')
        setTimeout(() => { setMailStatus(null); onClose() }, 2500)
      }
    } catch (err) {
      setMailStatus(err.message || 'Fehler beim Erstellen der PDF')
      setTimeout(() => setMailStatus(null), 6000)
    }
  }

  async function lokalOeffnen() {
    try {
      const base64 = await dienstreiseantragPdf(buildPdfForm())
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
    } catch (err) {
      alert('Fehler: ' + err.message)
    }
  }

  if (loading) return (
    <div className="modal-backdrop">
      <div className="modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <div className="spinner" />
      </div>
    </div>
  )

  const inputStyle = { fontSize: 13, padding: '5px 8px' }
  const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4, display: 'block' }
  const sectionStyle = { marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--gray-100)' }
  const sectionHead = { fontSize: 13, fontWeight: 700, color: 'var(--gray-700)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }
  const rowStyle = { display: 'grid', gap: 10, marginBottom: 10 }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680, maxHeight: '94vh', overflowY: 'auto' }}>

        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>Dienstreiseantrag</h3>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>ThürRKG Anlage 2 – Antrag, Anordnung / Genehmigung, Abrechnung</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* ── Abschnitt: Art der Reise ──────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHead}>Art der Reise</div>
          <div style={{ display: 'flex', gap: 20 }}>
            {[['dienstreise', 'Dienstreise'], ['ausbildung', 'Aus- und Fortbildungsreise']].map(([val, label]) => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 14 }}>
                <input type="radio" name="art" value={val} checked={form.art === val} onChange={() => set('art', val)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* ── Abschnitt 1: Antragsteller ────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHead}>
            <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11 }}>1</span>
            Antragsteller/in
          </div>

          <div style={{ ...rowStyle, gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label style={labelStyle}>Dienststelle</label>
              <input style={inputStyle} value={form.dienststelle} onChange={e => set('dienststelle', e.target.value)} placeholder="Feuerwehr ..." />
            </div>
            <div>
              <label style={labelStyle}>Name, Vorname</label>
              <input style={inputStyle} value={form.name_vorname} onChange={e => set('name_vorname', e.target.value)} />
            </div>
          </div>

          <div style={{ ...rowStyle, gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div>
              <label style={labelStyle}>Dienstort</label>
              <input style={inputStyle} value={form.dienstort} onChange={e => set('dienstort', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Personal-/Arbeitsgebietsnr.</label>
              <input style={inputStyle} value={form.personal_nr} onChange={e => set('personal_nr', e.target.value)} placeholder="(optional)" />
            </div>
            <div>
              <label style={labelStyle}>Hausruf</label>
              <input style={inputStyle} value={form.hausruf} onChange={e => set('hausruf', e.target.value)} placeholder="(optional)" />
            </div>
          </div>

          <div>
            <label style={labelStyle}>PLZ, Wohnort, Straße, HsNr.</label>
            <input style={inputStyle} value={form.wohnadresse} onChange={e => set('wohnadresse', e.target.value)} />
          </div>
        </div>

        {/* ── Abschnitt 2: Reiseziel und Zweck ─────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHead}>
            <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11 }}>2</span>
            Reiseziel und -zweck
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Reiseziel / Zweck (Anschrift angeben)</label>
            <input style={{ ...inputStyle, marginBottom: 6 }} value={form.reiseziel_1} onChange={e => set('reiseziel_1', e.target.value)} placeholder="z.B. Feuerwehrschule Erfurt, Nordhäuser Str. 120, 99091 Erfurt" />
            <input style={inputStyle} value={form.reiseziel_2} onChange={e => set('reiseziel_2', e.target.value)} placeholder="z.B. Lehrgang Atemschutzgeräteträger" />
          </div>

          <div>
            <label style={labelStyle}>Unentgeltliche Unterkunft</label>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[['keine', 'Keine / nicht beantragt'], ['amt', 'Steht bereit (des Amtes wegen)'], ['privat', 'Aus privaten Gründen'], ['taeglich', 'Tägliche Rückkehr']].map(([val, label]) => (
                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="radio" name="unterkunft" value={val} checked={form.unterkunft === val} onChange={() => set('unterkunft', val)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Abschnitt 3: Reiseverlauf ─────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHead}>
            <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11 }}>3</span>
            Geplanter Reiseverlauf
          </div>

          {/* Beginn */}
          <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8 }}>BEGINN DER REISE</div>
            <div style={{ ...rowStyle, gridTemplateColumns: '1fr 1fr', marginBottom: 8 }}>
              <div>
                <label style={labelStyle}>Abreisedatum</label>
                <input type="date" style={inputStyle} value={form.beginn_date} onChange={e => set('beginn_date', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Uhrzeit</label>
                <input type="time" style={inputStyle} value={form.beginn_time} onChange={e => set('beginn_time', e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={labelStyle}>Abfahrt von</label>
              <div style={{ display: 'flex', gap: 16 }}>
                {[['wohnung', 'Wohnung'], ['dienststelle', 'Dienststelle'], ['familienwohnort', 'Familienwohnort']].map(([val, label]) => (
                  <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="beginn_von" value={val} checked={form.beginn_von === val} onChange={() => set('beginn_von', val)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ ...rowStyle, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label style={labelStyle}>Beginn Dienstgeschäft – Datum</label>
                <input type="date" style={inputStyle} value={form.beginn_dienstgeschaeft_date} onChange={e => set('beginn_dienstgeschaeft_date', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Beginn Dienstgeschäft – Uhrzeit</label>
                <input type="time" style={inputStyle} value={form.beginn_dienstgeschaeft_time} onChange={e => set('beginn_dienstgeschaeft_time', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Ende */}
          <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8 }}>ENDE DER REISE</div>
            <div style={{ ...rowStyle, gridTemplateColumns: '1fr 1fr', marginBottom: 8 }}>
              <div>
                <label style={labelStyle}>Rückreisedatum</label>
                <input type="date" style={inputStyle} value={form.ende_date} onChange={e => set('ende_date', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Uhrzeit</label>
                <input type="time" style={inputStyle} value={form.ende_time} onChange={e => set('ende_time', e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={labelStyle}>Ankunft an</label>
              <div style={{ display: 'flex', gap: 16 }}>
                {[['wohnung', 'Wohnung'], ['dienststelle', 'Dienststelle'], ['familienwohnort', 'Familienwohnort']].map(([val, label]) => (
                  <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" name="ende_an" value={val} checked={form.ende_an === val} onChange={() => set('ende_an', val)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ ...rowStyle, gridTemplateColumns: '1fr 1fr' }}>
              <div>
                <label style={labelStyle}>Ende Dienstgeschäft – Datum</label>
                <input type="date" style={inputStyle} value={form.ende_dienstgeschaeft_date} onChange={e => set('ende_dienstgeschaeft_date', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Ende Dienstgeschäft – Uhrzeit</label>
                <input type="time" style={inputStyle} value={form.ende_dienstgeschaeft_time} onChange={e => set('ende_dienstgeschaeft_time', e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.verbindung_urlaub} onChange={e => set('verbindung_urlaub', e.target.checked)} />
              Verbindung mit Urlaub / Privatreise
            </label>
          </div>
        </div>

        {/* ── Abschnitt 4: Beförderungsmittel ──────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHead}>
            <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11 }}>4</span>
            Beförderungsmittel
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Hauptbeförderungsmittel</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {[
                ['oeffentlich', 'Öffentliche Verkehrsmittel (Bahn / Bus)'],
                ['flugzeug', 'Flugzeug'],
                ['dienstfahrzeug_selbst', 'Dienstfahrzeug – als Selbstfahrer'],
                ['dienstfahrzeug_fahrer', 'Dienstfahrzeug – mit Fahrer'],
                ['privatkfz', 'Privates Kfz (erhebliche dienstliche Gründe)'],
                ['sonstiges', 'Sonstiges'],
              ].map(([val, label]) => (
                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13 }}>
                  <input type="radio" name="befoerderungsmittel" value={val} checked={form.befoerderungsmittel === val} onChange={() => set('befoerderungsmittel', val)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {form.befoerderungsmittel === 'sonstiges' && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Bezeichnung Sonstiges Beförderungsmittel</label>
              <input style={inputStyle} value={form.sonstiges_kfz} onChange={e => set('sonstiges_kfz', e.target.value)} placeholder="z.B. Fahrrad, Taxi ..." />
            </div>
          )}

          {form.befoerderungsmittel === 'oeffentlich' && (
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 20, marginBottom: 8, flexWrap: 'wrap' }}>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>BahnCard vorhanden</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    {[['nein', 'Nein'], ['ja', 'Ja']].map(([val, label]) => (
                      <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" name="bahncard" value={val} checked={form.bahncard === val} onChange={() => set('bahncard', val)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                {form.bahncard === 'ja' && (
                  <div>
                    <label style={labelStyle}>BC-Art</label>
                    <input style={{ ...inputStyle, width: 100 }} value={form.bahncard_art} onChange={e => set('bahncard_art', e.target.value)} placeholder="z.B. BC25" />
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ ...rowStyle, gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div>
              <label style={labelStyle}>Fahrkarte / Flugschein (von – bis)</label>
              <input style={inputStyle} value={form.fahrkarte} onChange={e => set('fahrkarte', e.target.value)} placeholder="z.B. Erfurt – Berlin" />
            </div>
            <div>
              <label style={labelStyle}>Platzkarte Hinfahrt</label>
              <input style={inputStyle} value={form.platzkarte_hin} onChange={e => set('platzkarte_hin', e.target.value)} placeholder="Strecke" />
            </div>
            <div>
              <label style={labelStyle}>Platzkarte Rückfahrt</label>
              <input style={inputStyle} value={form.platzkarte_rueck} onChange={e => set('platzkarte_rueck', e.target.value)} placeholder="Strecke" />
            </div>
          </div>
        </div>

        {/* ── Abschnitt 5: Übernachtungskosten ─────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHead}>
            <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11 }}>5</span>
            Übernachtungskosten
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginBottom: 12 }}>
            <input type="checkbox" checked={form.uebernachtung} onChange={e => set('uebernachtung', e.target.checked)} />
            Übernachtungskosten werden beantragt (§ 7 ThürRKG)
          </label>

          {form.uebernachtung && (
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: 12 }}>
              <div style={{ ...rowStyle, gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 10 }}>
                <div>
                  <label style={labelStyle}>Betrag je Nacht (€)</label>
                  <input style={inputStyle} value={form.uebernachtung_betrag} onChange={e => set('uebernachtung_betrag', e.target.value)} placeholder="z.B. 85,00" />
                </div>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>Inkl. Frühstück</label>
                  <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
                    {[['nein', 'Nein'], ['ja', 'Ja']].map(([val, label]) => (
                      <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                        <input type="radio" name="fruehstueck" value={val} checked={form.fruehstueck === val} onChange={() => set('fruehstueck', val)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                {form.fruehstueck === 'ja' && (
                  <div>
                    <label style={labelStyle}>Frühstückskosten (€)</label>
                    <input style={inputStyle} value={form.fruehstueck_betrag} onChange={e => set('fruehstueck_betrag', e.target.value)} placeholder="z.B. 12,00" />
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ ...labelStyle, marginBottom: 6 }}>Vom Veranstalter vorreserviertes Hotelkontingent</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  {[['nein', 'Nein'], ['ja', 'Ja']].map(([val, label]) => (
                    <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                      <input type="radio" name="hotelkontingent" value={val} checked={form.hotelkontingent === val} onChange={() => set('hotelkontingent', val)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Begründung (wenn Kosten über dem Städtekatalog liegen)</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 50 }} value={form.gruendung_uebernachtung} onChange={e => set('gruendung_uebernachtung', e.target.value)} placeholder="Begründung für erhöhte Übernachtungskosten..." />
              </div>
            </div>
          )}
        </div>

        {/* ── Abschnitt 7 + 8 + 9: Sonstiges ──────────────────────── */}
        <div style={sectionStyle}>
          <div style={sectionHead}>
            <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 11 }}>7–9</span>
            Sonstiges
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Sonstige Kosten / Nebenkosten / Erläuterungen</label>
            <input style={inputStyle} value={form.sonstige_kosten} onChange={e => set('sonstige_kosten', e.target.value)} placeholder="z.B. Parkgebühren, Mautkosten ..." />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Mitfahrer/in (Name, Stellenzeichen, ggf. Dienststelle)</label>
            <input style={inputStyle} value={form.mitfahrer} onChange={e => set('mitfahrer', e.target.value)} placeholder="(optional – Mitfahrer muss eigenen Antrag stellen)" />
          </div>

          <div>
            <label style={{ ...labelStyle, marginBottom: 6 }}>Abschlagsvorauszahlung beantragen (§ 16 ThürRKG)</label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              {[['nein', 'Nein'], ['ja', 'Ja']].map(([val, label]) => (
                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="radio" name="abschlag" value={val} checked={form.abschlag === val} onChange={() => set('abschlag', val)} />
                  {label}
                </label>
              ))}
              {form.abschlag === 'ja' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <label style={{ fontSize: 13 }}>Betrag (€):</label>
                  <input style={{ ...inputStyle, width: 100 }} value={form.abschlag_betrag} onChange={e => set('abschlag_betrag', e.target.value)} placeholder="0,00" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Bankverbindung (für Seite 2 Abrechnung) ──────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div style={sectionHead}>
            <span style={{ background: 'var(--gray-300)', color: 'var(--gray-700)', borderRadius: 4, padding: '1px 7px', fontSize: 11 }}>Blatt 2</span>
            Bankverbindung
            <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400 }}>(wird auf Seite 2 automatisch eingetragen)</span>
          </div>

          <div style={{ ...rowStyle, gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div>
              <label style={labelStyle}>Geldinstitut / Bezeichnung</label>
              <input style={inputStyle} value={form.geldinstitut} onChange={e => set('geldinstitut', e.target.value)} placeholder="z.B. Sparkasse Erfurt" />
            </div>
            <div>
              <label style={labelStyle}>IBAN</label>
              <input style={{ ...inputStyle, fontFamily: 'var(--mono)', letterSpacing: 1 }} value={form.iban} onChange={e => set('iban', e.target.value.toUpperCase())} placeholder="DE00 ..." maxLength={34} />
            </div>
            <div>
              <label style={labelStyle}>BIC</label>
              <input style={{ ...inputStyle, fontFamily: 'var(--mono)', letterSpacing: 1 }} value={form.bic} onChange={e => set('bic', e.target.value.toUpperCase())} placeholder="XXXXXXXX" maxLength={11} />
            </div>
          </div>
        </div>

        {/* Status + Aktionen */}
        {mailStatus && mailStatus !== 'sending' && mailStatus !== 'ok' && (
          <div className="alert alert-error" style={{ marginBottom: 8 }}>{mailStatus}</div>
        )}
        {mailStatus === 'ok' && (
          <div className="alert alert-success" style={{ marginBottom: 8 }}>✓ Dienstreiseantrag an Wachen-Drucker gesendet!</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid var(--gray-100)', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-secondary" onClick={lokalOeffnen}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/>
            </svg>
            PDF öffnen / lokal drucken
          </button>
          <button
            className="btn btn-primary"
            onClick={perMailDrucken}
            disabled={mailStatus === 'sending' || mailStatus === 'ok'}
          >
            {mailStatus === 'sending' ? (
              <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />&nbsp;Wird gesendet...</>
            ) : mailStatus === 'ok' ? '✓ Gesendet' : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                  <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,7 12,13 2,7"/>
                </svg>
                Per Mail an Drucker senden
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
