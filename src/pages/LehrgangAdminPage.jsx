import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function LehrgangAdminPage() {
  const { profile } = useAuth()
  const [lehrgaenge, setLehrgaenge] = useState([])
  const [aktiver, setAktiver] = useState(null) // ausgewählter Lehrgang
  const [themen, setThemen] = useState([])
  const [fragen, setFragen] = useState([]) // alle Fragen des Lehrgangs
  const [dokumente, setDokumente] = useState([])
  const [kamerade, setKamerade] = useState([])
  const [zuweisungen, setZuweisungen] = useState([])
  const [tab, setTab] = useState('themen') // themen | dokumente | zuweisung
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Modals
  const [neuerLehrgang, setNeuerLehrgang] = useState(false)
  const [lvForm, setLvForm] = useState({ name: '', beschreibung: '' })
  const [neuesThema, setNeuesThema] = useState(null) // thema_id oder 'neu'
  const [themaForm, setThemaForm] = useState({ titel: '' })
  const [frageModal, setFrageModal] = useState(null) // { thema_id, frage? }
  const [frageForm, setFrageForm] = useState(defaultFrageForm())
  const [kiGenerieren, setKiGenerieren] = useState(false) // { thema }
  const [kiLaedt, setKiLaedt] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dokForm, setDokForm] = useState({ titel: '', quelle: '', datei: null })
  const fileRef = useRef(null)

  function defaultFrageForm() {
    return { typ: 'multiple_choice', frage: '', erklaerung: '', antworten: [
      { text: '', richtig: true }, { text: '', richtig: false },
      { text: '', richtig: false }, { text: '', richtig: false },
    ]}
  }

  function zeig(t, ms = 4000) { setMsg(t); setTimeout(() => setMsg(''), ms) }

  useEffect(() => { ladeLehrgaenge() }, [])
  useEffect(() => { if (aktiver) { ladeThemen(); ladeDokumente(); ladeZuweisungen() } }, [aktiver])

  async function ladeLehrgaenge() {
    setLoading(true)
    const { data } = await supabase.from('lehrgang_vorbereitungen').select('*').order('name')
    setLehrgaenge(data ?? [])
    setLoading(false)
  }

  async function ladeThemen() {
    const { data: t } = await supabase.from('lehrgang_themen')
      .select('*').eq('vorbereitung_id', aktiver.id).order('reihenfolge')
    setThemen(t ?? [])
    if (t?.length) {
      const ids = t.map(x => x.id)
      const { data: f } = await supabase.from('lehrgang_fragen')
        .select('*').in('thema_id', ids).order('reihenfolge')
      setFragen(f ?? [])
    } else { setFragen([]) }
  }

  async function ladeDokumente() {
    const { data } = await supabase.from('lehrgang_dokumente')
      .select('*').eq('vorbereitung_id', aktiver.id).order('hochgeladen_am')
    setDokumente(data ?? [])
  }

  async function ladeZuweisungen() {
    const { data: z } = await supabase.from('lehrgang_zuweisungen')
      .select('*, profiles(id,vorname,nachname,rolle)').eq('vorbereitung_id', aktiver.id)
    setZuweisungen(z ?? [])
    if (!kamerade.length) {
      const { data: k } = await supabase.from('profiles')
        .select('id,vorname,nachname,rolle').order('nachname')
      setKamerade(k ?? [])
    }
  }

  async function lehrgangSpeichern() {
    if (!lvForm.name.trim()) return
    const { error } = await supabase.from('lehrgang_vorbereitungen').insert({
      name: lvForm.name.trim(), beschreibung: lvForm.beschreibung.trim() || null,
    })
    if (error) { zeig('Fehler: ' + error.message); return }
    setNeuerLehrgang(false); setLvForm({ name: '', beschreibung: '' })
    await ladeLehrgaenge(); zeig('Lehrgang angelegt.')
  }

  async function lehrgangToggleAktiv(lv) {
    await supabase.from('lehrgang_vorbereitungen').update({ aktiv: !lv.aktiv }).eq('id', lv.id)
    await ladeLehrgaenge()
    if (aktiver?.id === lv.id) setAktiver(prev => ({ ...prev, aktiv: !prev.aktiv }))
  }

  async function themaHinzufuegen() {
    if (!themaForm.titel.trim()) return
    const max = themen.length ? Math.max(...themen.map(t => t.reihenfolge)) : -1
    await supabase.from('lehrgang_themen').insert({
      vorbereitung_id: aktiver.id, titel: themaForm.titel.trim(), reihenfolge: max + 1,
    })
    setNeuesThema(null); setThemaForm({ titel: '' }); await ladeThemen()
  }

  async function themaLoeschen(id) {
    if (!confirm('Thema und alle Fragen löschen?')) return
    await supabase.from('lehrgang_themen').delete().eq('id', id)
    await ladeThemen()
  }

  async function frageSpeichern() {
    const f = frageForm
    if (!f.frage.trim()) return
    let antworten = null
    if (f.typ === 'multiple_choice' || f.typ === 'ja_nein') {
      antworten = f.antworten.filter(a => a.text.trim()).map(a => ({ text: a.text.trim(), richtig: a.richtig }))
      if (antworten.length < 2) { zeig('Mindestens 2 Antworten eingeben.'); return }
    }
    const payload = {
      thema_id: frageModal.thema_id,
      typ: f.typ, frage: f.frage.trim(),
      erklaerung: f.erklaerung.trim() || null,
      antworten, freigegeben: true, ki_generiert: false,
    }
    if (frageModal.frage) {
      await supabase.from('lehrgang_fragen').update(payload).eq('id', frageModal.frage.id)
    } else {
      const max = fragen.filter(x => x.thema_id === frageModal.thema_id).length
      await supabase.from('lehrgang_fragen').insert({ ...payload, reihenfolge: max })
    }
    setFrageModal(null); setFrageForm(defaultFrageForm()); await ladeThemen()
  }

  async function frageLoeschen(id) {
    if (!confirm('Frage löschen?')) return
    await supabase.from('lehrgang_fragen').delete().eq('id', id)
    await ladeThemen()
  }

  async function frageFreigeben(f) {
    await supabase.from('lehrgang_fragen').update({ freigegeben: !f.freigegeben }).eq('id', f.id)
    await ladeThemen()
  }

  async function kiGenerierenStarten(thema) {
    setKiLaedt(true)
    try {
      // Dokument-Texte aus Storage lesen (nur Metadaten hier, Textextraktion in Edge Fn)
      const dokTexte = dokumente.map(d => `Dokument: ${d.titel} (${d.quelle ?? 'intern'})`).join('\n')
      // Regelwerke aus DB
      const { data: rw } = await supabase.from('regelwerke')
        .select('titel,inhalt_text').eq('aktiv', true).not('inhalt_text', 'is', null).limit(3)
      const rwTexte = (rw ?? []).map(r => r.inhalt_text?.slice(0, 3000) ?? '').filter(Boolean)

      const { data, error } = await supabase.functions.invoke('generate-lehrgang-fragen', {
        body: {
          thema_titel: thema.titel,
          lehrgang_name: aktiver.name,
          dokument_texte: dokTexte ? [dokTexte] : [],
          regelwerk_texte: rwTexte,
          anzahl: 6,
        }
      })
      if (error || !data?.success) throw new Error(data?.error ?? error?.message)

      // Fragen als nicht-freigegeben einspeichern
      const max = fragen.filter(x => x.thema_id === thema.id).length
      const rows = (data.fragen ?? []).map((f, i) => ({
        thema_id: thema.id, typ: f.typ, frage: f.frage,
        antworten: f.antworten ?? null, erklaerung: f.erklaerung ?? null,
        ki_generiert: true, freigegeben: false, reihenfolge: max + i,
      }))
      if (rows.length) await supabase.from('lehrgang_fragen').insert(rows)
      setKiGenerieren(false); await ladeThemen()
      zeig(`${rows.length} KI-Fragen generiert — bitte prüfen und freigeben.`)
    } catch (e) {
      zeig('Fehler: ' + e.message)
    }
    setKiLaedt(false)
  }

  async function dokumentHochladen() {
    if (!dokForm.datei || !dokForm.titel.trim()) return
    setUploading(true)
    const ext = dokForm.datei.name.split('.').pop()
    const pfad = `lehrgaenge/${aktiver.id}/${Date.now()}.${ext}`
    const { error: se } = await supabase.storage.from('dokumente').upload(pfad, dokForm.datei)
    if (se) { zeig('Upload-Fehler: ' + se.message); setUploading(false); return }
    await supabase.from('lehrgang_dokumente').insert({
      vorbereitung_id: aktiver.id, titel: dokForm.titel.trim(),
      quelle: dokForm.quelle.trim() || null, datei_pfad: pfad,
    })
    setDokForm({ titel: '', quelle: '', datei: null })
    if (fileRef.current) fileRef.current.value = ''
    await ladeDokumente(); setUploading(false); zeig('Dokument hochgeladen.')
  }

  async function dokumentLoeschen(dok) {
    if (!confirm('Dokument löschen?')) return
    await supabase.storage.from('dokumente').remove([dok.datei_pfad])
    await supabase.from('lehrgang_dokumente').delete().eq('id', dok.id)
    await ladeDokumente()
  }

  async function dokumentOeffnen(dok) {
    const { data } = await supabase.storage.from('dokumente').createSignedUrl(dok.datei_pfad, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function zuweisenToggle(userId) {
    const existing = zuweisungen.find(z => z.user_id === userId)
    if (existing) {
      await supabase.from('lehrgang_zuweisungen').delete().eq('id', existing.id)
    } else {
      await supabase.from('lehrgang_zuweisungen').insert({
        user_id: userId, vorbereitung_id: aktiver.id, zugewiesen_von: profile.id,
      })
    }
    await ladeZuweisungen()
  }

  function frageEditOeffnen(thema_id, frage = null) {
    if (frage) {
      let antworten = frage.antworten ?? [
        { text: '', richtig: true }, { text: '', richtig: false },
        { text: '', richtig: false }, { text: '', richtig: false },
      ]
      if (frage.typ === 'multiple_choice' && antworten.length < 4) {
        while (antworten.length < 4) antworten.push({ text: '', richtig: false })
      }
      setFrageForm({ typ: frage.typ, frage: frage.frage, erklaerung: frage.erklaerung ?? '', antworten })
    } else {
      setFrageForm(defaultFrageForm())
    }
    setFrageModal({ thema_id, frage })
  }

  const fragenVonThema = (tid) => fragen.filter(f => f.thema_id === tid)

  if (loading) return <div style={{ padding: 32, color: 'var(--gray-400)' }}>Lädt…</div>

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Lehrgangs-Verwaltung</h1>
        <button onClick={() => setNeuerLehrgang(true)} className="btn btn-primary btn-sm">+ Neuer Lehrgang</button>
      </div>
      <p style={{ color: 'var(--gray-400)', fontSize: 14, marginBottom: 20 }}>
        Lehrgänge, Themen, Fragen und Materialien verwalten.
      </p>

      {msg && <div style={{ padding: '10px 14px', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 8, marginBottom: 16, fontSize: 14, color: '#065f46' }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: aktiver ? '220px 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
        {/* Lehrgang-Liste */}
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--gray-100)' }}>
            Lehrgänge ({lehrgaenge.length})
          </div>
          {lehrgaenge.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: 'var(--gray-400)' }}>Noch keine Lehrgänge.</div>
          )}
          {lehrgaenge.map(lv => (
            <div key={lv.id} onClick={() => { setAktiver(lv); setTab('themen') }} style={{
              padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)',
              background: aktiver?.id === lv.id ? '#eff6ff' : 'transparent',
              borderLeft: aktiver?.id === lv.id ? '3px solid var(--red)' : '3px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: aktiver?.id === lv.id ? 700 : 500 }}>{lv.name}</div>
                {!lv.aktiv && <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>inaktiv</div>}
              </div>
              <button onClick={e => { e.stopPropagation(); lehrgangToggleAktiv(lv) }}
                className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px', color: lv.aktiv ? 'var(--gray-400)' : 'var(--red)', flexShrink: 0 }}>
                {lv.aktiv ? 'Deakt.' : 'Aktiv.'}
              </button>
            </div>
          ))}
        </div>

        {/* Detail-Bereich */}
        {aktiver && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{aktiver.name}</div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--gray-100)', borderRadius: 8, padding: 3, width: 'fit-content' }}>
              {[['themen', '📋 Themen & Fragen'], ['dokumente', '📄 Materialien'], ['zuweisung', '👥 Zuweisung']].map(([t, l]) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: tab === t ? 'var(--white)' : 'transparent',
                  color: tab === t ? 'var(--gray-800)' : 'var(--gray-400)',
                  boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}>{l}</button>
              ))}
            </div>

            {/* Tab: Themen & Fragen */}
            {tab === 'themen' && (
              <div>
                {themen.map(thema => (
                  <div key={thema.id} style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 10, marginBottom: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--gray-700)', color: 'white' }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{thema.titel}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setKiGenerieren(thema)} className="btn btn-sm"
                          style={{ background: '#7c3aed', color: 'white', border: 'none', fontSize: 11, padding: '3px 10px' }}>
                          ✨ KI-Fragen
                        </button>
                        <button onClick={() => frageEditOeffnen(thema.id)} className="btn btn-sm"
                          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', fontSize: 11, padding: '3px 10px' }}>
                          + Frage
                        </button>
                        <button onClick={() => themaLoeschen(thema.id)} className="btn btn-ghost btn-sm"
                          style={{ color: 'rgba(255,100,100,0.8)', fontSize: 11 }}>✕</button>
                      </div>
                    </div>
                    {fragenVonThema(thema.id).length === 0 && (
                      <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--gray-400)' }}>Noch keine Fragen.</div>
                    )}
                    {fragenVonThema(thema.id).map(frage => (
                      <FrageZeile key={frage.id} frage={frage}
                        onEdit={() => frageEditOeffnen(thema.id, frage)}
                        onDelete={() => frageLoeschen(frage.id)}
                        onToggleFreigabe={() => frageFreigeben(frage)}
                      />
                    ))}
                  </div>
                ))}
                <button onClick={() => setNeuesThema(true)} className="btn btn-secondary btn-sm">+ Thema hinzufügen</button>
              </div>
            )}

            {/* Tab: Materialien */}
            {tab === 'dokumente' && (
              <div>
                <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Neues Material hochladen</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input className="form-control" placeholder="Titel (z.B. Lernunterlage Fahrzeugkunde)" value={dokForm.titel} onChange={e => setDokForm(p => ({ ...p, titel: e.target.value }))} />
                    <input className="form-control" placeholder="Quelle (z.B. Landkreis, DFV)" value={dokForm.quelle} onChange={e => setDokForm(p => ({ ...p, quelle: e.target.value }))} />
                    <input ref={fileRef} type="file" accept=".pdf,.docx,.pptx" className="form-control" onChange={e => setDokForm(p => ({ ...p, datei: e.target.files[0] ?? null }))} />
                    <button onClick={dokumentHochladen} className="btn btn-primary" disabled={!dokForm.datei || !dokForm.titel.trim() || uploading}>
                      {uploading ? 'Hochladen…' : '⬆ Hochladen'}
                    </button>
                  </div>
                </div>
                {dokumente.length === 0 && <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Noch keine Materialien.</div>}
                {dokumente.map(dok => (
                  <div key={dok.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>📄 {dok.titel}</div>
                      {dok.quelle && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{dok.quelle}</div>}
                    </div>
                    <button onClick={() => dokumentOeffnen(dok)} className="btn btn-secondary btn-sm">Öffnen</button>
                    <button onClick={() => dokumentLoeschen(dok)} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Tab: Zuweisungen */}
            {tab === 'zuweisung' && (
              <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--gray-100)' }}>
                  Kamerade zuweisen ({zuweisungen.length} zugewiesen)
                </div>
                {kamerade.map(k => {
                  const zugewiesen = zuweisungen.some(z => z.user_id === k.id)
                  return (
                    <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--gray-100)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{k.vorname} {k.nachname}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{k.rolle}</div>
                      </div>
                      <button onClick={() => zuweisenToggle(k.id)} className="btn btn-sm"
                        style={{ background: zugewiesen ? '#d1fae5' : 'var(--gray-100)', color: zugewiesen ? '#065f46' : 'var(--gray-600)', border: 'none', fontWeight: 600, padding: '4px 12px' }}>
                        {zugewiesen ? '✓ Zugewiesen' : '+ Zuweisen'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Neuer Lehrgang */}
      {neuerLehrgang && (
        <Modal title="Neuer Lehrgang" onClose={() => setNeuerLehrgang(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input autoFocus className="form-control" placeholder="Name (z.B. Truppführer)" value={lvForm.name} onChange={e => setLvForm(p => ({ ...p, name: e.target.value }))} />
            <textarea className="form-control" placeholder="Beschreibung (optional)" rows={2} value={lvForm.beschreibung} onChange={e => setLvForm(p => ({ ...p, beschreibung: e.target.value }))} />
            <button onClick={lehrgangSpeichern} className="btn btn-primary" disabled={!lvForm.name.trim()}>Anlegen</button>
          </div>
        </Modal>
      )}

      {/* Modal: Neues Thema */}
      {neuesThema && (
        <Modal title="Thema hinzufügen" onClose={() => setNeuesThema(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input autoFocus className="form-control" placeholder="Thema (z.B. Fahrzeugkunde)" value={themaForm.titel} onChange={e => setThemaForm({ titel: e.target.value })} />
            <button onClick={themaHinzufuegen} className="btn btn-primary" disabled={!themaForm.titel.trim()}>Hinzufügen</button>
          </div>
        </Modal>
      )}

      {/* Modal: Frage bearbeiten */}
      {frageModal && (
        <Modal title={frageModal.frage ? 'Frage bearbeiten' : 'Neue Frage'} onClose={() => setFrageModal(null)} wide>
          <FrageFormular form={frageForm} onChange={setFrageForm} onSave={frageSpeichern} />
        </Modal>
      )}

      {/* Modal: KI-Generierung */}
      {kiGenerieren && (
        <Modal title={`KI-Fragen: ${kiGenerieren.titel}`} onClose={() => !kiLaedt && setKiGenerieren(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.5 }}>
              Claude generiert <strong>6 Fragen</strong> für dieses Thema — basierend auf den hochgeladenen Materialien und allen Regelwerken in der App.<br /><br />
              Die Fragen werden zunächst als <strong>„Nicht freigegeben"</strong> gespeichert — du kannst sie prüfen und einzeln freigeben oder löschen.
            </div>
            {dokumente.length === 0 && (
              <div style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', padding: '8px 12px', borderRadius: 6 }}>
                Hinweis: Noch keine Materialien für diesen Lehrgang hochgeladen. Claude nutzt nur allgemeine Regelwerke.
              </div>
            )}
            <button onClick={() => kiGenerierenStarten(kiGenerieren)} className="btn btn-primary" disabled={kiLaedt}
              style={{ background: '#7c3aed', border: 'none' }}>
              {kiLaedt ? '✨ Wird generiert…' : '✨ Jetzt generieren'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function FrageZeile({ frage, onEdit, onDelete, onToggleFreigabe }) {
  const typLabel = { multiple_choice: 'MC', ja_nein: 'J/N', karteikarte: 'Karte', freitext: 'Text' }
  const typColor = { multiple_choice: '#1e40af', ja_nein: '#065f46', karteikarte: '#92400e', freitext: '#7c3aed' }
  const typBg = { multiple_choice: '#dbeafe', ja_nein: '#d1fae5', karteikarte: '#fef3c7', freitext: '#ede9fe' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: '1px solid var(--gray-100)', opacity: frage.freigegeben ? 1 : 0.6 }}>
      <span style={{ fontSize: 10, fontWeight: 700, background: typBg[frage.typ], color: typColor[frage.typ], padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
        {typLabel[frage.typ]}
      </span>
      <div style={{ flex: 1, fontSize: 13 }}>{frage.frage}</div>
      {frage.ki_generiert && <span style={{ fontSize: 10, color: '#7c3aed' }}>✨KI</span>}
      {!frage.freigegeben && <span style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', padding: '1px 5px', borderRadius: 3 }}>Prüfen</span>}
      <button onClick={onToggleFreigabe} className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px', color: frage.freigegeben ? 'var(--gray-400)' : '#065f46' }}>
        {frage.freigegeben ? 'Sperren' : '✓ Freigeben'}
      </button>
      <button onClick={onEdit} className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 12 }}>✎</button>
      <button onClick={onDelete} className="btn btn-ghost btn-sm" style={{ color: 'var(--red)', padding: '2px 6px', fontSize: 12 }}>✕</button>
    </div>
  )
}

function FrageFormular({ form, onChange, onSave }) {
  const set = (k, v) => onChange(p => ({ ...p, [k]: v }))
  const setAntwort = (i, k, v) => onChange(p => {
    const a = [...p.antworten]
    a[i] = { ...a[i], [k]: v }
    if (k === 'richtig' && v) a.forEach((x, j) => { if (j !== i) a[j] = { ...a[j], richtig: false } })
    return { ...p, antworten: a }
  })

  const brauchtAntworten = form.typ === 'multiple_choice' || form.typ === 'ja_nein'

  useEffect(() => {
    if (form.typ === 'ja_nein') {
      onChange(p => ({ ...p, antworten: [{ text: 'Richtig', richtig: true }, { text: 'Falsch', richtig: false }] }))
    } else if (form.typ === 'multiple_choice') {
      if (!form.antworten || form.antworten.length < 4) {
        onChange(p => ({ ...p, antworten: [
          { text: '', richtig: true }, { text: '', richtig: false },
          { text: '', richtig: false }, { text: '', richtig: false },
        ]}))
      }
    }
  }, [form.typ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['multiple_choice', 'ja_nein', 'karteikarte', 'freitext'].map(t => (
          <button key={t} onClick={() => set('typ', t)} className="btn btn-sm"
            style={{ background: form.typ === t ? 'var(--red)' : 'var(--gray-100)', color: form.typ === t ? 'white' : 'var(--gray-700)', border: 'none' }}>
            {{ multiple_choice: '☑ Multiple Choice', ja_nein: '✓/✗ Ja/Nein', karteikarte: '🃏 Karteikarte', freitext: '✏ Freitext' }[t]}
          </button>
        ))}
      </div>
      <textarea className="form-control" placeholder="Frage…" rows={2} value={form.frage} onChange={e => set('frage', e.target.value)} />
      {brauchtAntworten && form.antworten && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)' }}>Antworten (✓ = richtig)</div>
          {form.antworten.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={a.richtig} onChange={e => setAntwort(i, 'richtig', e.target.checked)} style={{ flexShrink: 0, accentColor: 'var(--red)' }} />
              {form.typ === 'ja_nein'
                ? <span style={{ flex: 1, fontSize: 13, color: 'var(--gray-600)' }}>{a.text}</span>
                : <input className="form-control" value={a.text} onChange={e => setAntwort(i, 'text', e.target.value)} placeholder={`Antwort ${i + 1}`} />
              }
            </div>
          ))}
        </div>
      )}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 4 }}>
          {form.typ === 'karteikarte' ? 'Antwort (wird aufgedeckt)' : form.typ === 'freitext' ? 'Musterlösung (KI nutzt diese zur Bewertung)' : 'Erklärung (nach Beantwortung sichtbar)'}
        </div>
        <textarea className="form-control" rows={2} value={form.erklaerung} onChange={e => set('erklaerung', e.target.value)} placeholder="Erklärung oder Musterlösung…" />
      </div>
      <button onClick={onSave} className="btn btn-primary" disabled={!form.frage.trim()}>Speichern</button>
    </div>
  )
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'white', borderRadius: 12, padding: 20, width: '100%', maxWidth: wide ? 560 : 400, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--gray-400)' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
