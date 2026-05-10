import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const ML = 10
const MR = 10
const PW = 210
const TW = PW - ML - MR

function checkbox(doc, x, y, size, checked) {
  doc.setLineWidth(0.25)
  doc.rect(x, y, size, size)
  if (checked) {
    doc.setLineWidth(0.5)
    doc.line(x + 0.5, y + size * 0.5, x + size * 0.4, y + size - 0.5)
    doc.line(x + size * 0.4, y + size - 0.5, x + size - 0.5, y + 0.5)
    doc.setLineWidth(0.25)
  }
}

function formatDatum(datum) {
  if (!datum) return ''
  return new Date(datum + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function sectionHeader(doc, text, y) {
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setFillColor(220, 220, 220)
  doc.rect(ML, y, TW, 6, 'F')
  doc.setTextColor(0)
  doc.text(text, ML + 2, y + 4.2)
  doc.setFont('helvetica', 'normal')
  return y + 6
}

export function einsatzberichtPdf(form, wehrName) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  // ── Titel ──────────────────────────────────────────────────
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Einsatzbericht', PW / 2, 13, { align: 'center' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Freiwillige Feuerwehr Grammetal – ${wehrName || ''}`, PW / 2, 18, { align: 'center' })

  // ── Abschnitt 1: Kopfdaten ─────────────────────────────────
  let y = sectionHeader(doc, '1. Einsatzdaten', 22)

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold', fillColor: [240, 240, 240] },
      1: { cellWidth: 52 },
      2: { cellWidth: 32, fontStyle: 'bold', fillColor: [240, 240, 240] },
      3: { cellWidth: 'auto' },
    },
    body: [
      ['Wache:', wehrName || '', 'Datum:', formatDatum(form.datum)],
      ['Einsatzart:', form.einsatzart || '', 'Alarmzeit:', form.alarmzeit || ''],
      ['Einsatzort:', form.einsatzort || '', 'Gesamt-km:', form.km_gesamt ? String(form.km_gesamt) : ''],
    ],
    theme: 'grid',
  })

  // ── Abschnitt 2: Fahrzeuge ─────────────────────────────────
  y = sectionHeader(doc, '2. Fahrzeuge & Zeiten', doc.lastAutoTable.finalY + 3)

  const fahrzeuge = form.fahrzeuge || []
  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    headStyles: { fillColor: [240, 240, 240], fontStyle: 'bold', textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 22 },
      2: { cellWidth: 22 },
      3: { cellWidth: 22 },
      4: { cellWidth: 22 },
      5: { cellWidth: 22 },
      6: { cellWidth: 'auto' },
    },
    head: [['Fahrzeug', 'Ab (1)', 'Raus (3)', 'An (4)', 'Zurueck', 'Bereit (2)', 'km']],
    body: fahrzeuge.length > 0
      ? fahrzeuge.map(f => [f.fahrzeug || '', f.ab || '', f.raus || '', f.an || '', f.zurueck || '', f.bereit || '', f.km || ''])
      : [['HLF 10', '', '', '', '', '', ''], ['MTW', '', '', '', '', '', '']],
    theme: 'grid',
  })

  // ── Abschnitt 3: Einsatzkraefte ───────────────────────────
  y = sectionHeader(doc, '3. Einsatzkraefte', doc.lastAutoTable.finalY + 3)

  const kraefte = (form.einsatzkraefte || []).filter(k => k.aktiv)
  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    headStyles: { fillColor: [240, 240, 240], fontStyle: 'bold', textColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 24, halign: 'center' },
      3: { cellWidth: 28 },
      4: { cellWidth: 14, halign: 'center' },
    },
    head: [['Nr.', 'Name', 'Funktion', 'Fahrzeug', 'Atem-\nschutz']],
    body: kraefte.length > 0
      ? kraefte.map((k, i) => [
          String(i + 1),
          k.name || '',
          k.funktion || '',
          k.fahrzeug || '',
          k.atemschutz ? 'Ja' : '',
        ])
      : [['', '', '', '', '']],
    theme: 'grid',
  })

  // ── Abschnitt 4: Eingesetzte Mittel ───────────────────────
  y = sectionHeader(doc, '4. Eingesetzte Mittel', doc.lastAutoTable.finalY + 3)

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold', fillColor: [240, 240, 240] },
      1: { cellWidth: 28 },
      2: { cellWidth: 36, fontStyle: 'bold', fillColor: [240, 240, 240] },
      3: { cellWidth: 28 },
      4: { cellWidth: 'auto', fontStyle: 'bold', fillColor: [240, 240, 240] },
      5: { cellWidth: 'auto' },
    },
    body: [
      ['Bioversal Gemisch (l):', form.bioversal_l != null ? String(form.bioversal_l) : '', 'Absodan (kg):', form.absodan_kg != null ? String(form.absodan_kg) : '', 'Löschwasser (l):', form.loeschwasser_l != null ? String(form.loeschwasser_l) : ''],
      ['Schaummittel (l):', form.schaummittel_l != null ? String(form.schaummittel_l) : '', 'Sonstiges:', form.mittel_sonstiges || '', '', ''],
    ],
    theme: 'grid',
  })

  // ── Abschnitt 5: Beteiligte Organisationen ─────────────────
  const org = form.organisationen || {}
  y = sectionHeader(doc, '5. Beteiligte Organisationen', doc.lastAutoTable.finalY + 3)

  const orgBody = []

  // Weitere Feuerwehren
  const fws = org.feuerwehren || []
  orgBody.push(['Weitere Feuerwehren:', fws.map(f => f.name || f).filter(Boolean).join(', ') || '–'])

  // Polizei
  const pol = org.polizei || {}
  if (pol.name || pol.aktenzeichen) {
    orgBody.push(['Polizei:', [pol.name, pol.aktenzeichen, pol.dienststelle, pol.autobahn ? 'Autobahnpolizei' : ''].filter(Boolean).join(' | ')])
  } else {
    orgBody.push(['Polizei:', '–'])
  }

  // Rettungsdienste
  const rdList = org.rettungsdienste || []
  orgBody.push(['Rettungsdienst:', rdList.length > 0
    ? rdList.map(r => [r.typ, r.funkkenner, r.name, r.gesellschaft].filter(Boolean).join(' | ')).join('\n')
    : '–'])

  // Einsatzleitung
  const el = org.einsatzleitung || {}
  orgBody.push(['Einsatzleitung:', [el.name, el.feuerwehr].filter(Boolean).join(' – ') || '–'])

  // Übergabe
  const ue = org.uebergabe || {}
  orgBody.push(['Übergeben an:', [ue.name, ue.uhrzeit, ue.funktion].filter(Boolean).join(' | ') || '–'])

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold', fillColor: [240, 240, 240] },
      1: { cellWidth: 'auto' },
    },
    body: orgBody,
    theme: 'grid',
  })

  // Betroffene Personen
  const betroffene = org.betroffene || []
  if (betroffene.length > 0) {
    y = doc.lastAutoTable.finalY + 1
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      tableWidth: TW,
      styles: { fontSize: 8, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.25 },
      headStyles: { fillColor: [240, 240, 240], fontStyle: 'bold', textColor: [0, 0, 0] },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 22 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 30 },
        4: { cellWidth: 22 },
      },
      head: [['Name, Vorname', 'Geb. am', 'Adresse', 'Art der Beteiligung', 'Kennzeichen']],
      body: betroffene.map(b => [
        `${b.nachname || ''}, ${b.vorname || ''}`.trim().replace(/^,\s*/, ''),
        b.geboren || '',
        b.adresse || '',
        b.art || '',
        b.kennzeichen || '',
      ]),
      theme: 'grid',
    })
  }

  // ── Abschnitt 6: Kurzbericht ───────────────────────────────
  // Neue Seite wenn weniger als 60mm verbleiben
  if (doc.lastAutoTable.finalY > 237) doc.addPage()

  y = sectionHeader(doc, '6. Kurzbericht', doc.lastAutoTable.finalY + 3)

  const berichtFelder = [
    ['Lage beim Eintreffen:', form.lage_eintreffen],
    ['Tätigkeiten:', form.taetigkeiten],
    ['Erläuterung zur Lage:', form.erlaeuterung],
  ]

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    columnStyles: {
      0: { cellWidth: 42, fontStyle: 'bold', fillColor: [240, 240, 240], valign: 'top' },
      1: { cellWidth: 'auto', minCellHeight: 18 },
    },
    body: berichtFelder.map(([label, val]) => [label, val || '']),
    theme: 'grid',
  })

  // ── Abschnitt 7: Unterschrift ──────────────────────────────
  y = doc.lastAutoTable.finalY + 4

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    columnStyles: {
      0: { cellWidth: TW / 2 },
      1: { cellWidth: 'auto' },
    },
    body: [[form.abschluss_name || '', '']],
    theme: 'grid',
    didDrawCell(data) {
      if (data.row.index === 0 && data.section === 'body') {
        doc.setFontSize(7)
        doc.setTextColor(100)
        const label = data.column.index === 0 ? 'Name' : 'Unterschrift'
        doc.text(label, data.cell.x + 1.5, data.cell.y + data.cell.height - 1)
        doc.setTextColor(0)
      }
    },
  })

  // ── Fotos (neue Seite) ──────────────────────────────────────
  // Fotos werden als base64-DataURIs übergeben
  const fotos = form.fotoDataUrls || []
  if (fotos.length > 0) {
    doc.addPage()
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Fotodokumentation', PW / 2, 14, { align: 'center' })
    doc.setFont('helvetica', 'normal')

    const fotoBreite = (TW - 5) / 2
    const fotoHoehe = 60
    let fx = ML
    let fy = 20

    fotos.forEach((dataUrl, i) => {
      try {
        const fmt = dataUrl.includes('data:image/png') ? 'PNG' : 'JPEG'
        doc.addImage(dataUrl, fmt, fx, fy, fotoBreite, fotoHoehe)
      } catch (e) {
        // Foto nicht ladbar – überspringen
      }
      if (i % 2 === 1) {
        fx = ML
        fy += fotoHoehe + 5
        if (fy + fotoHoehe > 280) { doc.addPage(); fy = 15 }
      } else {
        fx = ML + fotoBreite + 5
      }
    })
  }

  return doc.output('datauristring').split(',')[1]
}
