import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function AusbildungsnachweisModal({ onClose }) {
  const { profile } = useAuth()
  const [kameraden, setKameraden] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const heute = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    ortsteil: '',
    ausbilder: '',
    datum: heute,
    beginn: '',
    ende: '',
    minuten: '',
    thema: '',
    theorie: false,
    praxis: false,
    teilnehmer: [],
  })

  useEffect(() => {
    // Wache laden
    async function ladeWache() {
      if (profile?.wehr?.name) {
        setForm(f => ({ ...f, ortsteil: profile.wehr.name }))
      } else if (profile?.wehr_id) {
        const { data } = await supabase.from('wehren').select('name').eq('id', profile.wehr_id).single()
        if (data) setForm(f => ({ ...f, ortsteil: data.name }))
      }
    }

    // Kameraden laden: Hauptwache + Nebenwache
    async function ladeKameraden() {
      const [{ data: haupt }, { data: neben }] = await Promise.all([
        supabase.from('profiles').select('id,vorname,nachname').eq('status', 'aktiv').eq('wehr_id', profile?.wehr_id).order('nachname'),
        supabase.from('kamerad_wehren').select('kamerad_id, kamerad:profiles(id,vorname,nachname)').eq('wehr_id', profile?.wehr_id),
      ])

      const alle = [...(haupt ?? [])]
      const ids = new Set(alle.map(k => k.id))
      for (const n of (neben ?? [])) {
        if (n.kamerad && !ids.has(n.kamerad.id)) {
          alle.push(n.kamerad)
          ids.add(n.kamerad.id)
        }
      }
      alle.sort((a, b) => a.nachname.localeCompare(b.nachname))
      setKameraden(alle)
      setLoading(false)
    }

    ladeWache()
    ladeKameraden()
  }, [])

  function berechneMinuten(beginn, ende) {
    if (!beginn || !ende) return ''
    const [bH, bM] = beginn.split(':').map(Number)
    const [eH, eM] = ende.split(':').map(Number)
    const diff = (eH * 60 + eM) - (bH * 60 + bM)
    return diff > 0 ? String(diff) : ''
  }

  function setBeginn(val) { setForm(f => ({ ...f, beginn: val, minuten: berechneMinuten(val, f.ende) })) }
  function setEnde(val) { setForm(f => ({ ...f, ende: val, minuten: berechneMinuten(f.beginn, val) })) }

  function toggleTeilnehmer(id) {
    setForm(f => ({
      ...f,
      teilnehmer: f.teilnehmer.includes(id) ? f.teilnehmer.filter(x => x !== id) : [...f.teilnehmer, id]
    }))
  }

  function alleToggle() {
    setForm(f => ({ ...f, teilnehmer: f.teilnehmer.length === kameraden.length ? [] : kameraden.map(k => k.id) }))
  }

  function drucken() {
    setGenerating(true)

    const datumFormatiert = form.datum
      ? new Date(form.datum + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : ''

    const teilnehmerNamen = form.teilnehmer
      .map(id => kameraden.find(k => k.id === id))
      .filter(Boolean)
      .map(k => `${k.nachname}, ${k.vorname}`)

    // Teilnehmerliste auf 25 Zeilen auffuellen
    const zeilen = []
    for (let i = 0; i < 25; i++) {
      zeilen.push({ nr: i + 1, name: teilnehmerNamen[i] ?? '', aktiv: !!teilnehmerNamen[i] })
    }

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Ausbildungsnachweis ${datumFormatiert}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10pt; padding: 15mm; }
  h1 { text-align: center; font-size: 12pt; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  td, th { border: 1px solid black; padding: 4px 6px; font-size: 9.5pt; }
  th { background: #d9d9d9; font-weight: bold; text-align: left; }
  .label { font-weight: bold; width: 120px; background: #f0f0f0; }
  .check { text-align: center; width: 24px; }
  .nr { text-align: center; width: 28px; }
  .unterschrift { width: 45%; }
  .section-title { font-weight: bold; margin: 6px 0 3px; font-size: 10pt; }
  .sign-table td { height: 40px; }
  .sign-label { text-align: center; font-size: 8.5pt; background: #f0f0f0; font-weight: bold; }
  @media print {
    body { padding: 10mm; }
    @page { size: A4; margin: 10mm; }
  }
</style>
</head>
<body>
<h1>Dienst- / Ausbildungsnachweis der Freiwilligen Feuerwehr Grammetal</h1>

<table>
  <tr>
    <td class="label">Ortsteilfeuerwehr:</td>
    <td>${form.ortsteil}</td>
    <td class="label">Ausbilder:</td>
    <td>${form.ausbilder}</td>
  </tr>
  <tr>
    <td class="label">Datum:</td>
    <td>${datumFormatiert}</td>
    <td class="label">Beginn:</td>
    <td>${form.beginn ? form.beginn + ' Uhr' : ''}</td>
  </tr>
  <tr>
    <td class="label">Ende:</td>
    <td>${form.ende ? form.ende + ' Uhr' : ''}</td>
    <td class="label">Minuten:</td>
    <td>${form.minuten}</td>
  </tr>
  <tr>
    <td class="label">Ausbildungsthema:</td>
    <td colspan="2">${form.thema}</td>
    <td style="text-align:center">${form.theorie ? '☑' : '☐'} Theorie &nbsp;&nbsp; ${form.praxis ? '☑' : '☐'} Praxis</td>
  </tr>
</table>

<div class="section-title">Teilnehmerliste</div>
<table>
  <tr>
    <th class="nr">Nr.</th>
    <th class="check"></th>
    <th>Name</th>
    <th class="unterschrift">Unterschrift</th>
  </tr>
  ${zeilen.map(z => `
  <tr>
    <td class="nr">${z.nr}</td>
    <td class="check">${z.aktiv ? '☑' : '☐'}</td>
    <td>${z.name}</td>
    <td></td>
  </tr>`).join('')}
</table>

<table class="sign-table" style="margin-top: 10px;">
  <tr>
    <td style="width:33%"></td>
    <td style="width:33%"></td>
    <td style="width:33%"></td>
  </tr>
  <tr>
    <td class="sign-label">Datum / Unterschrift Ausbilder</td>
    <td class="sign-label">Datum / Unterschrift Wehrf&uuml;hrer</td>
    <td class="sign-label">Datum / Unterschrift Sachbearbeiter</td>
  </tr>
</table>

<script>window.onload = function() { window.print(); }</script>
</body>
</html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    setGenerating(false)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3>Ausbildungsnachweis ausfuellen</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>x</button>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Ortsteilfeuerwehr</label>
            <input value={form.ortsteil} onChange={e => setForm(f => ({ ...f, ortsteil: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Ausbilder</label>
            <input value={form.ausbilder} onChange={e => setForm(f => ({ ...f, ausbilder: e.target.value }))} placeholder="Name des Ausbilders" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Datum</label>
            <input type="date" value={form.datum} onChange={e => setForm(f => ({ ...f, datum: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Minuten (auto)</label>
            <input type="number" value={form.minuten} onChange={e => setForm(f => ({ ...f, minuten: e.target.value }))} placeholder="Wird automatisch berechnet" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Beginn</label>
            <input type="time" value={form.beginn} onChange={e => setBeginn(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Ende</label>
            <input type="time" value={form.ende} onChange={e => setEnde(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label>Ausbildungsthema</label>
          <input value={form.thema} onChange={e => setForm(f => ({ ...f, thema: e.target.value }))} placeholder="z.B. Atemschutz Grundausbildung" />
        </div>

        <div className="form-group">
          <label>Art der Ausbildung</label>
          <div style={{ display: 'flex', gap: 20, marginTop: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 'normal' }}>
              <input type="checkbox" checked={form.theorie} onChange={e => setForm(f => ({ ...f, theorie: e.target.checked }))} style={{ width: 'auto' }} />
              Theorie
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 'normal' }}>
              <input type="checkbox" checked={form.praxis} onChange={e => setForm(f => ({ ...f, praxis: e.target.checked }))} style={{ width: 'auto' }} />
              Praxis
            </label>
          </div>
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ margin: 0 }}>Teilnehmer ({form.teilnehmer.length} ausgewaehlt)</label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={alleToggle}>
              {form.teilnehmer.length === kameraden.length ? 'Alle abwaehlen' : 'Alle auswaehlen'}
            </button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 16 }}><div className="spinner"></div></div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 8 }}>
              {kameraden.map((k, i) => {
                const aktiv = form.teilnehmer.includes(k.id)
                return (
                  <label key={k.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer',
                    background: aktiv ? 'var(--red-pale)' : i % 2 === 0 ? 'white' : 'var(--gray-50)',
                    borderBottom: '1px solid var(--gray-100)',
                  }}>
                    <input type="checkbox" checked={aktiv} onChange={() => toggleTeilnehmer(k.id)} style={{ width: 'auto' }} />
                    <span style={{ fontSize: 14, color: aktiv ? 'var(--red-dark)' : 'var(--gray-700)', fontWeight: aktiv ? 500 : 400 }}>
                      {k.nachname}, {k.vorname}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--gray-100)' }}>
          <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={drucken} disabled={generating}>
            {generating ? 'Wird erstellt...' : '🖨️ Drucken / Als PDF speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
