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
  const [kameradenModal, setKameradenModal] = useState(false)
  const [kameradenListe, setKameradenListe] = useState([])

  useEffect(() => { fetchData() }, [])

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
      supabase.from('aufgaben')
        .select('*, erstellt_von:profiles!aufgaben_erstellt_von_fkey(vorname,nachname)')
        .eq('zugewiesen_an', profile?.id)
        .neq('status', 'erledigt')
        .order('erstellt_am', { ascending: false })
        .limit(5),
    ])

    setStats({ kameraden: kameraden ?? 0, dokumente: dokumente ?? 0, pruefungen: pruefungen ?? 0, aufgaben: aufgaben ?? 0 })
    setMeineAufgaben(aufgabenData ?? [])

    // Kameraden Liste fuer Modal
    const { data: kList } = await supabase
      .from('profiles')
      .select('id,vorname,nachname,geburtsdatum,wehr:wehren(name)')
      .eq('status', 'aktiv')
      .order('nachname')
    setKameradenListe(kList ?? [])

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
      <div style={{ marginBottom: 20 }}>
        <h1>{gruss}, {profile?.vorname}!</h1>
        <p style={{ marginTop: 4, color: 'var(--gray-400)', fontSize: 13 }}>
          {format(new Date(), "EEEE, d. MMMM yyyy", { locale: de })} · {rolleLabel(profile?.rolle)}
        </p>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card accent" style={{ cursor: 'pointer' }} onClick={() => setKameradenModal(true)}>
          <div className="stat-label">Aktive Kameraden</div>
          <div className="stat-value">{stats.kameraden}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Tippen fuer Details</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Dokumente</div>
          <div className="stat-value">{stats.dokumente}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pruefungen</div>
          <div className="stat-value">{stats.pruefungen}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Offene Aufgaben</div>
          <div className="stat-value">{stats.aufgaben}</div>
        </div>
      </div>

      {/* Ausstehende Kameraden (Admin) */}
      {isAdmin && ausstehend.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--red)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3>Ausstehende Zugaenge</h3>
            <span className="badge badge-red">{ausstehend.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ausstehend.map(k => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', flexShrink: 0 }}>
                  {(k.vorname?.[0] ?? '') + (k.nachname?.[0] ?? '')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.vorname} {k.nachname}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.email}</div>
                </div>
                <button className="btn btn-sm" style={{ background: '#D5F5E3', color: '#1E8449', border: 'none', flexShrink: 0 }} onClick={() => aktivieren(k.id)}>
                  Freischalten
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schnellzugriff Kacheln */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { to: '/pruefungen', label: 'Pruefungen', desc: 'Wissen testen', icon: '📋', color: '#EEEDFE' },
          { to: '/aufgaben', label: 'Aufgaben', desc: 'Meine Aufgaben', icon: '✓', color: '#FAEEDA' },
          { to: '/dokumente', label: 'Dokumente', desc: 'Unterlagen', icon: '📄', color: '#E1F5EE' },
          { to: '/profil', label: 'Profil', desc: 'Meine Daten', icon: '👤', color: '#E6F1FB' },
        ].map(item => (
          <Link key={item.to} to={item.to} style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: '14px 14px', borderRadius: 10,
            background: item.color, textDecoration: 'none',
            border: '1px solid transparent',
            transition: 'all 150ms',
          }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)' }}>{item.label}</span>
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{item.desc}</span>
          </Link>
        ))}
      </div>

      {/* Meine offenen Aufgaben */}
      {meineAufgaben.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3>Meine Aufgaben</h3>
            <Link to="/aufgaben" className="btn btn-ghost btn-sm">Alle →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {meineAufgaben.map((a, i) => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 0',
                borderBottom: i < meineAufgaben.length - 1 ? '1px solid var(--gray-100)' : 'none'
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.prioritaet === 'hoch' ? 'var(--red)' : a.prioritaet === 'mittel' ? '#E67E22' : 'var(--gray-300)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-700)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.titel}</div>
                  {a.faellig_am && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>Faellig: {format(new Date(a.faellig_am), 'd. MMM', { locale: de })}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Kameraden Modal */}
      {kameradenModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setKameradenModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>Aktive Kameraden ({kameradenListe.length})</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setKameradenModal(false)}>x</button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '60vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--gray-100)' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--gray-100)' }}>Wache</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--gray-100)' }}>Geburtsdatum</th>
                  </tr>
                </thead>
                <tbody>
                  {kameradenListe.map((k, i) => (
                    <tr key={k.id} style={{ background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--gray-100)', fontWeight: 500, color: 'var(--gray-700)' }}>
                        {k.nachname}, {k.vorname}
                      </td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--gray-100)', color: 'var(--gray-500)', fontSize: 12 }}>
                        {k.wehr?.name ?? '—'}
                      </td>
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--gray-100)', color: 'var(--gray-500)', fontSize: 12 }}>
                        {k.geburtsdatum ? format(new Date(k.geburtsdatum), 'dd.MM.yyyy', { locale: de }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function rolleLabel(rolle) {
  const map = { gemeindebrandmeister: 'Gemeindebrandmeister', wehrleiter: 'Wehrleiter', gruppenfuehrer: 'Gruppenfuehrer', ausbilder: 'Ausbilder', kamerad: 'Kamerad' }
  return map[rolle] ?? rolle
}
