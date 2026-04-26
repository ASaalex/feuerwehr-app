import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

export default function DashboardPage() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ kameraden: 0, dokumente: 0, pruefungen: 0, aufgaben: 0 })
  const [wehrName, setWehrName] = useState('')
  const [meineAufgaben, setMeineAufgaben] = useState([])
  const [ausstehend, setAusstehend] = useState([])
  const [kameradenListe, setKameradenListe] = useState([])
  const [kameradenModal, setKameradenModal] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    const [
      { count: kameraden },
      { count: dokumente },
      { count: pruefungen },
      { count: aufgaben },
      { data: aufgabenData },
      { data: wehr },
      { data: kList },
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
      profile?.wehr_id
        ? supabase.from('wehren').select('name').eq('id', profile.wehr_id).single()
        : Promise.resolve({ data: null }),
      supabase.from('profiles')
        .select('id,vorname,nachname,geburtsdatum,wehr:wehren(name),kamerad_lehrgaenge(lehrgang:lehrgaenge(name,kuerzel))')
        .eq('status', 'aktiv')
        .order('nachname'),
    ])

    setStats({ kameraden: kameraden ?? 0, dokumente: dokumente ?? 0, pruefungen: pruefungen ?? 0, aufgaben: aufgaben ?? 0 })
    setWehrName(wehr?.name ?? '')
    setMeineAufgaben(aufgabenData ?? [])
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
      {/* Begruessung */}
      <div style={{ marginBottom: 24 }}>
        <h1>{gruss}, {profile?.vorname}!</h1>
        <p style={{ marginTop: 4, color: 'var(--gray-400)', fontSize: 13 }}>
          {format(new Date(), "EEEE, d. MMMM yyyy", { locale: de })}
          {wehrName ? ` · ${wehrName}` : ''}
          {` · ${rolleLabel(profile?.rolle)}`}
        </p>
      </div>

      {/* Ausstehende Freischaltungen */}
      {isAdmin && ausstehend.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--red)', padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14 }}>Ausstehende Zugaenge</h3>
            <span className="badge badge-red">{ausstehend.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ausstehend.map(k => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', flexShrink: 0 }}>
                  {(k.vorname?.[0] ?? '') + (k.nachname?.[0] ?? '')}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.vorname} {k.nachname}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.email}</div>
                </div>
                <button className="btn btn-sm" style={{ background: '#D5F5E3', color: '#1E8449', border: 'none', flexShrink: 0 }} onClick={() => aktivieren(k.id)}>
                  Freischalten
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat-Kacheln */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>

        {/* Kameraden */}
        <div onClick={() => setKameradenModal(true)} style={{
          background: 'var(--red)', borderRadius: 12, padding: '16px 18px',
          cursor: 'pointer', gridColumn: '1 / -1',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'opacity 150ms',
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.92'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>
              Aktive Kameraden {wehrName ? `· ${wehrName}` : ''}
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: 'white', lineHeight: 1 }}>{stats.kameraden}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>Tippen fuer Detailansicht</div>
          </div>
          <div style={{ opacity: 0.4 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
        </div>

        {/* Dokumente */}
        <StatKachel
          label="Dokumente"
          wert={stats.dokumente}
          farbe="#E1F5EE"
          textfarbe="#085041"
          icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#085041" strokeWidth="1.5" opacity="0.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>}
          aktion={{ label: 'Dokumente anzeigen', to: '/dokumente' }}
          navigate={navigate}
        />

        {/* Pruefungen */}
        <StatKachel
          label="Aktive Pruefungen"
          wert={stats.pruefungen}
          farbe="#EEEDFE"
          textfarbe="#3C3489"
          icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3C3489" strokeWidth="1.5" opacity="0.5"><polyline points="9,11 12,14 22,4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
          aktion={{ label: 'Pruefung ablegen', to: '/pruefungen' }}
          navigate={navigate}
        />

        {/* Aufgaben */}
        <StatKachel
          label="Offene Aufgaben"
          wert={stats.aufgaben}
          farbe="#FAEEDA"
          textfarbe="#633806"
          icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#633806" strokeWidth="1.5" opacity="0.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
          aktion={{ label: 'Aufgaben anzeigen', to: '/aufgaben' }}
          navigate={navigate}
          highlight={stats.aufgaben > 0}
        />

        {/* Profil */}
        <StatKachel
          label="Mein Profil"
          wert={null}
          farbe="#E6F1FB"
          textfarbe="#0C447C"
          icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0C447C" strokeWidth="1.5" opacity="0.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
          aktion={{ label: 'Profil bearbeiten', to: '/profil' }}
          navigate={navigate}
          untertitel={profile?.nutzername ?? ''}
        />
      </div>

      {/* Meine offenen Aufgaben */}
      {meineAufgaben.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14 }}>Meine Aufgaben</h3>
            <Link to="/aufgaben" className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>Alle anzeigen</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {meineAufgaben.map((a, i) => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 0',
                borderBottom: i < meineAufgaben.length - 1 ? '1px solid var(--gray-100)' : 'none'
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: a.prioritaet === 'hoch' ? 'var(--red)' : a.prioritaet === 'mittel' ? '#E67E22' : 'var(--gray-300)'
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-700)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titel}</div>
                  {a.faellig_am && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>Faellig: {format(new Date(a.faellig_am), 'd. MMM', { locale: de })}</div>}
                </div>
                <span style={{ fontSize: 11, color: 'var(--gray-300)' }}>→</span>
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
              <h3>Aktive Kameraden ({kameradenListe.length}){wehrName ? ` · ${wehrName}` : ''}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setKameradenModal(false)}>x</button>
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '60vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', position: 'sticky', top: 0 }}>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--gray-100)' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--gray-100)' }}>Wache</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--gray-100)' }}>Geburtsdatum</th>
                    <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 500, color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid var(--gray-100)' }}>Lehrgaenge</th>
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
                      <td style={{ padding: '9px 12px', borderBottom: '1px solid var(--gray-100)' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {(k.kamerad_lehrgaenge ?? []).map((kl, i) => (
                            <span key={i} style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 10,
                              background: '#EEEDFE', color: '#3C3489', fontWeight: 500,
                              whiteSpace: 'nowrap',
                            }}>
                              {kl.lehrgang?.kuerzel || kl.lehrgang?.name}
                            </span>
                          ))}
                          {(k.kamerad_lehrgaenge ?? []).length === 0 && <span style={{ color: 'var(--gray-300)', fontSize: 11 }}>—</span>}
                        </div>
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

function StatKachel({ label, wert, farbe, textfarbe, icon, aktion, navigate, highlight, untertitel }) {
  return (
    <div style={{
      background: farbe, borderRadius: 12, padding: '16px 16px 14px',
      display: 'flex', flexDirection: 'column', gap: 0,
      border: highlight ? `1.5px solid ${textfarbe}40` : '1.5px solid transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 500, color: textfarbe, opacity: 0.7, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
          {wert !== null
            ? <div style={{ fontSize: 32, fontWeight: 700, color: textfarbe, lineHeight: 1 }}>{wert}</div>
            : <div style={{ fontSize: 13, fontWeight: 500, color: textfarbe, marginTop: 4 }}>{untertitel}</div>
          }
        </div>
        {icon}
      </div>
      <button
        onClick={() => navigate(aktion.to)}
        style={{
          marginTop: 14, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
          background: textfarbe + '15', color: textfarbe,
          fontSize: 13, fontWeight: 500, width: '100%',
          transition: 'background 150ms',
        }}
        onMouseEnter={e => e.currentTarget.style.background = textfarbe + '25'}
        onMouseLeave={e => e.currentTarget.style.background = textfarbe + '15'}
      >
        {aktion.label} →
      </button>
    </div>
  )
}

function rolleLabel(rolle) {
  const map = { gemeindebrandmeister: 'Gemeindebrandmeister', wehrleiter: 'Wehrleiter', gruppenfuehrer: 'Gruppenfuehrer', ausbilder: 'Ausbilder', kamerad: 'Kamerad' }
  return map[rolle] ?? rolle
}
