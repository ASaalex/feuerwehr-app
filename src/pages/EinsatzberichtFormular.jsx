import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { einsatzberichtPdf } from '../lib/einsatzberichtPdf'

const FUNKTIONEN = ['EL', 'GF', 'MA', 'BS']
const FAHRZEUGE_FALLBACK = ['HLF 10', 'MTW']

function fahrzeugeAusNamen(namen) {
  return (namen?.length ? namen : FAHRZEUGE_FALLBACK).map(name => (
    { fahrzeug: name, mitgefahren: false, ab: '', raus: '', an: '', zurueck: '', bereit: '', km: '' }
  ))
}

/** Bild per Canvas auf maxWidth komprimieren und als DataURL zurückgeben */
function komprimiereBild(file, maxWidth = 1200, qualitaet = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = ev => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let w = img.width, h = img.height
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth }
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', qualitaet))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

function dataUrlToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)[1]
  const binary = atob(data)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
const EINSATZARTEN = [
  'Brandeinsatz', 'Technische Hilfeleistung', 'ABC-Einsatz', 'Unwettereinsatz',
  'Hilfeleistung', 'Fehlalarm', 'Sicherheitswache', 'Übung', 'Sonstiges',
]

function leereFW() { return { name: '' } }
function leererRD() { return { typ: 'RTW', funkkenner: '', name: '', gesellschaft: '' } }
function leerePerson() { return { vorname: '', nachname: '', geboren: '', adresse: '', art: '', kennzeichen: '' } }

export default function EinsatzberichtFormular() {
  const { id } = useParams()
  const istNeu = id === 'neu'
  const navigate = useNavigate()
  const { profile } = useAuth()
  const wehrData = Array.isArray(profile?.wehr) ? profile?.wehr?.[0] : profile?.wehr

  const [kameraden, setKameraden] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mailStatus, setMailStatus] = useState(null)
  const [mailModal, setMailModal] = useState(false)
  const [fotoVorschau, setFotoVorschau] = useState([]) // [{file?, pfad?, dataUrl}]
  const [fotosLaden, setFotosLaden] = useState(false)
  const fotoInputRef = useRef(null)

  const heute = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    datum: heute,
    alarmzeit: '',
    einsatzart: '',
    einsatzort: '',
    km_gesamt: '',
    fahrzeuge: fahrzeugeAusNamen(wehrData?.fahrzeuge),
    einsatzkraefte: [],
    bioversal_l: '',
    absodan_kg: '',
    loeschwasser_l: '',
    schaummittel_l: '',
    mittel_sonstiges: '',
    organisationen: {
      feuerwehren: [],
      polizei: { name: '', aktenzeichen: '', dienststelle: '', autobahn: false },
      rettungsdienste: [],
      einsatzleitung: { name: '', feuerwehr: '' },
      uebergabe: { name: '', uhrzeit: '', funktion: '' },
      betroffene: [],
    },
    lage_eintreffen: '',
    taetigkeiten: '',
    erlaeuterung: '',
    abschluss_name: `${profile?.vorname ?? ''} ${profile?.nachname ?? ''}`.trim(),
    abgeschlossen: false,
  })

  // Accordion-Zustand
  const [offen, setOffen] = useState({ 1: true, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false })
  function toggleSektion(nr) { setOffen(o => ({ ...o, [nr]: !o[nr] })) }

  // ── Daten laden ──────────────────────────────────────────────
  useEffect(() => {
    async function laden() {
      // Kameraden laden (Haupt + Neben)
      if (profile?.wehr_id) {
        // Schritt 1: Hauptwache-Mitglieder
        const { data: haupt } = await supabase
          .from('profiles')
          .select('id,vorname,nachname')
          .eq('status', 'aktiv')
          .eq('wehr_id', profile.wehr_id)
          .neq('rolle', 'tablet')
          .order('nachname')

        const alle = [...(haupt ?? [])]
        const ids = new Set(alle.map(k => k.id))

        // Schritt 2: Nebenwache-IDs holen
        const { data: nebenIds } = await supabase
          .from('kamerad_wehren')
          .select('kamerad_id')
          .eq('wehr_id', profile.wehr_id)

        // Schritt 3: Profile der Nebenwachen-Kameraden laden (aktiv, kein Tablet)
        if (nebenIds?.length) {
          const fremdIds = nebenIds.map(n => n.kamerad_id).filter(id => !ids.has(id))
          if (fremdIds.length > 0) {
            const { data: nebenProfile } = await supabase
              .from('profiles')
              .select('id,vorname,nachname')
              .eq('status', 'aktiv')
              .neq('rolle', 'tablet')
              .in('id', fremdIds)
              .order('nachname')
            for (const k of (nebenProfile ?? [])) {
              if (!ids.has(k.id)) { alle.push(k); ids.add(k.id) }
            }
          }
        }

        alle.sort((a, b) => a.nachname.localeCompare(b.nachname))
        setKameraden(alle)

        // Einsatzkraefte vorbelegen
        if (istNeu) {
          setForm(f => ({
            ...f,
            einsatzkraefte: alle.map(k => ({
              kamerad_id: k.id,
              name: `${k.nachname}, ${k.vorname}`,
              aktiv: false,
              funktion: 'BS',
              fahrzeug: 'HLF 10',
              atemschutz: false,
            }))
          }))
        }
      }

      // Bestehenden Bericht laden
      if (!istNeu) {
        const { data: b } = await supabase
          .from('einsatzberichte')
          .select('*')
          .eq('id', id)
          .single()

        if (b) {
          setForm({
            datum: b.datum ?? heute,
            alarmzeit: b.alarmzeit ?? '',
            einsatzart: b.einsatzart ?? '',
            einsatzort: b.einsatzort ?? '',
            km_gesamt: b.km_gesamt ?? '',
            fahrzeuge: b.fahrzeuge?.length
              ? b.fahrzeuge.map(f => ({ ...f, mitgefahren: f.mitgefahren ?? !!(f.ab || f.raus || f.an) }))
              : fahrzeugeAusNamen(wehrData?.fahrzeuge),
            einsatzkraefte: b.einsatzkraefte ?? [],
            bioversal_l: b.bioversal_l ?? '',
            absodan_kg: b.absodan_kg ?? '',
            loeschwasser_l: b.loeschwasser_l ?? '',
            schaummittel_l: b.schaummittel_l ?? '',
            mittel_sonstiges: b.mittel_sonstiges ?? '',
            organisationen: b.organisationen ?? {
              feuerwehren: [], polizei: {}, rettungsdienste: [],
              einsatzleitung: {}, uebergabe: {}, betroffene: [],
            },
            lage_eintreffen: b.lage_eintreffen ?? '',
            taetigkeiten: b.taetigkeiten ?? '',
            erlaeuterung: b.erlaeuterung ?? '',
            abschluss_name: b.abschluss_name ?? `${profile?.vorname ?? ''} ${profile?.nachname ?? ''}`.trim(),
            abgeschlossen: b.abgeschlossen ?? false,
          })

          // Gespeicherte Fotos laden und als Vorschau anzeigen
          if (b.foto_pfade?.length) {
            setFotosLaden(true)
            ;(async () => {
              const previews = []
              for (const pfad of b.foto_pfade) {
                try {
                  const { data: blob, error: dlErr } = await supabase.storage
                    .from('einsatz-fotos')
                    .download(pfad)
                  if (dlErr || !blob) {
                    console.warn('Foto download Fehler:', pfad, dlErr?.message)
                    continue
                  }
                  const dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = e => resolve(e.target.result)
                    reader.onerror = reject
                    reader.readAsDataURL(blob)
                  })
                  previews.push({ pfad, dataUrl })
                } catch (e) {
                  console.warn('Foto konnte nicht geladen werden:', pfad, e)
                }
              }
              setFotoVorschau(previews)
              setFotosLaden(false)
            })()
          }
        }
      }
      setLoading(false)
    }
    laden()
  }, [id])

  // ── Hilfsfunktionen ──────────────────────────────────────────
  function setFahrzeug(idx, field, val) {
    setForm(f => {
      const fz = [...f.fahrzeuge]
      fz[idx] = { ...fz[idx], [field]: val }
      return { ...f, fahrzeuge: fz }
    })
  }

  function setKraft(idx, field, val) {
    setForm(f => {
      const kr = [...f.einsatzkraefte]
      kr[idx] = { ...kr[idx], [field]: val }
      return { ...f, einsatzkraefte: kr }
    })
  }

  function setOrg(field, val) {
    setForm(f => ({ ...f, organisationen: { ...f.organisationen, [field]: val } }))
  }

  function setOrgNested(field, subfield, val) {
    setForm(f => ({
      ...f,
      organisationen: {
        ...f.organisationen,
        [field]: { ...(f.organisationen[field] || {}), [subfield]: val },
      }
    }))
  }

  function addFW() { setOrg('feuerwehren', [...(form.organisationen.feuerwehren || []), leereFW()]) }
  function removeFW(i) { setOrg('feuerwehren', form.organisationen.feuerwehren.filter((_, idx) => idx !== i)) }
  function setFW(i, val) {
    const arr = [...form.organisationen.feuerwehren]
    arr[i] = { ...arr[i], name: val }
    setOrg('feuerwehren', arr)
  }

  function addRD() { setOrg('rettungsdienste', [...(form.organisationen.rettungsdienste || []), leererRD()]) }
  function removeRD(i) { setOrg('rettungsdienste', form.organisationen.rettungsdienste.filter((_, idx) => idx !== i)) }
  function setRD(i, field, val) {
    const arr = [...form.organisationen.rettungsdienste]
    arr[i] = { ...arr[i], [field]: val }
    setOrg('rettungsdienste', arr)
  }

  function addPerson() { setOrg('betroffene', [...(form.organisationen.betroffene || []), leerePerson()]) }
  function removePerson(i) { setOrg('betroffene', form.organisationen.betroffene.filter((_, idx) => idx !== i)) }
  function setPerson(i, field, val) {
    const arr = [...form.organisationen.betroffene]
    arr[i] = { ...arr[i], [field]: val }
    setOrg('betroffene', arr)
  }

  // ── Fotos ────────────────────────────────────────────────────
  function handleFotoAuswahl(e) {
    const files = Array.from(e.target.files || [])
    files.forEach(async file => {
      try {
        const dataUrl = await komprimiereBild(file)
        const blob = dataUrlToBlob(dataUrl)
        // Blob als komprimiertes File-Objekt für den Upload
        const komprimiertesFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
        setFotoVorschau(prev => [...prev, { file: komprimiertesFile, dataUrl }])
      } catch {
        // Fallback: unkomprimiert
        const reader = new FileReader()
        reader.onload = ev => setFotoVorschau(prev => [...prev, { file, dataUrl: ev.target.result }])
        reader.readAsDataURL(file)
      }
    })
    e.target.value = ''
  }

  function removeFoto(i) {
    setFotoVorschau(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Speichern ─────────────────────────────────────────────────
  async function speichern(abschliessen = false) {
    if (!profile?.wehr_id) return alert('Du bist keiner Wache zugeordnet.')
    setSaving(true)

    // Fotos: bestehende Pfade behalten + neue hochladen
    const vorhandenePfade = fotoVorschau.filter(f => f.pfad).map(f => f.pfad)
    const neueFotos = fotoVorschau.filter(f => f.file)
    const neuePfade = []
    for (const { file } of neueFotos) {
      const ext = file.name.split('.').pop() || 'jpg'
      const pfad = `${profile.wehr_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: upErr } = await supabase.storage.from('einsatz-fotos').upload(pfad, file, { contentType: file.type })
      if (upErr) {
        setSaving(false)
        alert(`Foto-Upload fehlgeschlagen: ${upErr.message}\n\nBitte prüfe ob der Bucket "einsatz-fotos" in Supabase angelegt ist und die Storage-Policies gesetzt sind (SQL-Skript erneut ausführen).`)
        return
      }
      neuePfade.push(pfad)
    }
    const alleFotoPfade = [...vorhandenePfade, ...neuePfade]

    const payload = {
      wehr_id: profile.wehr_id,
      erstellt_von: profile.id,
      datum: form.datum || null,
      alarmzeit: form.alarmzeit || null,
      einsatzart: form.einsatzart || null,
      einsatzort: form.einsatzort || null,
      km_gesamt: form.km_gesamt ? parseFloat(form.km_gesamt) : null,
      fahrzeuge: form.fahrzeuge,
      einsatzkraefte: form.einsatzkraefte,
      bioversal_l: form.bioversal_l ? parseFloat(form.bioversal_l) : null,
      absodan_kg: form.absodan_kg ? parseFloat(form.absodan_kg) : null,
      loeschwasser_l: form.loeschwasser_l ? parseFloat(form.loeschwasser_l) : null,
      schaummittel_l: form.schaummittel_l ? parseFloat(form.schaummittel_l) : null,
      mittel_sonstiges: form.mittel_sonstiges || null,
      organisationen: form.organisationen,
      lage_eintreffen: form.lage_eintreffen || null,
      taetigkeiten: form.taetigkeiten || null,
      erlaeuterung: form.erlaeuterung || null,
      abschluss_name: form.abschluss_name || null,
      abgeschlossen: abschliessen || form.abgeschlossen,
      foto_pfade: alleFotoPfade.length > 0 ? alleFotoPfade : null,
    }

    let error
    if (istNeu) {
      const res = await supabase.from('einsatzberichte').insert(payload)
      error = res.error
    } else {
      const res = await supabase.from('einsatzberichte').update(payload).eq('id', id)
      error = res.error
    }

    setSaving(false)
    if (error) { alert('Fehler beim Speichern: ' + error.message); return }
    navigate('/einsatzbericht')
  }

  // ── Per Mail senden ───────────────────────────────────────────
  async function perMailSenden(emailFeld) {
    if (!profile?.wehr_id) return alert('Du bist keiner Wache zugeordnet.')
    setMailModal(false)
    setMailStatus('sending')
    try {
      const base64 = einsatzberichtPdf({ ...form, fotoDataUrls: fotoVorschau.map(f => f.dataUrl) }, wehrData?.name || '')
      const datumStr = form.datum ? form.datum.replaceAll('-', '') : 'unbekannt'
      const { data, error } = await supabase.functions.invoke('resend-email', {
        body: {
          wehr_id: profile.wehr_id,
          email_feld: emailFeld,
          datei_inhalt: base64,
          datei_name: `Einsatzbericht_${datumStr}.pdf`,
          titel: `Einsatzbericht ${form.datum || ''} – ${form.einsatzort || ''}`,
        },
      })
      if (error || !data?.success) {
        setMailStatus(data?.error || error?.message || 'Fehler beim Senden')
        setTimeout(() => setMailStatus(null), 6000)
      } else {
        setMailStatus('ok')
        setTimeout(() => setMailStatus(null), 3000)
      }
    } catch (err) {
      setMailStatus(err.message || 'Fehler')
      setTimeout(() => setMailStatus(null), 6000)
    }
  }

  function lokalDrucken() {
    const base64 = einsatzberichtPdf({ ...form, fotoDataUrls: fotoVorschau.map(f => f.dataUrl) }, wehrData?.name || '')
    const link = document.createElement('a')
    link.href = 'data:application/pdf;base64,' + base64
    link.download = `Einsatzbericht_${(form.datum || 'unbekannt').replaceAll('-', '')}.pdf`
    link.click()
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  // ── Render-Hilfsfunktion: Sektions-Header ────────────────────
  function SektionHeader({ nr, titel, fertig }) {
    return (
      <div
        onClick={() => toggleSektion(nr)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
          cursor: 'pointer', background: offen[nr] ? 'var(--red-pale)' : 'var(--gray-50)',
          borderBottom: offen[nr] ? '1px solid var(--red-light)' : 'none',
          userSelect: 'none',
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: fertig ? '#D5F5E3' : offen[nr] ? 'var(--red-light)' : 'var(--gray-200)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
          color: fertig ? '#1E8449' : offen[nr] ? 'var(--red)' : 'var(--gray-500)',
        }}>
          {fertig ? '✓' : nr}
        </div>
        <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--gray-700)', flex: 1 }}>{titel}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: offen[nr] ? 'rotate(180deg)' : 'none', transition: '150ms', color: 'var(--gray-400)' }}>
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      </div>
    )
  }

  const fzAktiv = form.fahrzeuge.some(f => f.mitgefahren)
  const kraefteAktiv = form.einsatzkraefte.some(k => k.aktiv)
  const berichtAktiv = form.lage_eintreffen || form.taetigkeiten

  const org = form.organisationen
  const orgAktiv = !!(
    (org.feuerwehren?.some(f => f.name)) ||
    org.polizei?.name || org.polizei?.aktenzeichen ||
    org.rettungsdienste?.length ||
    org.einsatzleitung?.name ||
    org.uebergabe?.name ||
    org.betroffene?.length
  )

  // Nur Fahrzeuge die mitgefahren sind für Einsatzkräfte-Dropdown
  const aktiveFahrzeuge = form.fahrzeuge.filter(f => f.mitgefahren)
  const fahrzeugOptionen = aktiveFahrzeuge.length > 0 ? aktiveFahrzeuge : form.fahrzeuge

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Kopfzeile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/einsatzbericht')}>
          ← Zurück
        </button>
        <h1 style={{ margin: 0, flex: 1 }}>
          {istNeu ? 'Neuer Einsatzbericht' : `Einsatzbericht ${form.datum ? new Date(form.datum + 'T12:00:00').toLocaleDateString('de-DE') : ''}`}
        </h1>
        {!istNeu && (
          <span className={`badge badge-${form.abgeschlossen ? 'green' : 'blue'}`}>
            {form.abgeschlossen ? '✓ Abgeschlossen' : 'In Bearbeitung'}
          </span>
        )}
      </div>

      {/* ── Sektionen ─────────────────────────────────────────── */}

      {/* 1. Kopfdaten */}
      <div className="card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden' }}>
        <SektionHeader nr={1} titel="Einsatzdaten" fertig={!!(form.einsatzart && form.einsatzort && form.datum)} />
        {offen[1] && (
          <div style={{ padding: 16 }}>
            <div className="form-row">
              <div className="form-group">
                <label>Datum</label>
                <input type="date" value={form.datum} onChange={e => setForm(f => ({ ...f, datum: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Alarmzeit</label>
                <input type="time" value={form.alarmzeit} onChange={e => setForm(f => ({ ...f, alarmzeit: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Einsatzart</label>
                <select value={form.einsatzart} onChange={e => setForm(f => ({ ...f, einsatzart: e.target.value }))}>
                  <option value="">– bitte wählen –</option>
                  {EINSATZARTEN.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Kilometrierung</label>
                <input type="number" value={form.km_gesamt} onChange={e => setForm(f => ({ ...f, km_gesamt: e.target.value }))} placeholder="km" />
              </div>
            </div>
            <div className="form-group">
              <label>Einsatzort</label>
              <input value={form.einsatzort} onChange={e => setForm(f => ({ ...f, einsatzort: e.target.value }))} placeholder="Strasse / Beschreibung" />
            </div>
          </div>
        )}
      </div>

      {/* 2. Fahrzeuge */}
      <div className="card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden' }}>
        <SektionHeader nr={2} titel="Fahrzeuge & Zeiten" fertig={fzAktiv} />
        {offen[2] && (
          <div style={{ padding: 16, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 580 }}>
              <thead>
                <tr style={{ background: 'var(--gray-50)' }}>
                  {['Mit', 'Fahrzeug', 'Ab (1)', 'Raus (3)', 'An (4)', 'Zurück', 'Bereit (2)', 'km'].map(h => (
                    <th key={h} style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--gray-200)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {form.fahrzeuge.map((fz, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--gray-100)', background: fz.mitgefahren ? 'var(--red-pale)' : 'white' }}>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <input type="checkbox" checked={fz.mitgefahren || false}
                        onChange={e => setFahrzeug(i, 'mitgefahren', e.target.checked)}
                        style={{ width: 'auto', cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '8px 6px', fontWeight: 500, color: fz.mitgefahren ? 'var(--red-dark)' : 'var(--gray-700)' }}>{fz.fahrzeug}</td>
                    {['ab', 'raus', 'an', 'zurueck', 'bereit'].map(field => (
                      <td key={field} style={{ padding: '4px 6px' }}>
                        <input type="time" value={fz[field]} onChange={e => setFahrzeug(i, field, e.target.value)}
                          disabled={!fz.mitgefahren}
                          style={{ width: 90, fontSize: 13, padding: '6px 8px', opacity: fz.mitgefahren ? 1 : 0.4 }} />
                      </td>
                    ))}
                    <td style={{ padding: '4px 6px' }}>
                      <input type="number" value={fz.km} onChange={e => setFahrzeug(i, 'km', e.target.value)}
                        disabled={!fz.mitgefahren}
                        placeholder="0" style={{ width: 60, fontSize: 13, padding: '6px 8px', opacity: fz.mitgefahren ? 1 : 0.4 }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Einsatzkräfte */}
      <div className="card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden' }}>
        <SektionHeader nr={3} titel={`Einsatzkräfte (${form.einsatzkraefte.filter(k => k.aktiv).length} aktiv)`} fertig={kraefteAktiv} />
        {offen[3] && (
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                const alleAktiv = form.einsatzkraefte.every(k => k.aktiv)
                setForm(f => ({ ...f, einsatzkraefte: f.einsatzkraefte.map(k => ({ ...k, aktiv: !alleAktiv })) }))
              }}>
                {form.einsatzkraefte.every(k => k.aktiv) ? 'Alle abwählen' : 'Alle auswählen'}
              </button>
            </div>
            <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden' }}>
              {form.einsatzkraefte.map((k, i) => (
                <div key={k.kamerad_id || i} style={{
                  display: 'grid', gridTemplateColumns: '40px 1fr 80px 100px 50px',
                  gap: 8, padding: '8px 12px', alignItems: 'center',
                  background: k.aktiv ? 'var(--red-pale)' : i % 2 === 0 ? 'white' : 'var(--gray-50)',
                  borderBottom: '1px solid var(--gray-100)',
                }}>
                  <input type="checkbox" checked={k.aktiv} onChange={e => setKraft(i, 'aktiv', e.target.checked)}
                    style={{ width: 'auto', cursor: 'pointer' }} />
                  <span style={{ fontSize: 14, color: k.aktiv ? 'var(--red-dark)' : 'var(--gray-700)', fontWeight: k.aktiv ? 500 : 400 }}>
                    {k.name}
                  </span>
                  <select value={k.funktion} onChange={e => setKraft(i, 'funktion', e.target.value)}
                    disabled={!k.aktiv} style={{ fontSize: 12, padding: '4px 6px' }}>
                    {FUNKTIONEN.map(fn => <option key={fn} value={fn}>{fn}</option>)}
                  </select>
                  <select value={k.fahrzeug} onChange={e => setKraft(i, 'fahrzeug', e.target.value)}
                    disabled={!k.aktiv} style={{ fontSize: 12, padding: '4px 6px' }}>
                    {fahrzeugOptionen.map(fz => <option key={fz.fahrzeug} value={fz.fahrzeug}>{fz.fahrzeug}</option>)}
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: k.aktiv ? 'pointer' : 'default', color: 'var(--gray-500)' }}>
                    <input type="checkbox" checked={k.atemschutz} onChange={e => setKraft(i, 'atemschutz', e.target.checked)}
                      disabled={!k.aktiv} style={{ width: 'auto' }} />
                    AS
                  </label>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 6 }}>
              EL = Einsatzleiter · GF = Gruppenführer · MA = Maschinist · BS = Besatzung · AS = Atemschutz
            </div>
          </div>
        )}
      </div>

      {/* 4. Eingesetzte Mittel */}
      <div className="card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden' }}>
        <SektionHeader nr={4} titel="Eingesetzte Mittel" fertig={!!(form.bioversal_l || form.absodan_kg || form.loeschwasser_l || form.schaummittel_l)} />
        {offen[4] && (
          <div style={{ padding: 16 }}>
            <div className="form-row">
              <div className="form-group">
                <label>Bioversal Gemisch (Liter)</label>
                <input type="number" value={form.bioversal_l} onChange={e => setForm(f => ({ ...f, bioversal_l: e.target.value }))} placeholder="0" min="0" />
              </div>
              <div className="form-group">
                <label>Absodan (kg)</label>
                <input type="number" value={form.absodan_kg} onChange={e => setForm(f => ({ ...f, absodan_kg: e.target.value }))} placeholder="0" min="0" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Löschwasser (Liter)</label>
                <input type="number" value={form.loeschwasser_l} onChange={e => setForm(f => ({ ...f, loeschwasser_l: e.target.value }))} placeholder="0" min="0" />
              </div>
              <div className="form-group">
                <label>Schaummittel (Liter)</label>
                <input type="number" value={form.schaummittel_l} onChange={e => setForm(f => ({ ...f, schaummittel_l: e.target.value }))} placeholder="0" min="0" />
              </div>
            </div>
            <div className="form-group">
              <label>Sonstiges</label>
              <input value={form.mittel_sonstiges} onChange={e => setForm(f => ({ ...f, mittel_sonstiges: e.target.value }))} placeholder="Weitere eingesetzte Mittel..." />
            </div>
          </div>
        )}
      </div>

      {/* 5. Beteiligte Organisationen */}
      <div className="card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden' }}>
        <SektionHeader nr={5} titel="Beteiligte Organisationen" fertig={orgAktiv} />
        {offen[5] && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Weitere Feuerwehren */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ margin: 0, fontWeight: 600 }}>Weitere Feuerwehren</label>
                <button type="button" className="btn btn-sm btn-secondary" onClick={addFW}>+ Hinzufügen</button>
              </div>
              {(form.organisationen.feuerwehren || []).map((fw, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input value={fw.name || ''} onChange={e => setFW(i, e.target.value)}
                    placeholder="Ortsteilfeuerwehr / Name" style={{ flex: 1 }} />
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => removeFW(i)}>✕</button>
                </div>
              ))}
              {(form.organisationen.feuerwehren || []).length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--gray-400)', margin: 0 }}>Keine weiteren Feuerwehren</p>
              )}
            </div>

            {/* Polizei */}
            <div>
              <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Polizei</label>
              <div className="form-row">
                <div className="form-group">
                  <label>Dienstgrad / Name</label>
                  <input value={form.organisationen.polizei?.name || ''} onChange={e => setOrgNested('polizei', 'name', e.target.value)} placeholder="z.B. PHK Müller" />
                </div>
                <div className="form-group">
                  <label>Aktenzeichen</label>
                  <input value={form.organisationen.polizei?.aktenzeichen || ''} onChange={e => setOrgNested('polizei', 'aktenzeichen', e.target.value)} placeholder="Az." />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Dienststelle</label>
                  <input value={form.organisationen.polizei?.dienststelle || ''} onChange={e => setOrgNested('polizei', 'dienststelle', e.target.value)} />
                </div>
                <div className="form-group" style={{ justifyContent: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 'normal', marginTop: 24 }}>
                    <input type="checkbox" checked={form.organisationen.polizei?.autobahn || false}
                      onChange={e => setOrgNested('polizei', 'autobahn', e.target.checked)} style={{ width: 'auto' }} />
                    Autobahnpolizei
                  </label>
                </div>
              </div>
            </div>

            {/* Rettungsdienste */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ margin: 0, fontWeight: 600 }}>Rettungsdienst</label>
                <button type="button" className="btn btn-sm btn-secondary" onClick={addRD}>+ Hinzufügen</button>
              </div>
              {(form.organisationen.rettungsdienste || []).map((rd, i) => (
                <div key={i} style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['RTW', 'NEF', 'KTW', 'NAW'].map(t => (
                        <button key={t} type="button"
                          className={`btn btn-sm ${rd.typ === t ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setRD(i, 'typ', t)}>{t}</button>
                      ))}
                    </div>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeRD(i)}>✕</button>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Funkkenner</label>
                      <input value={rd.funkkenner || ''} onChange={e => setRD(i, 'funkkenner', e.target.value)} placeholder="z.B. RTW 1/83-1" />
                    </div>
                    <div className="form-group">
                      <label>Gesellschaft</label>
                      <input value={rd.gesellschaft || ''} onChange={e => setRD(i, 'gesellschaft', e.target.value)} placeholder="z.B. DRK Erfurt" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Name / Besatzung</label>
                    <input value={rd.name || ''} onChange={e => setRD(i, 'name', e.target.value)} placeholder="Name des Rettungsassistenten / Sanitäters" />
                  </div>
                </div>
              ))}
              {(form.organisationen.rettungsdienste || []).length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--gray-400)', margin: 0 }}>Kein Rettungsdienst eingesetzt</p>
              )}
            </div>

            {/* Einsatzleitung */}
            <div>
              <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Einsatzleitung</label>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input value={form.organisationen.einsatzleitung?.name || ''} onChange={e => setOrgNested('einsatzleitung', 'name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Feuerwehr</label>
                  <input value={form.organisationen.einsatzleitung?.feuerwehr || ''} onChange={e => setOrgNested('einsatzleitung', 'feuerwehr', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Übergabe */}
            <div>
              <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Übergeben an</label>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input value={form.organisationen.uebergabe?.name || ''} onChange={e => setOrgNested('uebergabe', 'name', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Uhrzeit</label>
                  <input type="time" value={form.organisationen.uebergabe?.uhrzeit || ''} onChange={e => setOrgNested('uebergabe', 'uhrzeit', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Funktion</label>
                  <input value={form.organisationen.uebergabe?.funktion || ''} onChange={e => setOrgNested('uebergabe', 'funktion', e.target.value)} placeholder="z.B. Polizei" />
                </div>
              </div>
            </div>

            {/* Betroffene Personen */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ margin: 0, fontWeight: 600 }}>Betroffene Personen</label>
                <button type="button" className="btn btn-sm btn-secondary" onClick={addPerson}>+ Hinzufügen</button>
              </div>
              {(form.organisationen.betroffene || []).map((p, i) => (
                <div key={i} style={{ border: '1px solid var(--gray-200)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--gray-600)' }}>Person {i + 1}</span>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removePerson(i)}>✕</button>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Vorname</label>
                      <input value={p.vorname || ''} onChange={e => setPerson(i, 'vorname', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Nachname</label>
                      <input value={p.nachname || ''} onChange={e => setPerson(i, 'nachname', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Geboren am</label>
                      <input type="date" value={p.geboren || ''} onChange={e => setPerson(i, 'geboren', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Adresse</label>
                      <input value={p.adresse || ''} onChange={e => setPerson(i, 'adresse', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Art der Beteiligung</label>
                      <input value={p.art || ''} onChange={e => setPerson(i, 'art', e.target.value)} placeholder="z.B. Geschädigter, Fahrer" />
                    </div>
                    <div className="form-group">
                      <label>Kennzeichen</label>
                      <input value={p.kennzeichen || ''} onChange={e => setPerson(i, 'kennzeichen', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
              {(form.organisationen.betroffene || []).length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--gray-400)', margin: 0 }}>Keine betroffenen Personen</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 6. Kurzbericht & Fotos */}
      <div className="card" style={{ padding: 0, marginBottom: 12, overflow: 'hidden' }}>
        <SektionHeader nr={6} titel="Kurzbericht & Fotos" fertig={!!berichtAktiv} />
        {offen[6] && (
          <div style={{ padding: 16 }}>
            <div className="form-group">
              <label>Lage beim Eintreffen</label>
              <textarea rows={4} value={form.lage_eintreffen} onChange={e => setForm(f => ({ ...f, lage_eintreffen: e.target.value }))}
                placeholder="Beschreibung der Lage beim Eintreffen der Feuerwehr..." />
            </div>
            <div className="form-group">
              <label>Tätigkeiten</label>
              <textarea rows={4} value={form.taetigkeiten} onChange={e => setForm(f => ({ ...f, taetigkeiten: e.target.value }))}
                placeholder="Durchgeführte Maßnahmen und Tätigkeiten..." />
            </div>
            <div className="form-group">
              <label>Erläuterung zur Lage</label>
              <textarea rows={3} value={form.erlaeuterung} onChange={e => setForm(f => ({ ...f, erlaeuterung: e.target.value }))}
                placeholder="Weitere Erläuterungen..." />
            </div>

            {/* Fotos */}
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ margin: 0 }}>
                Fotos ({fotoVorschau.length})
                {fotosLaden && <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 8 }}>⏳ Laden...</span>}
              </label>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => fotoInputRef.current?.click()}>
                  📷 Foto hinzufügen
                </button>
              </div>
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handleFotoAuswahl}
                style={{ display: 'none' }}
              />
              {fotoVorschau.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginTop: 8 }}>
                  {fotoVorschau.map((f, i) => (
                    <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3', background: 'var(--gray-100)' }}>
                      <img src={f.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => removeFoto(i)}
                        style={{
                          position: 'absolute', top: 4, right: 4, width: 22, height: 22,
                          borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none',
                          cursor: 'pointer', color: 'white', fontSize: 12, display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 7. Abschluss */}
      <div className="card" style={{ padding: 0, marginBottom: 24, overflow: 'hidden' }}>
        <SektionHeader nr={7} titel="Abschluss & Versand" fertig={false} />
        {offen[7] && (
          <div style={{ padding: 16 }}>
            <div className="form-group">
              <label>Name (Unterzeichner)</label>
              <input value={form.abschluss_name} onChange={e => setForm(f => ({ ...f, abschluss_name: e.target.value }))}
                style={{ maxWidth: 300 }} />
            </div>
          </div>
        )}
      </div>

      {/* Statusmeldungen */}
      {mailStatus && mailStatus !== 'sending' && mailStatus !== 'ok' && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>{mailStatus}</div>
      )}
      {mailStatus === 'ok' && (
        <div className="alert alert-success" style={{ marginBottom: 12 }}>✓ Einsatzbericht gesendet!</div>
      )}

      {/* ── Mail-Auswahl-Modal ───────────────────────────────────── */}
      {mailModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setMailModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,7 12,13 2,7"/>
                </svg>
                Einsatzbericht senden
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setMailModal(false)}>✕</button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--gray-500)', margin: '0 0 16px' }}>
              Wohin soll der Einsatzbericht als PDF gesendet werden?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Drucker */}
              {wehrData?.drucker_email ? (
                <button
                  className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start', gap: 12, padding: '14px 16px', textAlign: 'left' }}
                  onClick={() => perMailSenden('drucker_email')}
                >
                  <span style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gray-600)" strokeWidth="1.8">
                      <polyline points="6,9 6,2 18,2 18,9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
                    </svg>
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>An Drucker senden</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{wehrData.drucker_email}</div>
                  </div>
                </button>
              ) : (
                <div style={{ padding: '12px 16px', borderRadius: 8, border: '1px dashed var(--gray-200)', fontSize: 13, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="6,9 6,2 18,2 18,9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Kein Drucker konfiguriert
                </div>
              )}

              {/* Einsatzbericht-E-Mail */}
              {wehrData?.einsatzbericht_email ? (
                <button
                  className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start', gap: 12, padding: '14px 16px', textAlign: 'left' }}
                  onClick={() => perMailSenden('einsatzbericht_email')}
                >
                  <span style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--red-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="1.8">
                      <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,7 12,13 2,7"/>
                    </svg>
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>An Einsatz-E-Mail senden</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{wehrData.einsatzbericht_email}</div>
                  </div>
                </button>
              ) : (
                <div style={{ padding: '12px 16px', borderRadius: 8, border: '1px dashed var(--gray-200)', fontSize: 13, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,7 12,13 2,7"/></svg>
                  Keine Einsatz-E-Mail konfiguriert
                </div>
              )}

              {!wehrData?.drucker_email && !wehrData?.einsatzbericht_email && (
                <div className="alert alert-error" style={{ margin: 0 }}>
                  Fuer diese Wache sind keine E-Mail-Adressen hinterlegt. Bitte in der Wachen-Verwaltung eintragen.
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setMailModal(false)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {/* Footer-Buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', paddingBottom: 32 }}>
        <button className="btn btn-secondary" onClick={() => navigate('/einsatzbericht')}>Abbrechen</button>
        <button className="btn btn-secondary" onClick={lokalDrucken}>
          📄 PDF herunterladen
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setMailModal(true)}
          disabled={mailStatus === 'sending' || mailStatus === 'ok'}
        >
          {mailStatus === 'sending' ? (
            <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />&nbsp;Senden...</>
          ) : mailStatus === 'ok' ? '✓ Gesendet' : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                <rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,7 12,13 2,7"/>
              </svg>
              Per Mail senden
            </>
          )}
        </button>
        <button className="btn btn-secondary" onClick={() => speichern(false)} disabled={saving}>
          {saving ? 'Speichern...' : '💾 Entwurf speichern'}
        </button>
        <button className="btn btn-primary" onClick={() => speichern(true)} disabled={saving}>
          {saving ? 'Speichern...' : '✓ Abschliessen & speichern'}
        </button>
      </div>
    </div>
  )
}
