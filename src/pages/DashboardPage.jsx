import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

export default function DashboardPage() {
  const { profile, isAdmin } = useAuth()
  const [stats, setStats] = useState({ kameraden: 0, dokumente: 0, pruefungen: 0, aufgaben: 0 })
  const [meineAufgaben, setMeineAufgaben] = useState([])
  const [ausstehend, setAusstehend] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const [
      { count: kameraden },
      { count: dokumente },
      { count: pruefungen },
      { count: aufgaben },
      { data: aufgabenData },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'aktiv'),
      supabase.from('dokumente').select('*', { count: 'exact', head: true }),
      supabase.from('pruefungen').select('*', { count: 'exact', head: true }).eq('aktiv', true),
      supabase.from('aufgaben').select('*', { count: 'exact', head: true }).eq('status', 'offen'),
      supabase.from('aufgaben').select('*, erstellt_von:profiles!aufgaben_erstellt_von_fkey(vorname,nachname)').eq('zugewiesen_an', profile?.id).neq('status', 'erledigt').order('erstellt_am', { ascending: false }).limit(5),
    ])

    setStats({ kameraden: kameraden ?? 0, dokumente: dokumente ?? 0, pruefungen: pruefungen ?? 0, aufgaben: aufgaben ?? 0 })
    setMeineAufgaben(aufgabenData ?? [])

    if (isAdmin) {
      const { data } = await supabase.from('profiles').select('id,vorname,nachname,email,erstellt_am').eq('status', 'ausstehend').order('erstellt_am', { ascending: false })
      setAusstehend(data ?? [])
    }

    setLoading(false)
  }

  async function aktivieren(id) {
    await supabase.from('profiles').update({ status: 'aktiv' }).eq('id', id)
    setAusstehend(a => a.filter(x => x.id !== id))
    setStats(s => ({ ...s, kameraden: s.kameraden + 1 }))
  }

  if (loading) return <div className="loading-page"><div className="spinner"></div></div>

  const stunde = new Date().getHours()
  const gruss = stunde < 12 ? 'Guten Morgen' : stunde < 18 ? 'Guten Tag' : 'Guten Abend'

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1>{gruss}, {profile?.vorname}!</h1>
        <p style={{ marginTop: 4, color: 'var(--gray-400)' }}>
          {format(new Date(), "EEEE, d. MMMM yyyy", { locale: de })} · {rolleLabel(profile?.rolle)}
        </p>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card accent">
          <div className="stat-label">Aktive Kameraden</div>
          <div className="stat-value">{stats.kameraden}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Dokumente</div>
          <div className="stat-value">{stats.dokumente}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Aktive Prüfungen</div>
          <div className="stat-value">{stats.pruefungen}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Offene Aufgaben</div>
          <div className="stat-value">{stats.aufgaben}</div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Meine Aufgaben */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3>Meine Aufgaben</h3>
            <Link to="/aufgaben" className="btn btn-ghost btn-sm">Alle →</Link>
          </div>
          {meineAufgaben.length === 0 ? (
            <p style={{ color: 'var(--gray-400)', fontSize: 14, padding: '16px 0' }}>Keine offenen Aufgaben</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {meineAufgaben.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--gray-100)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-700)' }}>{a.titel}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                      {a.faellig_am ? `Fällig: ${format(new Date(a.faellig_am), 'd. MMM', { locale: de })}` : 'Kein Fälligkeitsdatum'}
                    </div>
                  </div>
                  <span className={`badge badge-${prioritaetColor(a.prioritaet)}`}>{a.prioritaet}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin: ausstehende Kameraden */}
        {isAdmin ? (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3>Ausstehende Zugänge</h3>
              {ausstehend.length > 0 && <span className="badge badge-red">{ausstehend.length}</span>}
            </div>
            {ausstehend.length === 0 ? (
              <p style={{ color: 'var(--gray-400)', fontSize: 14, padding: '16px 0' }}>Keine ausstehenden Zugänge</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ausstehend.map(k => (
                  <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--gray-100)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--gray-500)', flexShrink: 0 }}>
                      {(k.vorname?.[0] ?? '') + (k.nachname?.[0] ?? '')}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-700)' }}>{k.vorname} {k.nachname}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{k.email}</div>
                    </div>
                    <button className="btn btn-sm" style={{ background: '#D5F5E3', color: '#1E8449', border: 'none' }} onClick={() => aktivieren(k.id)}>
                      Freischalten
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Schnellzugriff</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { to: '/dokumente', label: 'Dokumente & Vorlagen', desc: 'Dienstanweisungen, Ausbildungsunterlagen' },
                { to: '/pruefungen', label: 'Prüfungen ablegen', desc: 'Wissensstand testen' },
                { to: '/aufgaben', label: 'Meine Aufgaben', desc: 'Zugewiesene Aufgaben' },
              ].map(item => (
                <Link key={item.to} to={item.to} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px', borderRadius: 6, border: '1px solid var(--gray-100)',
                  textDecoration: 'none', transition: 'all 150ms',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--red)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--gray-100)'}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-700)' }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{item.desc}</div>
                  </div>
                  <span style={{ color: 'var(--gray-300)', fontSize: 16 }}>→</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function rolleLabel(rolle) {
  const map = { gemeindebrandmeister: 'Gemeindebrandmeister', wehrleiter: 'Wehrleiter', gruppenfuehrer: 'Gruppenführer', ausbilder: 'Ausbilder', kamerad: 'Kamerad' }
  return map[rolle] ?? rolle
}

function prioritaetColor(p) {
  return p === 'hoch' ? 'red' : p === 'mittel' ? 'amber' : 'gray'
}
