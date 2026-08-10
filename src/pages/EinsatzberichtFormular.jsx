import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { einsatzberichtPdf } from '../lib/einsatzberichtPdf'
import { useWakeLock } from '../hooks/useWakeLock'

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
  useWakeLock()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const wehrData = Array.isArray(profile?.wehr) ? profile?.wehr?.[0] : profile?.wehr

  const [kameraden, setKameraden] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mailStatus, setMailStatus] = useState(null)
  const [mailModal, setMailModal] = useState(false)
  const [verlassenModal, setVerlassenModal] = useState(false)
  const [fotoVorschau, setFotoVorschau] = useState([]) // [{file?, pfad?, dataUrl}]
  const [fotosLaden, setFotosLaden] = useState(false)
  const fotoInputRef = useRef(null)

  // Audio-Aufnahme
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioPfad, setAudioPfad] = useState(null)
  const [audioHochlade, setAudioHochlade] = useState(false)
  const [aufnahmeAktiv, setAufnahmeAktiv] = useState(false)
  const [aufnahmeZeit, setAufnahmeZeit] = useState(0)
  const [transkribiert, setTranskribiert] = useState(false)
  const [transkriptionLaeuft, setTranskriptionLaeuft] = useState(false)
  const [transkriptionFehler, setTranskriptionFehler] = useState('')
  const recorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const aufnahmeTimerRef = useRef(null)

  // Auto-Save
  const autoSaveIdRef = useRef(istNeu ? null : id)
  const dirtyRef = useRef(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState(null) // null | 'saving' | 'ok'
  const autoSaveTimerRef = useRef(null)
  const formRef = useRef(null)      // wird nach useState initialisiert
  const audioPfadRef = useRef(null)

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
      if (profile?.wehr_id) {
        // Schritt 1+2 parallel: Hauptwache-Mitglieder + Nebenwache-IDs + Bericht gleichzeitig
        const [hauptRes, nebenIdsRes, berichtRes] = await Promise.all([
          supabase.from('profiles').select('id,vorname,nachname')
            .eq('status', 'aktiv').eq('wehr_id', profile.wehr_id)
            .neq('rolle', 'tablet').order('nachname'),
          supabase.from('kamerad_wehren').select('kamerad_id').eq('wehr_id', profile.wehr_id),
          !istNeu ? supabase.from('einsatzberichte').select('*').eq('id', id).single() : Promise.resolve({ data: null, error: null }),
        ])

        const alle = [...(hauptRes.data ?? [])]
        const ids = new Set(alle.map(k => k.id))

        // Schritt 3: Nebenwachen-Profile (braucht IDs aus Schritt 2)
        const fremdIds = (nebenIdsRes.data ?? []).map(n => n.kamerad_id).filter(fid => !ids.has(fid))
        if (fremdIds.length > 0) {
          const { data: nebenProfile } = await supabase
            .from('profiles').select('id,vorname,nachname')
            .eq('status', 'aktiv').neq('rolle', 'tablet').in('id', fremdIds).order('nachname')
          for (const k of (nebenProfile ?? [])) {
            if (!ids.has(k.id)) { alle.push(k); ids.add(k.id) }
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

        // Bericht aus dem parallelen Promise.all verwenden
        const b = berichtRes.data
        if (berichtRes.error) console.error('Einsatzbericht laden Fehler:', berichtRes.error.message)

        if (!istNeu && b) {
          const saved = b.einsatzkraefte ?? []
          const savedIds = new Set(saved.map(k => k.kamerad_id))
          const ersteFz = wehrData?.fahrzeuge?.[0] || 'HLF 10'
          const fehlende = alle.filter(k => !savedIds.has(k.id)).map(k => ({
            kamerad_id: k.id, name: `${k.nachname}, ${k.vorname}`,
            aktiv: false, funktion: 'BS', fahrzeug: ersteFz, atemschutz: false,
          }))
          setForm({
            datum: b.datum ?? heute,
            alarmzeit: b.alarmzeit ?? '',
            einsatzart: b.einsatzart ?? '',
            einsatzort: b.einsatzort ?? '',
            km_gesamt: b.km_gesamt ?? '',
            fahrzeuge: b.fahrzeuge?.length
              ? b.fahrzeuge.map(f => ({ ...f, mitgefahren: f.mitgefahren ?? !!(f.ab || f.raus || f.an) }))
              : fahrzeugeAusNamen(wehrData?.fahrzeuge),
            einsatzkraefte: [...saved, ...fehlende].sort((a, b_) => a.name.localeCompare(b_.name, 'de')),
            bioversal_l: b.bioversal_l ?? '',
            absodan_kg: b.absodan_kg ?? '',
            loeschwasser_l: b.loeschwasser_l ?? '',
            schaummittel_l: b.schaummittel_l ?? '',
            mittel_sonstiges: b.mittel_sonstiges ?? '',
            organisationen: b.organisationen ?? { feuerwehren: [], polizei: {}, rettungsdienste: [], einsatzleitung: {}, uebergabe: {}, betroffene: [] },
            lage_eintreffen: b.lage_eintreffen ?? '',
            taetigkeiten: b.taetigkeiten ?? '',
            erlaeuterung: b.erlaeuterung ?? '',
            abschluss_name: b.abschluss_name ?? `${profile?.vorname ?? ''} ${profile?.nachname ?? ''}`.trim(),
            abgeschlossen: b.abgeschlossen ?? false,
          })

          // Audio aus Storage laden
          if (b.audio_pfad) {
            setAudioPfad(b.audio_pfad)
            supabase.storage.from('einsatz-audio').createSignedUrl(b.audio_pfad, 3600).then(({ data }) => {
              if (data?.signedUrl) setAudioUrl(data.signedUrl)
            })
          }

          // Fotos parallel laden
          if (b.foto_pfade?.length) {
            setFotosLaden(true)
            Promise.all(
              b.foto_pfade.map(async pfad => {
                try {
                  const { data: blob, error: dlErr } = await supabase.storage.from('einsatz-fotos').download(pfad)
                  if (dlErr || !blob) return null
                  const dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = e => resolve(e.target.result)
                    reader.onerror = reject
                    reader.readAsDataURL(blob)
                  })
                  return { pfad, dataUrl }
                } catch { return null }
              })
            ).then(results => {
              setFotoVorschau(results.filter(Boolean))
              setFotosLaden(false)
            })
          }
        }
      }
      setLoading(false)
    }
    laden()
  }, [id])

  // ── Refs synchron halten (Stale-Closure-Schutz) ──────────────
  useEffect(() => { formRef.current = form }, [form])
  useEffect(() => { audioPfadRef.current = audioPfad }, [audioPfad])

  // ── Dirty-Tracking ────────────────────────────────────────────
  const isInitialLoad = useRef(true)
  useEffect(() => {
    if (isInitialLoad.current) { isInitialLoad.current = false; return }
    dirtyRef.current = true
  }, [form])

  // ── Auto-Save alle 30s ────────────────────────────────────────
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(async () => {
      if (!dirtyRef.current || !profile?.wehr_id) return
      await stillesSpeichern()
    }, 30000)
    return () => clearInterval(autoSaveTimerRef.current)
  }, [profile])

  // ── beforeunload: speichern wenn dirty ────────────────────────
  useEffect(() => {
    async function handleBeforeUnload(e) {
      if (!dirtyRef.current) return
      // Synchrones Speichern per sendBeacon geht nicht bei komplexen Daten —
      // stattdessen warnen und User entscheiden lassen
      e.preventDefault()
      e.returnValue = 'Es gibt ungespeicherte Änderungen. Trotzdem verlassen?'
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // ── Stilles Speichern (Auto-Save) ─────────────────────────────
  async function stillesSpeichern() {
    if (!profile?.wehr_id) return
    setAutoSaveStatus('saving')
    const payload = bauePayload(false)
    try {
      if (!autoSaveIdRef.current) {
        const { data, error } = await supabase.from('einsatzberichte').insert(payload).select('id').single()
        if (!error && data?.id) autoSaveIdRef.current = data.id
      } else {
        await supabase.from('einsatzberichte').update(payload).eq('id', autoSaveIdRef.current)
      }
      dirtyRef.current = false
      setAutoSaveStatus('ok')
      setTimeout(() => setAutoSaveStatus(null), 2000)
    } catch { setAutoSaveStatus(null) }
  }

  function verlassen() {
    if (dirtyRef.current) {
      setVerlassenModal(true)
    } else {
      navigate('/einsatzbericht')
    }
  }

  async function speichernUndVerlassen() {
    setVerlassenModal(false)
    await stillesSpeichern()
    navigate('/einsatzbericht')
  }

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

  async function removeFoto(i) {
    const foto = fotoVorschau[i]
    // Bereits in Storage gespeicherte Fotos sofort löschen
    if (foto?.pfad) {
      await supabase.storage.from('einsatz-fotos').remove([foto.pfad])
    }
    setFotoVorschau(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Audio-Aufnahme ────────────────────────────────────────────
  function zeitstempelJetzt(art) {
    const now = new Date()
    const uhr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    return `\n[${uhr} Uhr – ${art}]\n`
  }

  async function starteAufnahme() {
    try {
      // Zeitstempel in Erläuterung einfügen
      const istFortsetzen = audioBlob !== null
      setForm(f => ({
        ...f,
        erlaeuterung: (f.erlaeuterung || '') + zeitstempelJetzt(istFortsetzen ? 'Aufnahme fortgesetzt' : 'Aufnahme gestartet'),
      }))

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
        MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 16000,
      })
      recorderRef.current = recorder
      audioChunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (audioUrl) URL.revokeObjectURL(audioUrl)
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
        transkribiere(blob)

        // Sofort in Supabase Storage hochladen
        if (profile?.wehr_id) {
          setAudioHochlade(true)
          const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
          const pfad = `${profile.wehr_id}/${Date.now()}.${ext}`
          const { error: upErr } = await supabase.storage.from('einsatz-audio').upload(pfad, blob, { contentType: blob.type })
          if (!upErr) {
            setAudioPfad(pfad)
            audioPfadRef.current = pfad
            dirtyRef.current = true
            // Sofort in DB schreiben, damit andere Geräte den Pfad sehen
            if (autoSaveIdRef.current) {
              await supabase.from('einsatzberichte').update({ audio_pfad: pfad }).eq('id', autoSaveIdRef.current)
            }
          }
          setAudioHochlade(false)
        }
      }
      recorder.start(1000)
      setAufnahmeAktiv(true)
      aufnahmeTimerRef.current = setInterval(() => setAufnahmeZeit(t => t + 1), 1000)
    } catch (err) {
      alert('Mikrofon nicht verfügbar: ' + err.message)
    }
  }

  function stoppeAufnahme() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    setAufnahmeAktiv(false)
    clearInterval(aufnahmeTimerRef.current)
  }

  function loescheAufnahme() {
    stoppeAufnahme()
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null); setAudioUrl(null); setAufnahmeZeit(0)
    setAudioPfad(null)
    setTranskribiert(false); setTranskriptionFehler('')
    audioChunksRef.current = []
  }

  async function transkribiere(blob) {
    setTranskriptionLaeuft(true)
    setTranskriptionFehler('')
    setTranskribiert(false)
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = e => res(e.target.result.split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(blob)
      })
      const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audio_inhalt: base64, audio_name: `aufnahme.${ext}` },
      })
      if (error || !data?.success) {
        const msg = data?.error || error?.message || 'Transkription fehlgeschlagen.'
        const istKeyFehler = msg.includes('GROQ_API_KEY') || msg.includes('OPENAI_API_KEY') || msg.includes('non-2xx') || msg.includes('401')
        setTranskriptionFehler(istKeyFehler
          ? 'Groq API Key fehlt – bitte in Supabase Edge Functions → Secrets als GROQ_API_KEY hinterlegen.'
          : msg)
      } else {
        const now = new Date()
        const uhr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        const datum = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        const transkriptText = `\n\n---\n[${datum}, ${uhr} Uhr – Sprachaufnahme]\n${data.text}`
        setForm(f => ({ ...f, taetigkeiten: (f.taetigkeiten || '') + transkriptText }))
        setTranskribiert(true)
      }
    } catch (e) {
      setTranskriptionFehler('Fehler: ' + e.message)
    } finally {
      setTranskriptionLaeuft(false)
    }
  }

  function formatAufZeit(sek) {
    const m = String(Math.floor(sek / 60)).padStart(2, '0')
    const s = String(sek % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  // ── Payload zusammenbauen ─────────────────────────────────────
  function bauePayload(abschliessen = false, fotoPfade = null) {
    const f = formRef.current   // immer aktuell, auch in Closures
    const ap = audioPfadRef.current
    return {
      wehr_id: profile.wehr_id,
      erstellt_von: profile.id,
      datum: f.datum || null,
      alarmzeit: f.alarmzeit || null,
      einsatzart: f.einsatzart || null,
      einsatzort: f.einsatzort || null,
      km_gesamt: f.km_gesamt ? parseFloat(f.km_gesamt) : null,
      fahrzeuge: f.fahrzeuge,
      einsatzkraefte: f.einsatzkraefte,
      bioversal_l: f.bioversal_l ? parseFloat(f.bioversal_l) : null,
      absodan_kg: f.absodan_kg ? parseFloat(f.absodan_kg) : null,
      loeschwasser_l: f.loeschwasser_l ? parseFloat(f.loeschwasser_l) : null,
      schaummittel_l: f.schaummittel_l ? parseFloat(f.schaummittel_l) : null,
      mittel_sonstiges: f.mittel_sonstiges || null,
      organisationen: f.organisationen,
      lage_eintreffen: f.lage_eintreffen || null,
      taetigkeiten: f.taetigkeiten || null,
      erlaeuterung: f.erlaeuterung || null,
      abschluss_name: f.abschluss_name || null,
      abgeschlossen: abschliessen || f.abgeschlossen,
      ...(fotoPfade !== null ? { foto_pfade: fotoPfade.length > 0 ? fotoPfade : null } : {}),
      ...(ap ? { audio_pfad: ap } : {}),
    }
  }

  // ── Speichern ─────────────────────────────────────────────────
  async function speichern(abschliessen = false) {
    if (!profile?.wehr_id) return alert('Du bist keiner Wache zugeordnet.')
    setSaving(true)

    // Fotos: bestehende Pfade behalten + neue parallel hochladen
    const vorhandenePfade = fotoVorschau.filter(f => f.pfad).map(f => f.pfad)
    const neueFotos = fotoVorschau.filter(f => f.file)
    const uploadErgebnisse = await Promise.all(
      neueFotos.map(async ({ file }) => {
        const ext = file.name.split('.').pop() || 'jpg'
        const pfad = `${profile.wehr_id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from('einsatz-fotos').upload(pfad, file, { contentType: file.type })
        if (upErr) return { pfad: null, fehler: upErr.message }
        return { pfad, fehler: null }
      })
    )
    const fehlgeschlagen = uploadErgebnisse.find(e => e.fehler)
    if (fehlgeschlagen) {
      setSaving(false)
      alert(`Foto-Upload fehlgeschlagen: ${fehlgeschlagen.fehler}\n\nBitte prüfe ob der Bucket "einsatz-fotos" in Supabase angelegt ist.`)
      return
    }
    const alleFotoPfade = [...vorhandenePfade, ...uploadErgebnisse.map(e => e.pfad)]
    const payload = bauePayload(abschliessen, alleFotoPfade)

    let error
    const zielId = autoSaveIdRef.current
    if (!zielId) {
      const res = await supabase.from('einsatzberichte').insert(payload).select('id').single()
      error = res.error
      if (!error && res.data?.id) autoSaveIdRef.current = res.data.id
    } else {
      const res = await supabase.from('einsatzberichte').update(payload).eq('id', zielId)
      error = res.error
    }

    dirtyRef.current = false
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

      // Audio-Aufnahme als base64 vorbereiten (falls vorhanden)
      let audioBase64 = null
      let audioName = null
      if (audioBlob) {
        audioBase64 = await new Promise((res, rej) => {
          const reader = new FileReader()
          reader.onload = e => res(e.target.result.split(',')[1])
          reader.onerror = rej
          reader.readAsDataURL(audioBlob)
        })
        const ext = audioBlob.type.includes('mp4') ? 'm4a' : 'webm'
        audioName = `Einsatzbericht_Audio_${datumStr}.${ext}`
      }

      const { data, error } = await supabase.functions.invoke('send-document-email', {
        body: {
          wehr_id: profile.wehr_id,
          email_feld: emailFeld,
          datei_inhalt: base64,
          datei_name: `Einsatzbericht_${datumStr}.pdf`,
          titel: `Einsatzbericht ${form.datum || ''} – ${form.einsatzort || ''}`,
          ...(audioBase64 ? { audio_inhalt: audioBase64, audio_name: audioName } : {}),
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
        <button className="btn btn-ghost btn-sm" onClick={verlassen}>
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
        {autoSaveStatus === 'saving' && (
          <span style={{ fontSize: 12, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#F59E0B', animation: 'pulse 1s infinite' }} />
            Speichern…
          </span>
        )}
        {autoSaveStatus === 'ok' && (
          <span style={{ fontSize: 12, color: '#059669' }}>✓ Automatisch gespeichert</span>
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

            {/* Audio-Aufnahme */}
            <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-700)' }}>🎙 Sprachaufnahme</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                    Aufnahme kann pausiert und fortgesetzt werden · Wird beim Mail-Versand als Anhang beigefügt
                  </div>
                </div>
                {aufnahmeAktiv && (
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700, color: '#EF4444', letterSpacing: 2 }}>
                    ● {formatAufZeit(aufnahmeZeit)}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={aufnahmeAktiv ? stoppeAufnahme : starteAufnahme}
                  style={{
                    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
                    background: aufnahmeAktiv ? '#EF4444' : 'var(--red)', color: 'white',
                    display: 'flex', alignItems: 'center', gap: 6,
                    boxShadow: aufnahmeAktiv ? '0 0 0 4px rgba(239,68,68,0.2)' : 'none',
                  }}
                >
                  {aufnahmeAktiv ? '⏸ Pause' : audioBlob ? '▶ Fortsetzen' : '🎙 Aufnahme starten'}
                </button>
                {audioUrl && !aufnahmeAktiv && (
                  <>
                    <audio controls src={audioUrl} style={{ flex: 1, minWidth: 200, height: 36 }} />
                    <button type="button" className="btn btn-sm btn-danger" onClick={loescheAufnahme} title="Aufnahme löschen">🗑</button>
                  </>
                )}
              </div>
              {audioBlob && !aufnahmeAktiv && (
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 6 }}>
                  {audioHochlade
                    ? '⏫ Aufnahme wird in Cloud gespeichert…'
                    : audioPfad
                      ? `✓ In Cloud gespeichert · ${(audioBlob.size / 1024 / 1024).toFixed(1)} MB · Von jedem Gerät abrufbar`
                      : `✓ Lokal verfügbar · ${(audioBlob.size / 1024 / 1024).toFixed(1)} MB · Wird beim Mail-Versand angehängt`
                  }
                </div>
              )}
              {transkriptionLaeuft && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, color: 'var(--gray-500)' }}>
                  <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Transkribiere Aufnahme mit Whisper AI…
                </div>
              )}
              {transkribiert && !transkriptionLaeuft && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#16a34a', fontWeight: 500 }}>
                  ✓ Text wurde in „Tätigkeiten" übertragen
                </div>
              )}
              {transkriptionFehler && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)' }}>
                  ⚠ Transkription: {transkriptionFehler}
                </div>
              )}
            </div>

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
        <button className="btn btn-secondary" onClick={verlassen}>Abbrechen</button>
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

      {/* Verlassen-Bestätigung */}
      {verlassenModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setVerlassenModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Ungespeicherte Änderungen</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setVerlassenModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 20 }}>
              Du hast Änderungen vorgenommen, die noch nicht gespeichert wurden. Was möchtest du tun?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => { setVerlassenModal(false); navigate('/einsatzbericht') }}>
                Ohne Speichern verlassen
              </button>
              <button className="btn btn-primary" onClick={speichernUndVerlassen} disabled={saving}>
                {saving ? 'Speichern…' : '💾 Speichern & Verlassen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
