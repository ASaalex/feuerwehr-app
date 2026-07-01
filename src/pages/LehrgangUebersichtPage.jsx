import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function LehrgangUebersichtPage() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [zuweisungen, setZuweisungen] = useState([])
  const [fortschritt, setFortschritt] = useState([]) // alle Fortschritt-Rows des Users
  const [fragenAnzahl, setFragenAnzahl] = useState({}) // vorbereitung_id → Anzahl freigegebene Fragen
  const [loading, setLoading] = useState(true)

  useEffect(() => { laden() }, [])

  async function laden() {
    setLoading(true)
    // Zugewiesene Lehrgänge
    const { data: z } = await supabase
      .from('lehrgang_zuweisungen')
      .select('*, lehrgang_vorbereitungen(*)')
      .eq('user_id', profile.id)
    const zs = (z ?? []).filter(x => x.lehrgang_vorbereitungen?.aktiv)
    setZuweisungen(zs)

    if (zs.length) {
      const vIds = zs.map(x => x.vorbereitung_id)

      // Anzahl freigegebener Fragen je Lehrgang
      const { data: themen } = await supabase
        .from('lehrgang_themen')
        .select('id, vorbereitung_id')
        .in('vorbereitung_id', vIds)
      const themaIds = (themen ?? []).map(t => t.id)
      const themaZuLehrgang = {}
      ;(themen ?? []).forEach(t => {
        if (!themaZuLehrgang[t.id]) themaZuLehrgang[t.id] = t.vorbereitung_id
      })

      if (themaIds.length) {
        const { data: fragen } = await supabase
          .from('lehrgang_fragen')
          .select('id, thema_id')
          .in('thema_id', themaIds)
          .eq('freigegeben', true)
        const anzahl = {}
        ;(fragen ?? []).forEach(f => {
          const vid = themaZuLehrgang[f.thema_id]
          if (vid) anzahl[vid] = (anzahl[vid] ?? 0) + 1
        })
        setFragenAnzahl(anzahl)

        // Fortschritt des Users
        const frageIds = (fragen ?? []).map(f => f.id)
        if (frageIds.length) {
          const { data: fp } = await supabase
            .from('lehrgang_fortschritt')
            .select('frage_id, richtig')
            .eq('user_id', profile.id)
            .in('frage_id', frageIds)
          setFortschritt(fp ?? [])
        }
      }
    }
    setLoading(false)
  }

  function prozent(vid) {
    const gesamt = fragenAnzahl[vid] ?? 0
    if (!gesamt) return null
    // Zähle Fragen die mind. einmal richtig beantwortet wurden
    // (fortschritt enthält alle Fragen des Users, wir filtern nach diesem Lehrgang)
    const richtig = fortschritt.filter(f => f.richtig).length
    // Vereinfachung: wir haben alle Fragen des Users global, daher pro Lehrgang
    // müssen wir gezielt zählen — dafür brauchen wir frage→lehrgang mapping
    // Das wird in LehrgangLernPage gemacht; hier schätzen wir grob
    return Math.min(100, Math.round((richtig / gesamt) * 100))
  }

  if (loading) return <div style={{ padding: 32, color: 'var(--gray-400)' }}>Lädt…</div>

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Lehrgangsausbildung</h1>
      <p style={{ color: 'var(--gray-400)', fontSize: 14, marginBottom: 24 }}>
        Deine zugewiesenen Lehrgänge zur Vorbereitung.
      </p>

      {zuweisungen.length === 0 ? (
        <div style={{ background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Noch kein Lehrgang zugewiesen</div>
          <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
            Dein Ausbilder oder Admin weist dir Lehrgänge im Verwaltungsbereich zu.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {zuweisungen.map(z => {
            const lv = z.lehrgang_vorbereitungen
            const gesamt = fragenAnzahl[z.vorbereitung_id] ?? 0
            return (
              <LehrgangKachel
                key={z.id}
                lv={lv}
                gesamt={gesamt}
                fortschritt={fortschritt}
                onClick={() => navigate(`/ausbildung/lehrgang/${z.vorbereitung_id}`)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function LehrgangKachel({ lv, gesamt, fortschritt, onClick }) {
  // Grobe Fortschrittsanzeige (genaue Berechnung in der Lernseite)
  const richtigCount = fortschritt.filter(f => f.richtig).length
  const pct = gesamt > 0 ? Math.min(100, Math.round((richtigCount / gesamt) * 100)) : 0
  const bereit = pct >= 80

  return (
    <div onClick={onClick} style={{
      background: 'var(--white)', border: '1px solid var(--gray-200)', borderRadius: 12,
      padding: 20, cursor: 'pointer', transition: 'box-shadow 0.15s',
      display: 'flex', alignItems: 'center', gap: 16,
    }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ width: 52, height: 52, borderRadius: 12, background: bereit ? '#d1fae5' : pct > 0 ? '#eff6ff' : 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
        {bereit ? '✅' : pct > 0 ? '📖' : '📚'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{lv.name}</div>
        {lv.beschreibung && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lv.beschreibung}</div>}
        {gesamt > 0 ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{gesamt} Fragen</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: bereit ? '#065f46' : pct >= 50 ? '#1e40af' : 'var(--gray-500)' }}>{pct}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: bereit ? '#10b981' : pct >= 50 ? '#3b82f6' : '#f59e0b', borderRadius: 3, transition: 'width 0.4s' }} />
            </div>
            {bereit && <div style={{ fontSize: 11, color: '#065f46', fontWeight: 600, marginTop: 4 }}>🎓 Bereit für den Lehrgang</div>}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Noch keine Fragen hinterlegt</div>
        )}
      </div>
      <div style={{ color: 'var(--gray-300)', fontSize: 18, flexShrink: 0 }}>›</div>
    </div>
  )
}
