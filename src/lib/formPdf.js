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
// Beide Wege (lokal + Mail) nutzen exakt diese Funktion → immer identisches Ergebnis

export function verdienstausfallPdf(form, STUNDENSATZ) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const LBL = [240, 240, 240]  // Hintergrundfarbe Beschriftungszellen
  const VAL = [255, 255, 255]  // Hintergrundfarbe Wertzellen
  const VML = 22.5             // linker Rand (Tabelle 165mm zentriert auf A4: (210-165)/2 = 22.5)
  const VTW = 165              // Tabellenbreite laut Originalvorlage

  function fmt(iso) {
    if (!iso) return ''
    return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const datumAnzeige = !form.datum_von ? '' :
    (!form.datum_bis || form.datum_bis === form.datum_von)
      ? fmt(form.datum_von)
      : `${fmt(form.datum_von)} bis ${fmt(form.datum_bis)}`

  let y = 25

  // ── Titel ──────────────────────────────────────────────────────────────────
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Antrag', PW / 2, y, { align: 'center' }); y += 5
  doc.text('(Selbstaendige oder Freiberufler)', PW / 2, y, { align: 'center' }); y += 5
  doc.setFont('helvetica', 'normal')
  doc.text('auf Erstattung des Verdienstausfalls', PW / 2, y, { align: 'center' }); y += 8

  // ── Kopfzeile: Ortsteil ────────────────────────────────────────────────────
  doc.setFontSize(9)
  const kopfText = 'bei Einsaetzen der FFw Grammetal Ortsteilfeuerwehr'
  doc.text(kopfText, VML, y)
  const lineStart = VML + doc.getTextWidth(kopfText) + 2
  doc.setLineWidth(0.3)
  doc.line(lineStart, y, VML + VTW, y)
  if (form.ortsteil) doc.text(form.ortsteil, lineStart + 2, y - 0.8)
  y += 10  // mehr Abstand vor der Adresse

  // ── Adresse ────────────────────────────────────────────────────────────────
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Gemeinde Grammetal', VML, y); y += 4.5
  doc.text('Schlossgasse 19', VML, y); y += 4.5
  doc.text('99428 Grammetal', VML, y); y += 12  // mehr Abstand nach der Adresse

  // ── Abschnitt 1 ────────────────────────────────────────────────────────────
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('1. Angaben zum Antragsteller (durch den Antragsteller auszufuellen)', VML, y); y += 7
  doc.setFontSize(9)
  doc.text('1.1  Angaben zum Antragsteller:', VML, y); y += 4

  // ── Antragsteller-Tabelle ──────────────────────────────────────────────────
  // col0=16mm (Bankverbindung-Label), col1=44mm (Sublabels), col2=auto=105mm (Werte)
  // Summe: 16+44+105=165mm ✓
  // Name/Anschrift: colSpan:2 → 16+44=60mm Label | 105mm Wert
  // Bankverbindung: col0 rowSpan:4 (16mm) | col1 Sublabel (44mm) | col2 Wert (105mm)
  // → rechte Kante Name/Vorname-Label = rechte Kante Bankverbindung+Sublabel = 60mm ✓
  // Höhe: 6 Zeilen × ~6.7mm ≈ 40mm
  const nameStr = `${form.name || ''}${form.name && form.vorname ? ', ' : ''}${form.vorname || ''}`
  autoTable(doc, {
    startY: y,
    margin: { left: VML, right: VML },
    tableWidth: VTW,
    styles: { fontSize: 9, cellPadding: 1.5, minCellHeight: 6.7, lineColor: [0, 0, 0], lineWidth: 0.25, fillColor: VAL },
    columnStyles: {
      0: { cellWidth: 16, fillColor: LBL },
      1: { cellWidth: 44, fillColor: LBL },
      2: { cellWidth: 'auto', fillColor: VAL },
    },
    body: [
      [
        { content: 'Name, Vorname', colSpan: 2, styles: { fillColor: LBL } },
        { content: nameStr, styles: { fillColor: VAL } },
      ],
      [
        { content: 'Anschrift', colSpan: 2, styles: { fillColor: LBL } },
        { content: form.anschrift || '', styles: { fillColor: VAL } },
      ],
      [
        { content: 'Bankverbindung', rowSpan: 4, styles: { valign: 'middle', fillColor: LBL } },
        { content: 'Name des Kontoinhabers', styles: { fillColor: LBL } },
        { content: form.kontoinhaber || '', styles: { fillColor: VAL } },
      ],
      [
        { content: 'Name und Sitz der Bank', styles: { fillColor: LBL } },
        { content: form.bankname || '', styles: { fillColor: VAL } },
      ],
      [
        { content: 'IBAN', styles: { fillColor: LBL } },
        { content: form.iban || '', styles: { fillColor: VAL, font: 'courier', fontSize: 9 } },
      ],
      [
        { content: 'BIC', styles: { fillColor: LBL } },
        { content: form.bic || '', styles: { fillColor: VAL, font: 'courier', fontSize: 9 } },
      ],
    ],
    theme: 'grid',
  })

  y = doc.lastAutoTable.finalY + 3

  // ── Einsatz-Tabelle ────────────────────────────────────────────────────────
  // col0(Einsatz)=20mm + col1(Datum)=40mm = 60mm laut Vorlage
  // Restliche 105mm: col2=12, col3=33, col4=10, col5=auto(50) → 20+40+12+33+10+50=165 ✓
  // Höhe: 2 Zeilen × 6mm = 12mm
  autoTable(doc, {
    startY: y,
    margin: { left: VML, right: VML },
    tableWidth: VTW,
    styles: { fontSize: 9, cellPadding: 1.5, minCellHeight: 6, lineColor: [0, 0, 0], lineWidth: 0.25, fillColor: VAL },
    columnStyles: {
      0: { cellWidth: 20, fillColor: LBL },
      1: { cellWidth: 40, fillColor: LBL },
      2: { cellWidth: 12, fillColor: LBL },
      3: { cellWidth: 33, fillColor: VAL },
      4: { cellWidth: 10, fillColor: LBL },
      5: { cellWidth: 'auto', fillColor: VAL },
    },
    body: [
      [
        { content: 'Einsatz', rowSpan: 2, styles: { valign: 'middle', fillColor: LBL } },
        { content: 'Datum', styles: { fillColor: LBL } },
        { content: datumAnzeige, colSpan: 4, styles: { fillColor: VAL } },
      ],
      [
        { content: 'Uhrzeit', styles: { fillColor: LBL } },
        { content: 'von', styles: { fillColor: LBL } },
        { content: form.uhrzeit_von ? form.uhrzeit_von + ' Uhr' : '', styles: { fillColor: VAL } },
        { content: 'bis', styles: { fillColor: LBL } },
        { content: form.uhrzeit_bis ? form.uhrzeit_bis + ' Uhr' : '', styles: { fillColor: VAL } },
      ],
    ],
    theme: 'grid',
  })

  y = doc.lastAutoTable.finalY + 7
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('1.2 fuer den Einsatzzeitraum entstandener Verdienstausfall:', VML, y); y += 6

  // ── Abrechnung-Tabelle ─────────────────────────────────────────────────────
  // col0=60mm (Abrechnung), col1=55mm (Beschreibung), col2=auto=50mm (Wert) → 60+55+50=165 ✓
  // Höhe: 2 Zeilen × 6mm = 12mm
  autoTable(doc, {
    startY: y,
    margin: { left: VML, right: VML },
    tableWidth: VTW,
    styles: { fontSize: 9, cellPadding: 1.5, minCellHeight: 6, lineColor: [0, 0, 0], lineWidth: 0.25, fillColor: VAL },
    columnStyles: {
      0: { cellWidth: 60, fillColor: LBL },
      1: { cellWidth: 55, fillColor: LBL },
      2: { cellWidth: 'auto', halign: 'right', fillColor: VAL },
    },
    body: [
      [
        { content: 'Abrechnung', rowSpan: 2, styles: { valign: 'middle', fillColor: LBL } },
        { content: `Anzahl Stunden a ${STUNDENSATZ} Euro`, styles: { fillColor: LBL } },
        { content: form.stunden ? form.stunden + ' Std.' : '', styles: { fillColor: VAL } },
      ],
      [
        { content: 'Summe', styles: { fillColor: LBL } },
        { content: form.summe ? form.summe + ' EUR' : '', styles: { fillColor: VAL, fontStyle: 'bold' } },
      ],
    ],
    theme: 'grid',
  })

  y = doc.lastAutoTable.finalY + 5

  // ── Versicherungstext ──────────────────────────────────────────────────────
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Hiermit wird versichert, dass die gemachten Angaben der Wahrheit entsprechen.', VML, y); y += 4
  doc.text('Die hier erzielten Einnahmen sind einkommenssteuerpflichtig.', VML, y); y += 18

  // ── Unterschriften ─────────────────────────────────────────────────────────
  doc.setLineWidth(0.3)
  doc.line(VML, y, VML + VTW, y); y += 3
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Ort, Datum, Unterschrift, Antragsteller, Firmenstempel', VML, y); y += 16
  doc.line(VML, y, VML + VTW, y); y += 3
  doc.text('Ort, Datum, Unterschrift Ortsbrandmeister', VML, y); y += 12

  // ── Erlaeuterungen ─────────────────────────────────────────────────────────
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Erlaeuterungen:', VML, y); y += 4
  doc.setFont('helvetica', 'normal')
  const erl = [
    `Fuer die nachgewiesene Einsatzzeit im Feuerwehrdienst erhalten Selbstaendige und Freiberufler als Entschaedigung fuer Verdienstausfall eine Pauschalentschaedigung von ${STUNDENSATZ},00 Euro je Stunde. Fuer angefangene Stunden bis 30 Minuten wird der halbe, im uebrigen der volle Stundensatz gezahlt.`,
    'Der Verdienstausfall wird auf Antrag, werktags in der Zeit von 07.00 - 18.00 Uhr fuer maximal 8 Stunden pro Tag gewaehrt.',
    'Es sind amtliche Antragsformulare der Gemeinde zu verwenden.',
    'Die Antraege sind durch den Ortsbrandmeister gegenzuzeichnen.',
  ]
  erl.forEach((e, idx) => {
    const lines = doc.splitTextToSize(`${idx + 1}. ${e}`, VTW - 6)
    doc.text(lines, VML + 3, y)
    y += lines.length * 3.5 + 1.5
  })

  return doc.output('datauristring').split(',')[1]
}

// ─── AUSLAGENERSTATTUNG ──────────────────────────────────────────────────────

export function auslagenerstattungPdf(form, gesamt) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const AML = 20   // linker Rand (Tabelle 170mm zentriert auf A4: (210-170)/2 = 20)
  const ATW = 170  // Tabellenbreite laut Originalvorlage

  let y = 14

  // ── Absender (Überschrift unterstrichen) ────────────────────────────────────
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Absender:', AML, y)
  doc.setLineWidth(0.25)
  doc.line(AML, y + 0.8, AML + doc.getTextWidth('Absender:'), y + 0.8)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.text(form.absender || '', AML, y)

  // ── Empfänger-Adresse: fest bei 60mm vom Seitenrand ──────────────────────
  y = 60
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Gemeinde Grammetal', AML, y); y += 4.5
  doc.text('Schlossgasse 19', AML, y); y += 4.5
  doc.text('99428 Grammetal', AML, y)
  y += 18  // ~18mm Abstand bis zur Überschrift

  // ── Titel ─────────────────────────────────────────────────────────────────
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Antrag auf Auslagenerstattung', AML, y); y += 7
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Ich bitte um Erstattung folgender Positionen (Beleg/e sind beigefügt):', AML, y); y += 4

  // ── Positionen-Tabelle ────────────────────────────────────────────────────
  // Keine Hintergrundfarben: weiß mit schwarzer Schrift, Kopfzeile fett
  // col0=9mm, col1=65mm, col2=75mm, col3=21mm → 9+65+75+21=170mm ✓
  // Kopfzeile: 12.2mm; Datenzeilen: 11mm; Gesamt-Zeile: 7mm
  const WHITE = [255, 255, 255]
  const BLACK = [0, 0, 0]
  autoTable(doc, {
    startY: y,
    margin: { left: AML, right: AML },
    tableWidth: ATW,
    styles: { fontSize: 9, cellPadding: 2, minCellHeight: 11, lineColor: BLACK, lineWidth: 0.25, fillColor: WHITE, textColor: BLACK },
    headStyles: { fillColor: WHITE, textColor: BLACK, fontStyle: 'bold', minCellHeight: 12.2 },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 65 },
      2: { cellWidth: 75 },
      3: { cellWidth: 21, halign: 'right' },
    },
    head: [['Nr.', 'Firma/Institution', 'Gegenstand/Verwendungszweck', 'Bruttopreis']],
    body: [
      ...form.zeilen.map((z, i) => {
        const preis = parseFloat(z.preis?.replace(',', '.')) || 0
        return [
          i + 1,
          z.firma || '',
          z.gegenstand || '',
          preis > 0 ? preis.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €' : '',
        ]
      }),
      [
        { content: 'Gesamt', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fillColor: WHITE, textColor: BLACK, minCellHeight: 7 } },
        { content: gesamt.toLocaleString('de-DE', { minimumFractionDigits: 2 }) + ' €', styles: { halign: 'right', fontStyle: 'bold', fillColor: WHITE, textColor: BLACK, minCellHeight: 7 } },
      ],
    ],
    theme: 'grid',
  })

  y = doc.lastAutoTable.finalY + 5
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Ich bitte um Überweisung. Meine Kontoverbindung lautet:', AML, y); y += 5

  // ── IBAN / BIC als Tabelle (Label | Wert) ─────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: AML, right: AML },
    tableWidth: ATW,
    styles: { fontSize: 9, cellPadding: 2, minCellHeight: 10, lineColor: BLACK, lineWidth: 0.25, fillColor: WHITE, textColor: BLACK },
    columnStyles: {
      0: { cellWidth: 65, fontStyle: 'bold' },
      1: { cellWidth: 'auto', font: 'courier' },
    },
    body: [
      ['IBAN (max. 22 Stellen)', form.iban || ''],
      ['BIC (8 oder 11 Stellen)', form.bic || ''],
    ],
    theme: 'grid',
  })

  y = doc.lastAutoTable.finalY + 5

  // ── Bestätigung ───────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text('Die sachliche und rechnerische Richtigkeit wird bestätigt.', AML, y); y += 8

  // ── Datum / Unterschrift als Tabelle ──────────────────────────────────────
  // Zeile 1 (Schreibfeld): enthält ggf. eingetragenes Datum oben
  // Zeile 2 (Beschriftung): "Datum" und "Unterschrift" als Label unten
  autoTable(doc, {
    startY: y,
    margin: { left: AML, right: AML },
    tableWidth: ATW,
    styles: { fontSize: 8, cellPadding: 2, lineColor: BLACK, lineWidth: 0.25, fillColor: WHITE, textColor: BLACK },
    columnStyles: {
      0: { cellWidth: 65 },
      1: { cellWidth: 105 },
    },
    body: [
      [
        { content: form.datum || '', styles: { minCellHeight: 18, valign: 'top' } },
        { content: '', styles: { minCellHeight: 18 } },
      ],
      [
        { content: 'Datum', styles: { minCellHeight: 6, fontStyle: 'bold' } },
        { content: 'Unterschrift', styles: { minCellHeight: 6, fontStyle: 'bold' } },
      ],
    ],
    theme: 'grid',
  })

  return doc.output('datauristring').split(',')[1]
}
