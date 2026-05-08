import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const ML = 10  // margin left
const MR = 10  // margin right
const PW = 210 // page width mm
const TW = PW - ML - MR // table width

// Zeichnet ein Kontrollkästchen
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

// ─── AUSBILDUNGSNACHWEIS ────────────────────────────────────────────────────

export function ausbildungsnachweisPdf(form, kameraden) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const datumStr = form.datum
    ? new Date(form.datum + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  const teilnehmerNamen = (form.teilnehmer ?? [])
    .map(id => kameraden.find(k => k.id === id))
    .filter(Boolean)
    .map(k => `${k.nachname}, ${k.vorname}`)

  // Titel
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Dienst- / Ausbildungsnachweis der Freiwilligen Feuerwehr Grammetal', PW / 2, 15, { align: 'center' })

  // Kopftabelle
  autoTable(doc, {
    startY: 20,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold', fillColor: [220, 220, 220] },
      1: { cellWidth: 52 },
      2: { cellWidth: 28, fontStyle: 'bold', fillColor: [220, 220, 220] },
      3: { cellWidth: 'auto' },
    },
    body: [
      ['Ortsteilfeuerwehr:', form.ortsteil || '', 'Ausbilder:', form.ausbilder || ''],
      ['Datum:', datumStr, 'Beginn:', form.beginn ? form.beginn + ' Uhr' : ''],
      ['Ende:', form.ende ? form.ende + ' Uhr' : '', 'Minuten:', form.minuten || ''],
    ],
    theme: 'grid',
  })

  // Thema-Zeile mit Theorie/Praxis
  const y0 = doc.lastAutoTable.finalY
  const rowH = 8
  doc.setLineWidth(0.25)
  doc.rect(ML, y0, 38, rowH)
  doc.rect(ML + 38, y0, TW - 38, rowH)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Ausbildungsthema:', ML + 1.5, y0 + 5.5)
  doc.setFont('helvetica', 'normal')
  // Thema-Text (abschneiden wenn zu lang)
  const themaMax = doc.splitTextToSize(form.thema || '', TW - 38 - 50)
  doc.text(themaMax[0] || '', ML + 40, y0 + 5.5)
  // Checkboxen rechts
  const cxBase = ML + TW - 45
  const cy = y0 + (rowH - 3.5) / 2
  checkbox(doc, cxBase, cy, 3.5, form.theorie)
  doc.setFontSize(8.5)
  doc.text('Theorie', cxBase + 5, cy + 3)
  checkbox(doc, cxBase + 22, cy, 3.5, form.praxis)
  doc.text('Praxis', cxBase + 27, cy + 3)

  // Teilnehmerliste
  const listY = y0 + rowH + 4
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  doc.text('Teilnehmerliste', ML, listY)

  const zeilen = Array.from({ length: 25 }, (_, i) => ({
    nr: i + 1,
    aktiv: i < teilnehmerNamen.length,
    name: teilnehmerNamen[i] || '',
  }))

  autoTable(doc, {
    startY: listY + 2,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 8.5, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.2 },
    headStyles: { fillColor: [200, 200, 200], fontStyle: 'bold', fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 55 },
    },
    head: [['Nr.', '☐', 'Name', 'Unterschrift']],
    body: zeilen.map(z => [z.nr, '', z.name, '']),
    theme: 'grid',
    didDrawCell(data) {
      if (data.section === 'body' && data.column.index === 1) {
        const s = 3.5
        const x = data.cell.x + (data.cell.width - s) / 2
        const y = data.cell.y + (data.cell.height - s) / 2
        checkbox(doc, x, y, s, zeilen[data.row.index]?.aktiv)
      }
    },
  })

  // Unterschriften
  const signY = doc.lastAutoTable.finalY + 8
  const colW = TW / 3
  const sigLabels = [
    'Datum / Unterschrift Ausbilder',
    'Datum / Unterschrift Wehrführer',
    'Datum / Unterschrift Sachbearbeiter',
  ]
  doc.setLineWidth(0.3)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  sigLabels.forEach((label, i) => {
    const x = ML + i * colW
    doc.line(x + 2, signY + 10, x + colW - 2, signY + 10)
    doc.text(label, x + colW / 2, signY + 13, { align: 'center', maxWidth: colW - 4 })
  })

  return doc.output('datauristring').split(',')[1]
}

// ─── VERDIENSTAUSFALL ────────────────────────────────────────────────────────

export function verdienstausfallPdf(form, STUNDENSATZ) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  function fmt(iso) {
    if (!iso) return ''
    return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const datumAnzeige = !form.datum_von ? '' :
    (!form.datum_bis || form.datum_bis === form.datum_von)
      ? fmt(form.datum_von)
      : `${fmt(form.datum_von)} bis ${fmt(form.datum_bis)}`

  let y = 14

  // Titel
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Antrag', PW / 2, y, { align: 'center' }); y += 5
  doc.text('(Selbständige oder Freiberufler)', PW / 2, y, { align: 'center' }); y += 5
  doc.setFont('helvetica', 'normal')
  doc.text('auf Erstattung des Verdienstausfalls', PW / 2, y, { align: 'center' }); y += 8

  // Kopfzeile Ortsteil
  doc.setFontSize(9)
  doc.text('bei Einsätzen der FFw Grammetal Ortsteilfeuerwehr', ML, y)
  doc.setLineWidth(0.3)
  const lineStart = ML + 74
  doc.line(lineStart, y, PW - MR, y)
  doc.text(form.ortsteil || '', lineStart + 2, y - 0.5)
  y += 5

  // Adresse
  doc.setFontSize(9)
  doc.text('Gemeinde Grammetal\nSchlosssgasse 19\n99428 Grammetal', ML, y)
  y += 16

  // Abschnitt 1
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('1. Angaben zum Antragsteller (durch den Antragsteller auszufüllen)', ML, y); y += 5
  doc.setFontSize(9)
  doc.text('1.1  Angaben zum Antragsteller:', ML, y); y += 3

  // Antragsteller-Tabelle
  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'normal', fillColor: [240, 240, 240] },
      1: { cellWidth: 'auto' },
    },
    body: [
      ['Name, Vorname', `${form.name || ''}${form.name && form.vorname ? ', ' : ''}${form.vorname || ''}`],
      ['Anschrift', { content: form.anschrift || '', styles: { minCellHeight: 8 } }],
      ['Bankverbindung\n– Kontoinhaber', form.kontoinhaber || ''],
      ['– Bank', form.bankname || ''],
      ['– IBAN', { content: form.iban || '', styles: { font: 'courier', fontSize: 9 } }],
      ['– BIC', { content: form.bic || '', styles: { font: 'courier', fontSize: 9 } }],
    ],
    theme: 'grid',
  })

  y = doc.lastAutoTable.finalY + 3

  // Einsatz-Tabelle
  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    columnStyles: {
      0: { cellWidth: 20, fillColor: [240, 240, 240] },
      1: { cellWidth: 20, fillColor: [240, 240, 240] },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 16, fillColor: [240, 240, 240] },
      4: { cellWidth: 'auto' },
    },
    body: [
      [{ content: 'Einsatz', rowSpan: 2, styles: { valign: 'middle' } }, 'Datum', { content: datumAnzeige, colSpan: 3 }],
      ['', 'Uhrzeit', 'von', form.uhrzeit_von ? form.uhrzeit_von + ' Uhr' : '', 'bis', form.uhrzeit_bis ? form.uhrzeit_bis + ' Uhr' : ''],
    ],
    theme: 'grid',
  })

  y = doc.lastAutoTable.finalY + 3
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('1.2 für den Einsatzzeitraum entstandener Verdienstausfall:', ML, y); y += 3

  // Abrechnung-Tabelle
  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    columnStyles: {
      0: { cellWidth: 30, fillColor: [240, 240, 240] },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 28, halign: 'right' },
    },
    body: [
      [{ content: 'Abrechnung', rowSpan: 2, styles: { valign: 'middle' } },
        `Anzahl Stunden à ${STUNDENSATZ} Euro`,
        form.stunden ? form.stunden + ' Std.' : 'Std.'],
      ['', 'Summe', form.summe ? form.summe + ' EUR' : 'EUR'],
    ],
    theme: 'grid',
  })

  y = doc.lastAutoTable.finalY + 5
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Hiermit wird versichert, dass die gemachten Angaben der Wahrheit entsprechen.', ML, y); y += 4
  doc.text('Die hier erzielten Einnahmen sind einkommenssteuerpflichtig.', ML, y); y += 14

  // Unterschriften
  doc.setLineWidth(0.3)
  doc.line(ML, y, ML + TW, y); y += 3
  doc.setFontSize(8)
  doc.text('Ort, Datum, Unterschrift, Antragsteller, Firmenstempel', ML, y); y += 14
  doc.line(ML, y, ML + TW, y); y += 3
  doc.text('Ort, Datum, Unterschrift Ortsbrandmeister', ML, y); y += 12

  // Erläuterungen
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Erläuterungen:', ML, y); y += 4
  doc.setFont('helvetica', 'normal')
  const erl = [
    `Für die nachgewiesene Einsatzzeit im Feuerwehrdienst erhalten Selbständige und Freiberufler als Entschädigung für Verdienstausfall eine Pauschalentschädigung von ${STUNDENSATZ},00 Euro je Stunde. Für angefangene Stunden bis 30 Minuten wird der halbe, im übrigen der volle Stundensatz gezahlt.`,
    'Der Verdienstausfall wird auf Antrag, werktags in der Zeit von 07.00 – 18.00 Uhr für maximal 8 Stunden pro Tag gewährt.',
    'Es sind amtliche Antragsformulare der Gemeinde zu verwenden.',
    'Die Anträge sind durch den Ortsbrandmeister gegenzuzeichnen.',
  ]
  erl.forEach(e => {
    const lines = doc.splitTextToSize('• ' + e, TW - 4)
    doc.text(lines, ML + 2, y)
    y += lines.length * 3.5 + 1
  })

  return doc.output('datauristring').split(',')[1]
}

// ─── AUSLAGENERSTATTUNG ──────────────────────────────────────────────────────

export function auslagenerstattungPdf(form, gesamt) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  let y = 14

  // Absender
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Absender:', ML, y); y += 4
  doc.setFont('helvetica', 'normal')
  doc.text(form.absender || '', ML, y); y += (form.absender?.split('\n').length || 1) * 4 + 10

  // Empfänger
  doc.text('Gemeinde Grammetal\nSchlossgasse 19\n99428 Grammetal', ML, y); y += 18

  // Titel
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Antrag auf Auslagenerstattung', ML, y); y += 7
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Ich bitte um Erstattung folgender Positionen (Beleg/e sind beigefügt):', ML, y); y += 4

  // Positionen-Tabelle
  const gefuellteZeilen = form.zeilen.filter(z => z.firma || z.gegenstand || z.preis)
  const alleZeilen = form.zeilen

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    tableWidth: TW,
    styles: { fontSize: 9, cellPadding: 2, lineColor: [0, 0, 0], lineWidth: 0.25 },
    headStyles: { fillColor: [210, 210, 210], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 28, halign: 'right' },
    },
    head: [['Nr.', 'Firma/Institution', 'Gegenstand/Verwendungszweck', 'Bruttopreis']],
    body: [
      ...alleZeilen.map((z, i) => {
        const preis = parseFloat(z.preis?.replace(',', '.')) || 0
        return [
          i + 1,
          z.firma || '',
          z.gegenstand || '',
          preis > 0 ? preis.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €' : '',
        ]
      }),
      [{ content: 'Gesamt', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: [235, 235, 235] } },
        { content: gesamt.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €', styles: { halign: 'right', fontStyle: 'bold', fillColor: [235, 235, 235] } }],
    ],
    theme: 'grid',
  })

  y = doc.lastAutoTable.finalY + 5
  doc.setFontSize(9)
  doc.text('Ich bitte um Überweisung. Meine Kontoverbindung lautet:', ML, y); y += 5

  // IBAN / BIC
  doc.setFontSize(8)
  doc.text('IBAN (max. 22 Stellen)  Angabe erforderlich', ML, y); y += 3
  doc.setLineWidth(0.3)
  doc.rect(ML, y, 90, 8)
  doc.setFontSize(10)
  doc.setFont('courier', 'normal')
  doc.text(form.iban || '', ML + 3, y + 5.5)
  y += 12

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text('BIC (8 oder 11 Stellen)', ML, y); y += 3
  doc.setLineWidth(0.3)
  doc.rect(ML, y, 50, 8)
  doc.setFontSize(10)
  doc.setFont('courier', 'normal')
  doc.text(form.bic || '', ML + 3, y + 5.5)
  y += 14

  // Bestätigung
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text('Die sachliche und rechnerische Richtigkeit wird bestätigt.', ML, y); y += 10

  // Unterschriften
  doc.setLineWidth(0.3)
  const halfW = (TW - 10) / 2
  doc.rect(ML, y, halfW, 12)
  doc.rect(ML + halfW + 10, y, halfW, 12)
  doc.setFontSize(8)
  doc.text(form.datum || '', ML + 2, y + 8)
  y += 14
  doc.text('Datum', ML + 2, y)
  doc.text('Unterschrift', ML + halfW + 12, y)

  return doc.output('datauristring').split(',')[1]
}
