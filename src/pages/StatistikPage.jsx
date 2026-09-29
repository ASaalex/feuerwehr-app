import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, BarElement, ArcElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  ladeEinsaetzeJahr, ladeJahresAggregat, ladeVerfuegbareJahre, ladeWachen, ladeKameradenFuerWache,
  ladeAlleFahrzeuge, ladeAlleKameraden, ladeVorhandeneEinsatznummern,
  findeFahrzeugInZeile, findeProfilFuerName, minutenZuStunden,
} from '../lib/statistik'
import { extrahierePdfZeilen, hatVermutlichPersonal, parseEinsatzliste } from '../lib/statistikPdfParser'

ChartJS.register(BarElement, ArcElement, CategoryScale, LinearScale, Tooltip, Legend)

const ROT = '#C0392B'
const AMBER = '#D68910'
const HAIRLINE = '#DEDEDB'
const INK_DIM = '#6E6E68'
const INK = '#1A1A17'

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

const TABS = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'kameraden', label: 'Kameraden' },
  { id: 'jahresvergleich', label: 'Jahresvergleich' },
  { id: 'import', label: 'Import', gbmOnly: true },
]

export default function StatistikPage() {
  const { profile } = useAuth()
  const istGbm = profile?.rolle === 'gemeindebrandmeister'
  const eigeneWehrId = profile?.wehr_id ?? null

  const [activeTab, setActiveTab] = useState('uebersicht')
  const [jahr, setJahr] = useState(new Date().getFullYear())
  const [verfuegbareJahre, setVerfuegbareJahre] = useState([])
  const [wachen, setWachen] = useState([])
  const [wacheId, setWacheId] = useState(eigeneWehrId)
  const [einsaetze, setEinsaetze] = useState([])
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState('')

  useEffect(() => { ladeGrunddaten() }, [])
  useEffect(() => { ladeJahresdaten() }, [jahr])

  async function ladeGrunddaten() {
    try {
      const [jahre, wachenListe] = await Promise.all([
        ladeVerfuegbareJahre(),
        istGbm ? ladeWachen() : Promise.resolve([]),
      ])
      setVerfuegbareJahre(jahre)
      setWachen(wachenListe)
      if (jahre.length && !jahre.includes(jahr)) setJahr(jahre[0])
      if (istGbm && !wacheId && wachenListe.length) setWacheId(eigeneWehrId ?? wachenListe[0].id)
    } catch (err) {
      setFehler(err.message)
    }
  }

  async function ladeJahresdaten() {
    setLoading(true)
    setFehler('')
    try {
      setEinsaetze(await ladeEinsaetzeJahr(jahr))
    } catch (err) {
      setFehler(err.message)
    }
    setLoading(false)
  }

  // "Wache beteiligt" bezieht sich bewusst nur auf Fahrzeuge (so wie in der
  // urspruenglichen Auswertung besprochen), nicht auf blosse Personen-Praesenz.
  // Ein Kamerad kann als Zweitwache-Mitglied ohne eigenes Fahrzeug an einem
  // Einsatz beteiligt gewesen sein (zaehlt fuer den Kameraden-Tab, siehe RLS
  // in 31_statistik_zweitwache.sql), das macht den Einsatz aber nicht zu
  // einem Fahrzeug-Einsatz der Wache in der Uebersicht.
  // Fuer Wehrleiter/Gruppenfuehrer liefert das Backend in einsatz.fahrzeuge
  // ohnehin nur Zeilen der eigenen Wache (RLS), daher funktioniert dieselbe
  // Pruefung fuer beide Rollen.
  function wacheBeteiligt(einsatz) {
    return (einsatz.fahrzeuge ?? []).some(f => f.wehr_id === wacheId)
  }

  function wacheFahrzeugMinuten(einsatz) {
    return (einsatz.fahrzeuge ?? [])
      .filter(f => f.wehr_id === wacheId)
      .reduce((sum, f) => sum + (f.minuten ?? 0), 0)
  }

  const monatsDaten = useMemo(() => {
    const buckets = Array.from({ length: 12 }, () => ({ gemeinde: 0, wache: 0, wacheMinuten: 0 }))
    for (const e of einsaetze) {
      const idx = Number(e.datum.slice(5, 7)) - 1
      if (idx < 0 || idx > 11) continue
      buckets[idx].gemeinde += 1
      if (wacheBeteiligt(e)) {
        buckets[idx].wache += 1
        buckets[idx].wacheMinuten += wacheFahrzeugMinuten(e)
      }
    }
    return buckets
  }, [einsaetze, wacheId, istGbm])

  const gesamt = useMemo(() => {
    const gemeinde = monatsDaten.reduce((s, m) => s + m.gemeinde, 0)
    const wache = monatsDaten.reduce((s, m) => s + m.wache, 0)
    const wacheMinuten = monatsDaten.reduce((s, m) => s + m.wacheMinuten, 0)
    return { gemeinde, wache, wacheMinuten }
  }, [monatsDaten])

  const stichwortTabelle = useMemo(() => {
    const map = new Map()
    for (const e of einsaetze) {
      const key = e.stichwort?.trim() || 'Unbekannt'
      if (!map.has(key)) map.set(key, { stichwort: key, gemeinde: 0, wache: 0 })
      const row = map.get(key)
      row.gemeinde += 1
      if (wacheBeteiligt(e)) row.wache += 1
    }
    return [...map.values()].filter(r => r.wache > 0).sort((a, b) => b.wache - a.wache).slice(0, 10)
  }, [einsaetze, wacheId, istGbm])

  const [offenerMonat, setOffenerMonat] = useState(null)
  const einsaetzeOffenerMonat = useMemo(() => {
    if (offenerMonat == null) return []
    return einsaetze
      .filter(e => Number(e.datum.slice(5, 7)) - 1 === offenerMonat && wacheBeteiligt(e))
      .sort((a, b) => a.datum.localeCompare(b.datum))
  }, [einsaetze, offenerMonat, wacheId, istGbm])

  const wacheName = wachen.find(w => w.id === wacheId)?.name

  if (loading && einsaetze.length === 0) return <div className="loading-page"><div className="spinner"></div></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Statistik</h1>
          <p style={{ marginTop: 4 }}>Einsatzauswertung {istGbm ? '· Gemeinde' : wacheName ? `· ${wacheName}` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {istGbm && wachen.length > 0 && (
            <select value={wacheId ?? ''} onChange={e => setWacheId(e.target.value)} style={{ width: 'auto' }}>
              {wachen.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
          <select value={jahr} onChange={e => { setJahr(Number(e.target.value)); setOffenerMonat(null) }} style={{ width: 'auto' }}>
            {(verfuegbareJahre.includes(jahr) ? verfuegbareJahre : [jahr, ...verfuegbareJahre]).map(j => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, padding: 3, background: 'var(--gray-100)', borderRadius: 8, overflowX: 'auto' }}>
        {TABS.filter(t => !t.gbmOnly || istGbm).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : 'btn-ghost'}`}
            style={{ flexShrink: 0 }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {fehler && <div className="alert alert-error" style={{ marginBottom: 16 }}>{fehler}</div>}

      {activeTab === 'import' && istGbm ? (
        <ImportTab jahr={jahr} onImportiert={ladeGrunddaten} onEinsaetzeGeaendert={ladeJahresdaten} einsaetze={einsaetze} />
      ) : activeTab === 'jahresvergleich' ? (
        <JahresvergleichTab wacheId={wacheId} istGbm={istGbm} verfuegbareJahre={verfuegbareJahre} />
      ) : einsaetze.length === 0 && !loading ? (
        <div className="empty-state card">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>
          <p>Für {jahr} sind noch keine Einsätze importiert.</p>
          {istGbm && <p style={{ fontSize: 13 }}>Wechsle zum Tab "Import", um eine Einsatzliste hochzuladen.</p>}
        </div>
      ) : (
        <>
          {activeTab === 'uebersicht' && (
            <UebersichtTab
              istGbm={istGbm}
              gesamt={gesamt}
              monatsDaten={monatsDaten}
              stichwortTabelle={stichwortTabelle}
              offenerMonat={offenerMonat}
              setOffenerMonat={setOffenerMonat}
              einsaetzeOffenerMonat={einsaetzeOffenerMonat}
            />
          )}
          {activeTab === 'kameraden' && (
            <KameradenTab wacheId={wacheId} istGbm={istGbm} einsaetze={einsaetze} />
          )}
        </>
      )}
    </div>
  )
}

function UebersichtTab({ istGbm, gesamt, monatsDaten, stichwortTabelle, offenerMonat, setOffenerMonat, einsaetzeOffenerMonat }) {
  const pct = gesamt.gemeinde > 0 ? Math.round((gesamt.wache / gesamt.gemeinde) * 1000) / 10 : 0

  const monatlichData = {
    labels: MONATE,
    datasets: istGbm
      ? [
        { label: 'Gemeinde gesamt', data: monatsDaten.map(m => m.gemeinde), backgroundColor: HAIRLINE, borderRadius: 2, maxBarThickness: 28 },
        { label: 'Unsere Wache beteiligt', data: monatsDaten.map(m => m.wache), backgroundColor: ROT, borderRadius: 2, maxBarThickness: 28 },
      ]
      : [
        { label: 'Einsätze', data: monatsDaten.map(m => m.wache), backgroundColor: ROT, borderRadius: 2, maxBarThickness: 28 },
      ],
  }

  const stundenData = {
    labels: MONATE,
    datasets: [{ label: 'Einsatzstunden', data: monatsDaten.map(m => minutenZuStunden(m.wacheMinuten)), backgroundColor: AMBER, borderRadius: 2, maxBarThickness: 26 }],
  }

  const donutData = {
    labels: ['Mit unserer Wache', 'Ohne unsere Wache'],
    datasets: [{ data: [gesamt.wache, gesamt.gemeinde - gesamt.wache], backgroundColor: [ROT, HAIRLINE], borderWidth: 0 }],
  }

  const barOptions = (einheit) => ({
    responsive: true, maintainAspectRatio: false,
    onClick: (_evt, elems) => { if (elems.length) setOffenerMonat(elems[0].index) },
    plugins: {
      legend: istGbm ? { position: 'top', align: 'end', labels: { color: INK, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' } } : { display: false },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y} ${einheit}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: INK_DIM } },
      y: { beginAtZero: true, ticks: { color: INK_DIM, precision: 0 }, grid: { color: HAIRLINE } },
    },
  })

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: istGbm ? '1.3fr 1fr 1fr' : '1fr 1fr', gap: 1, background: HAIRLINE, border: `1px solid ${HAIRLINE}`, marginBottom: 32 }}>
        {istGbm && (
          <div style={{ background: ROT, color: 'white', padding: '22px 22px' }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', marginBottom: 8 }}>Beteiligung unserer Wache</div>
            <div style={{ fontSize: 42, fontWeight: 700 }}>{pct.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<span style={{ fontSize: 18, marginLeft: 4 }}>%</span></div>
            <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.85)', marginTop: 8 }}>{gesamt.wache} von {gesamt.gemeinde} Einsätzen</div>
          </div>
        )}
        <div className="card" style={{ borderRadius: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 8 }}>{istGbm ? 'Einsätze Gemeinde gesamt' : 'Einsätze unserer Wache'}</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{istGbm ? gesamt.gemeinde : gesamt.wache}</div>
        </div>
        <div className="card" style={{ borderRadius: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 8 }}>Einsatzstunden unserer Fahrzeuge</div>
          <div style={{ fontSize: 32, fontWeight: 700 }}>{minutenZuStunden(gesamt.wacheMinuten).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<span style={{ fontSize: 15, color: 'var(--gray-400)', marginLeft: 4 }}>Std.</span></div>
        </div>
      </div>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ borderLeft: `3px solid ${ROT}`, paddingLeft: 10, fontSize: 15 }}>Einsätze pro Monat</h2>
        <p style={{ margin: '4px 0 12px 13px', fontSize: 13, color: 'var(--gray-400)' }}>Klick auf einen Monat zeigt die einzelnen Einsätze.</p>
        <div className="card">
          <div style={{ position: 'relative', height: 300 }}><Bar data={monatlichData} options={barOptions('Einsätze')} /></div>
        </div>
      </section>

      {offenerMonat != null && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ borderLeft: `3px solid ${ROT}`, paddingLeft: 10, fontSize: 15 }}>Einsätze im {MONATE[offenerMonat]}</h2>
          <div className="card">
            {einsaetzeOffenerMonat.length === 0 ? (
              <p style={{ fontSize: 13 }}>Keine Einsätze in diesem Monat.</p>
            ) : (
              <table style={{ width: '100%', fontSize: 13.5, borderCollapse: 'collapse' }}>
                <thead><tr><th style={{ textAlign: 'left', paddingBottom: 8 }}>Datum</th><th style={{ textAlign: 'left' }}>Stichwort</th><th style={{ textAlign: 'left' }}>Ort</th><th style={{ textAlign: 'left' }}>Fahrzeuge</th><th style={{ textAlign: 'right' }}>Std.</th></tr></thead>
                <tbody>
                  {einsaetzeOffenerMonat.map(e => (
                    <tr key={e.id} style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                      <td style={{ padding: '8px 0' }}>{format(parseISO(e.datum), 'dd.MM.yyyy', { locale: de })}</td>
                      <td>{e.stichwort || '–'}</td>
                      <td>{e.einsatzort || '–'}</td>
                      <td>{(e.fahrzeuge ?? []).map(f => f.fahrzeug_name_pdf).join(', ') || '–'}</td>
                      <td style={{ textAlign: 'right' }}>{minutenZuStunden((e.fahrzeuge ?? []).reduce((s, f) => s + (f.minuten ?? 0), 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: istGbm ? '1fr 1fr' : '1fr', gap: 22, marginBottom: 32 }}>
        <section style={{ marginBottom: 0 }}>
          <h2 style={{ borderLeft: `3px solid ${ROT}`, paddingLeft: 10, fontSize: 15 }}>Einsatzstunden unserer Wache</h2>
          <p style={{ margin: '4px 0 12px 13px', fontSize: 13, color: 'var(--gray-400)' }}>Summierte Einsatzzeit unserer Fahrzeuge pro Monat</p>
          <div className="card">
            <div style={{ position: 'relative', height: 240 }}><Bar data={stundenData} options={{ ...barOptions('Std.'), onClick: undefined }} /></div>
          </div>
        </section>

        {istGbm && (
          <section style={{ marginBottom: 0 }}>
            <h2 style={{ borderLeft: `3px solid ${ROT}`, paddingLeft: 10, fontSize: 15 }}>Anteil an der Gesamteinsatzzahl</h2>
            <p style={{ margin: '4px 0 12px 13px', fontSize: 13, color: 'var(--gray-400)' }}>Einsätze mit vs. ohne Beteiligung unserer Fahrzeuge</p>
            <div className="card">
              <div style={{ position: 'relative', height: 240 }}><Doughnut data={donutData} options={{ responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } }} /></div>
              <div style={{ display: 'flex', gap: 22, marginTop: 14, fontSize: 13, color: 'var(--gray-500)' }}>
                <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: ROT, marginRight: 6 }} />Mit unserer Wache ({gesamt.wache})</span>
                <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: HAIRLINE, marginRight: 6 }} />Ohne unsere Wache ({gesamt.gemeinde - gesamt.wache})</span>
              </div>
            </div>
          </section>
        )}
      </div>

      <section>
        <h2 style={{ borderLeft: `3px solid ${ROT}`, paddingLeft: 10, fontSize: 15 }}>Einsatzarten {istGbm ? 'unserer Wache' : ''}</h2>
        <p style={{ margin: '4px 0 12px 13px', fontSize: 13, color: 'var(--gray-400)' }}>
          {istGbm ? 'Häufigste Einsatzstichworte, im Verhältnis zur Gemeinde-Gesamtzahl je Stichwort' : 'Häufigste Einsatzstichworte unserer Wache'}
        </p>
        <div className="card">
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingBottom: 10 }}>Einsatzstichwort</th>
                <th style={{ textAlign: 'right' }}>{istGbm ? 'Wache / Gemeinde' : 'Anzahl'}</th>
              </tr>
            </thead>
            <tbody>
              {stichwortTabelle.map(r => (
                <tr key={r.stichwort} style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                  <td style={{ padding: '9px 0' }}>{r.stichwort}</td>
                  <td style={{ textAlign: 'right' }}>
                    {istGbm ? <>{r.wache} / {r.gemeinde} ({Math.round((r.wache / r.gemeinde) * 100)}%)</> : r.wache}
                  </td>
                </tr>
              ))}
              {stichwortTabelle.length === 0 && <tr><td colSpan={2} style={{ padding: '12px 0', color: 'var(--gray-400)' }}>Keine Daten.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function KameradenTab({ wacheId, istGbm, einsaetze }) {
  const [kameraden, setKameraden] = useState([])
  const [sortBy, setSortBy] = useState('minuten')
  const [offenerKamerad, setOffenerKamerad] = useState(null)

  useEffect(() => {
    if (!wacheId) { setKameraden([]); return }
    ladeKameradenFuerWache(wacheId).then(setKameraden).catch(() => setKameraden([]))
  }, [wacheId])

  const ranking = useMemo(() => {
    const map = new Map()
    for (const k of kameraden) map.set(k.id, { profile_id: k.id, name: `${k.nachname}, ${k.vorname}`, einsatzIds: new Set(), minuten: 0 })
    for (const e of einsaetze) {
      for (const p of (e.personal ?? [])) {
        if (!p.profile_id || !map.has(p.profile_id)) continue
        const row = map.get(p.profile_id)
        row.einsatzIds.add(e.id)
        row.minuten += p.minuten ?? 0
      }
    }
    const rows = [...map.values()].map(r => ({ ...r, anzahl: r.einsatzIds.size }))
    return rows.sort((a, b) => sortBy === 'minuten' ? b.minuten - a.minuten : b.anzahl - a.anzahl)
  }, [kameraden, einsaetze, sortBy])

  const einsaetzeKamerad = useMemo(() => {
    if (!offenerKamerad) return []
    return einsaetze
      .filter(e => (e.personal ?? []).some(p => p.profile_id === offenerKamerad))
      .map(e => ({ ...e, minuten: (e.personal ?? []).find(p => p.profile_id === offenerKamerad)?.minuten ?? 0 }))
      .sort((a, b) => b.datum.localeCompare(a.datum))
  }, [einsaetze, offenerKamerad])

  return (
    <div>
      <section>
        <h2 style={{ borderLeft: `3px solid ${ROT}`, paddingLeft: 10, fontSize: 15 }}>Einsatzstunden je Kamerad</h2>
        <p style={{ margin: '4px 0 12px 13px', fontSize: 13, color: 'var(--gray-400)' }}>
          Nur Kameraden, deren Name in der importierten Einsatzliste eindeutig einem Profil zugeordnet werden konnte.
        </p>
        <div className="card">
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingBottom: 10 }}>Kamerad</th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => setSortBy('anzahl')}>Einsätze {sortBy === 'anzahl' && '▾'}</th>
                <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => setSortBy('minuten')}>Stunden {sortBy === 'minuten' && '▾'}</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map(r => (
                <tr key={r.profile_id} style={{ borderTop: `1px solid ${HAIRLINE}`, cursor: 'pointer' }} onClick={() => setOffenerKamerad(r.profile_id === offenerKamerad ? null : r.profile_id)}>
                  <td style={{ padding: '9px 0', fontWeight: r.profile_id === offenerKamerad ? 600 : 400 }}>{r.name}</td>
                  <td style={{ textAlign: 'right' }}>{r.anzahl}</td>
                  <td style={{ textAlign: 'right' }}>{minutenZuStunden(r.minuten)}</td>
                </tr>
              ))}
              {ranking.length === 0 && <tr><td colSpan={3} style={{ padding: '12px 0', color: 'var(--gray-400)' }}>Keine Daten für diese Wache/dieses Jahr.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {offenerKamerad && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ borderLeft: `3px solid ${ROT}`, paddingLeft: 10, fontSize: 15 }}>
            Einsätze von {ranking.find(r => r.profile_id === offenerKamerad)?.name}
          </h2>
          <div className="card">
            <table style={{ width: '100%', fontSize: 13.5, borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ textAlign: 'left', paddingBottom: 8 }}>Datum</th><th style={{ textAlign: 'left' }}>Stichwort</th><th style={{ textAlign: 'left' }}>Fahrzeug</th><th style={{ textAlign: 'right' }}>Std.</th></tr></thead>
              <tbody>
                {einsaetzeKamerad.map(e => (
                  <tr key={e.id} style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                    <td style={{ padding: '8px 0' }}>{format(parseISO(e.datum), 'dd.MM.yyyy', { locale: de })}</td>
                    <td>{e.stichwort || '–'}</td>
                    <td>{(e.personal ?? []).find(p => p.profile_id === offenerKamerad)?.fahrzeug_name_pdf || '–'}</td>
                    <td style={{ textAlign: 'right' }}>{minutenZuStunden(e.minuten)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function JahresvergleichTab({ wacheId, istGbm, verfuegbareJahre }) {
  const [daten, setDaten] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fehler, setFehler] = useState('')
  const jahreSchluessel = verfuegbareJahre.join(',')

  useEffect(() => {
    let abgebrochen = false
    async function laden() {
      if (!verfuegbareJahre.length) { setDaten([]); setLoading(false); return }
      setLoading(true)
      setFehler('')
      try {
        const proJahr = await Promise.all(verfuegbareJahre.map(async jahr => {
          const einsaetzeJahr = await ladeJahresAggregat(jahr)
          let wache = 0, wacheMinuten = 0
          for (const e of einsaetzeJahr) {
            const eigene = (e.fahrzeuge ?? []).filter(f => f.wehr_id === wacheId)
            if (eigene.length) {
              wache++
              wacheMinuten += eigene.reduce((s, f) => s + (f.minuten ?? 0), 0)
            }
          }
          return { jahr, gemeinde: einsaetzeJahr.length, wache, wacheMinuten }
        }))
        if (!abgebrochen) setDaten(proJahr.sort((a, b) => a.jahr - b.jahr))
      } catch (err) {
        if (!abgebrochen) setFehler(err.message)
      }
      if (!abgebrochen) setLoading(false)
    }
    laden()
    return () => { abgebrochen = true }
  }, [wacheId, jahreSchluessel])

  if (loading) return <div className="card"><p style={{ fontSize: 13, color: 'var(--gray-400)' }}>Lade Jahresvergleich…</p></div>
  if (fehler) return <div className="alert alert-error">{fehler}</div>
  if (!daten?.length) {
    return (
      <div className="empty-state card">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>
        <p>Noch keine importierten Einsätze vorhanden.</p>
      </div>
    )
  }

  const labels = daten.map(d => String(d.jahr))
  const einsatzDaten = {
    labels,
    datasets: istGbm
      ? [
        { label: 'Gemeinde gesamt', data: daten.map(d => d.gemeinde), backgroundColor: HAIRLINE, borderRadius: 2, maxBarThickness: 40 },
        { label: 'Unsere Wache beteiligt', data: daten.map(d => d.wache), backgroundColor: ROT, borderRadius: 2, maxBarThickness: 40 },
      ]
      : [
        { label: 'Einsätze', data: daten.map(d => d.wache), backgroundColor: ROT, borderRadius: 2, maxBarThickness: 40 },
      ],
  }
  const stundenDaten = {
    labels,
    datasets: [{ label: 'Einsatzstunden', data: daten.map(d => minutenZuStunden(d.wacheMinuten)), backgroundColor: AMBER, borderRadius: 2, maxBarThickness: 40 }],
  }
  const optionen = (einheit, zeigeLegende) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: zeigeLegende ? { position: 'top', align: 'end', labels: { color: INK, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' } } : { display: false },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y} ${einheit}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: INK_DIM } },
      y: { beginAtZero: true, ticks: { color: INK_DIM, precision: 0 }, grid: { color: HAIRLINE } },
    },
  })

  return (
    <div>
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ borderLeft: `3px solid ${ROT}`, paddingLeft: 10, fontSize: 15 }}>Einsätze pro Jahr</h2>
        <p style={{ margin: '4px 0 12px 13px', fontSize: 13, color: 'var(--gray-400)' }}>
          Fahrzeug-Einsätze unserer Wache je Jahr{istGbm ? ', im Vergleich zur Gemeinde-Gesamtzahl' : ''}.
        </p>
        <div className="card">
          <div style={{ position: 'relative', height: 280 }}><Bar data={einsatzDaten} options={optionen('Einsätze', istGbm)} /></div>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ borderLeft: `3px solid ${ROT}`, paddingLeft: 10, fontSize: 15 }}>Einsatzstunden pro Jahr</h2>
        <p style={{ margin: '4px 0 12px 13px', fontSize: 13, color: 'var(--gray-400)' }}>Summierte Fahrzeug-Einsatzzeit unserer Wache je Jahr.</p>
        <div className="card">
          <div style={{ position: 'relative', height: 280 }}><Bar data={stundenDaten} options={optionen('Std.', false)} /></div>
        </div>
      </section>

      <section>
        <div className="card">
          <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingBottom: 10 }}>Jahr</th>
                {istGbm && <th style={{ textAlign: 'right' }}>Gemeinde gesamt</th>}
                <th style={{ textAlign: 'right' }}>Unsere Wache</th>
                <th style={{ textAlign: 'right' }}>Stunden</th>
              </tr>
            </thead>
            <tbody>
              {[...daten].reverse().map(d => (
                <tr key={d.jahr} style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                  <td style={{ padding: '9px 0' }}>{d.jahr}</td>
                  {istGbm && <td style={{ textAlign: 'right' }}>{d.gemeinde}</td>}
                  <td style={{ textAlign: 'right' }}>{d.wache}</td>
                  <td style={{ textAlign: 'right' }}>{minutenZuStunden(d.wacheMinuten)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function ImportTab({ jahr, onImportiert, onEinsaetzeGeaendert, einsaetze }) {
  const { profile } = useAuth()
  const dateiRef = useRef()
  const [verarbeite, setVerarbeite] = useState(false)
  const [ergebnis, setErgebnis] = useState(null)
  const [vorschau, setVorschau] = useState(null)
  const [importiert, setImportiert] = useState(false)
  const [importiere, setImportiere] = useState(false)
  const [fehler, setFehler] = useState('')
  const [bearbeiten, setBearbeiten] = useState(null)

  async function handleDatei(e) {
    const datei = e.target.files?.[0]
    if (!datei) return
    setErgebnis(null)
    setVorschau(null)
    setImportiert(false)
    setFehler('')
    setVerarbeite(true)
    try {
      const zeilen = await extrahierePdfZeilen(datei)
      const personalHinweis = hatVermutlichPersonal(zeilen)
      const geparst = parseEinsatzliste(zeilen, { dateiname: datei.name })
      setErgebnis({ ...geparst, zeilenLaenge: zeilen.length, personalHinweis })
      if (geparst.unterstuetzt && personalHinweis !== false) {
        setVorschau(await baueVorschau(geparst))
      }
    } catch (err) {
      setFehler('PDF konnte nicht gelesen werden: ' + err.message)
    } finally {
      setVerarbeite(false)
      if (dateiRef.current) dateiRef.current.value = ''
    }
  }

  async function baueVorschau(geparst) {
    const [alleFahrzeuge, alleKameraden, vorhandeneNummern] = await Promise.all([
      ladeAlleFahrzeuge(), ladeAlleKameraden(), ladeVorhandeneEinsatznummern(),
    ])

    const neue = []
    let uebersprungen = 0
    let fahrzeugeUnbekannt = 0
    let fahrzeugeGesamt = 0
    let personalUnbekannt = 0
    let personalGesamt = 0

    for (const e of geparst.einsaetze) {
      if (vorhandeneNummern.has(e.einsatznummer)) { uebersprungen++; continue }

      const fahrzeuge = e.fahrzeuge.map(f => {
        const treffer = findeFahrzeugInZeile(f.zeile_roh, alleFahrzeuge)
        fahrzeugeGesamt++
        if (!treffer) fahrzeugeUnbekannt++
        return {
          // PDF-Tabellenspalten fuer Fahrzeuge sind teils verschachtelt/verschmiert
          // extrahiert (siehe statistikPdfParser.js) — bei Treffer lieber den
          // sauberen Namen aus unserer eigenen Fahrzeuge-Tabelle anzeigen.
          fahrzeug_name_pdf: treffer?.name ?? f.name,
          inventarnummer_pdf: treffer?.inventarnummer ?? null,
          fahrzeug_id: treffer?.id ?? null,
          wehr_id: treffer?.wehr_id ?? null,
          minuten: f.minuten,
        }
      })

      const personal = e.personal.map(p => {
        const treffer = findeProfilFuerName(p.name, alleKameraden)
        personalGesamt++
        if (!treffer) personalUnbekannt++
        return {
          name_pdf: p.name,
          profile_id: treffer?.id ?? null,
          wehr_id: treffer?.wehr_id ?? null,
          zeit_alarmiert: p.zeit_alarmiert,
          zeit_ende: p.zeit_ende,
          minuten: p.minuten,
        }
      })

      neue.push({ ...e, fahrzeuge, personal })
    }

    return { neue, uebersprungen, fahrzeugeUnbekannt, fahrzeugeGesamt, personalUnbekannt, personalGesamt }
  }

  async function handleImportBestaetigen() {
    if (!vorschau?.neue?.length) return
    setImportiere(true)
    setFehler('')
    try {
      const { data: eingefuegteEinsaetze, error: einsatzFehler } = await supabase
        .from('statistik_einsaetze')
        .insert(vorschau.neue.map(e => ({
          einsatznummer: e.einsatznummer,
          datum: e.datum,
          alarmzeit: e.alarmzeit,
          stichwort: e.stichwort,
          importiert_von: profile?.id ?? null,
          quelle_dateiname: ergebnis?.dateiname ?? null,
        })))
        .select('id, einsatznummer')
      if (einsatzFehler) throw einsatzFehler

      const idNachNummer = new Map(eingefuegteEinsaetze.map(r => [r.einsatznummer, r.id]))

      const fahrzeugZeilen = vorschau.neue.flatMap(e =>
        e.fahrzeuge.map(f => ({ ...f, einsatz_id: idNachNummer.get(e.einsatznummer) }))
      )
      const personalZeilen = vorschau.neue.flatMap(e =>
        e.personal.map(p => ({ ...p, einsatz_id: idNachNummer.get(e.einsatznummer) }))
      )

      if (fahrzeugZeilen.length) {
        const { error } = await supabase.from('statistik_einsatz_fahrzeuge').insert(fahrzeugZeilen)
        if (error) throw error
      }
      if (personalZeilen.length) {
        const { error } = await supabase.from('statistik_einsatz_personal').insert(personalZeilen)
        if (error) throw error
      }

      setImportiert(true)
      setVorschau(null)
      onEinsaetzeGeaendert?.()
      onImportiert?.()
    } catch (err) {
      setFehler('Import fehlgeschlagen: ' + err.message)
    } finally {
      setImportiere(false)
    }
  }

  async function handleLoeschen(einsatz) {
    if (!confirm(`Einsatz "${einsatz.einsatznummer}" vom ${format(parseISO(einsatz.datum), 'dd.MM.yyyy', { locale: de })} wirklich löschen?`)) return
    await supabase.from('statistik_einsaetze').delete().eq('id', einsatz.id)
    onEinsaetzeGeaendert?.()
    onImportiert?.()
  }

  async function handleBearbeitenSpeichern(e) {
    e.preventDefault()
    const { id, ...felder } = bearbeiten
    await supabase.from('statistik_einsaetze').update({
      einsatznummer: felder.einsatznummer,
      datum: felder.datum,
      alarmzeit: felder.alarmzeit || null,
      stichwort: felder.stichwort || null,
      einsatzort: felder.einsatzort || null,
    }).eq('id', id)
    setBearbeiten(null)
    onEinsaetzeGeaendert?.()
    onImportiert?.()
  }

  return (
    <div>
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ borderLeft: `3px solid ${ROT}`, paddingLeft: 10, fontSize: 15 }}>Einsatzliste importieren</h2>
        <p style={{ margin: '4px 0 12px 13px', fontSize: 13, color: 'var(--gray-400)' }}>
          PDF-Export der Gemeinde-Einsatzliste (mit Personal, damit Kameraden-Stunden erfasst werden können).
        </p>
        <div className="card">
          <input ref={dateiRef} type="file" accept="application/pdf" onChange={handleDatei} disabled={verarbeite} />
          {verarbeite && <p style={{ fontSize: 13, marginTop: 10 }}>PDF wird gelesen…</p>}

          {fehler && <div className="alert alert-error" style={{ marginTop: 14 }}>{fehler}</div>}

          {importiert && <div className="alert alert-success" style={{ marginTop: 14 }}>Import erfolgreich übernommen.</div>}

          {ergebnis?.nichtErkannt?.length > 0 && (
            <div className="alert" style={{ marginTop: 14, background: '#FDEBD0', color: '#935116', borderRadius: 8, padding: '12px 14px', fontSize: 13.5 }}>
              {ergebnis.nichtErkannt.length} Personal-Zeile(n) in der PDF konnten nicht gelesen werden (z. B. weil Uhrzeit/Dauer am Zeilenende fehlt) und wurden übersprungen — die betroffenen Kameraden fehlen dadurch bei genau diesem Einsatz in der Statistik.
            </div>
          )}

          {ergebnis && (!ergebnis.unterstuetzt || ergebnis.personalHinweis === false) && (
            <div className="alert" style={{ marginTop: 14, background: '#FDEBD0', color: '#935116', borderRadius: 8, padding: '12px 14px', fontSize: 13.5 }}>
              <strong>Import nicht möglich:</strong> {!ergebnis.unterstuetzt ? ergebnis.hinweis : 'Diese PDF scheint keine Personal-Angaben zu enthalten. Bitte den Export "mit Personal" verwenden, damit die Kameraden-Stunden erfasst werden können.'}
              <div style={{ marginTop: 6, color: 'var(--gray-500)' }}>
                {ergebnis.zeilenLaenge.toLocaleString()} Zeilen aus "{ergebnis.dateiname}" gelesen.
              </div>
            </div>
          )}

          {vorschau && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${HAIRLINE}`, paddingTop: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Vorschau: "{ergebnis.dateiname}"</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: 'var(--gray-600)', lineHeight: 1.9 }}>
                <li><strong>{vorschau.neue.length}</strong> neue Einsätze werden importiert</li>
                <li>{vorschau.uebersprungen} bereits vorhandene Einsätze werden übersprungen (Duplikat-Erkennung per Einsatznummer)</li>
                <li>{vorschau.fahrzeugeGesamt - vorschau.fahrzeugeUnbekannt} / {vorschau.fahrzeugeGesamt} Fahrzeug-Einträge einer Wache zugeordnet (Rest: unbekannte Inventarnummer, wird ohne Wachen-Bezug gespeichert)</li>
                <li>{vorschau.personalGesamt - vorschau.personalUnbekannt} / {vorschau.personalGesamt} Personen einem Profil zugeordnet (Rest: kein exakter Namenstreffer, fließt nicht in die Kameraden-Statistik ein)</li>
              </ul>
              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={handleImportBestaetigen} disabled={importiere || vorschau.neue.length === 0}>
                {importiere ? 'Importiere…' : vorschau.neue.length === 0 ? 'Keine neuen Einsätze' : `${vorschau.neue.length} Einsätze importieren`}
              </button>
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ borderLeft: `3px solid ${ROT}`, paddingLeft: 10, fontSize: 15 }}>Importierte Einsätze {jahr}</h2>
        <p style={{ margin: '4px 0 12px 13px', fontSize: 13, color: 'var(--gray-400)' }}>{einsaetze.length} Einsätze — bearbeiten oder löschen bei Fehlimport.</p>
        <div className="card">
          <table style={{ width: '100%', fontSize: 13.5, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingBottom: 8 }}>Datum</th>
                <th style={{ textAlign: 'left' }}>Nr.</th>
                <th style={{ textAlign: 'left' }}>Stichwort</th>
                <th style={{ textAlign: 'left' }}>Ort</th>
                <th style={{ textAlign: 'right' }}>Fzg./Pers.</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {einsaetze.map(e => (
                <tr key={e.id} style={{ borderTop: `1px solid ${HAIRLINE}` }}>
                  <td style={{ padding: '8px 0' }}>{format(parseISO(e.datum), 'dd.MM.yyyy', { locale: de })}</td>
                  <td>{e.einsatznummer}</td>
                  <td>{e.stichwort || '–'}</td>
                  <td>{e.einsatzort || '–'}</td>
                  <td style={{ textAlign: 'right' }}>{(e.fahrzeuge ?? []).length} / {(e.personal ?? []).length}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setBearbeiten(e)} style={{ marginRight: 6 }}>Bearbeiten</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleLoeschen(e)}>✕</button>
                  </td>
                </tr>
              ))}
              {einsaetze.length === 0 && <tr><td colSpan={6} style={{ padding: '12px 0', color: 'var(--gray-400)' }}>Noch keine Einsätze importiert.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {bearbeiten && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setBearbeiten(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Einsatz bearbeiten</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setBearbeiten(null)}>x</button>
            </div>
            <form onSubmit={handleBearbeitenSpeichern}>
              <div className="form-group">
                <label>Einsatznummer</label>
                <input value={bearbeiten.einsatznummer} onChange={e => setBearbeiten(b => ({ ...b, einsatznummer: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Datum</label>
                <input type="date" value={bearbeiten.datum} onChange={e => setBearbeiten(b => ({ ...b, datum: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Alarmzeit</label>
                <input value={bearbeiten.alarmzeit ?? ''} onChange={e => setBearbeiten(b => ({ ...b, alarmzeit: e.target.value }))} placeholder="z.B. 14:32" />
              </div>
              <div className="form-group">
                <label>Stichwort</label>
                <input value={bearbeiten.stichwort ?? ''} onChange={e => setBearbeiten(b => ({ ...b, stichwort: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Einsatzort</label>
                <input value={bearbeiten.einsatzort ?? ''} onChange={e => setBearbeiten(b => ({ ...b, einsatzort: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setBearbeiten(null)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary">Speichern</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
