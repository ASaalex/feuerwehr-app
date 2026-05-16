// ── Gemeinsame Hilfsfunktionen für Vorschrift-Suche & Markdown ──────────────

// Markdown **fett** → <strong>
export function renderMd(text) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)
}

// Extrahiert Dokument-Name, Abschnittsnummer und Titel aus einem Referenz-String
export function extrahiereVorschriftRef(referenzText) {
  const dokMatch = referenzText.match(/(?:FwDV\s*\d+|ThürBKG|ThuerBKG|DIN\s*[\dEN\-]+|UVV\s*\w+|vfdb\s*[\w\-]+)/i)
  const dokName = dokMatch ? dokMatch[0].replace(/\s+/g, ' ').trim() : null
  const abschnittMatch = referenzText.match(/(?:Abschnitt|§|Nr\.|Ziffer|Kapitel|Punkt)\s*[\d.]+/i)
  const abschnitt = abschnittMatch ? abschnittMatch[0] : null
  const titelMatch = referenzText.match(/"([^"]+)"/)
  const titelInhalt = titelMatch ? titelMatch[1] : null
  return { dokName, abschnitt, titelInhalt }
}

// Prüft ob Treffer im Inhaltsverzeichnis liegt:
// Im TOC folgt der nächste Hauptabschnitt (nr+1) sehr schnell (< 450 Zeichen).
export function istInhaltsverzeichnis(text, idx, matchLen, nrInt) {
  const blick = text.slice(idx + matchLen, idx + matchLen + 450)
  if (nrInt) {
    const naechste = nrInt + 1
    if (new RegExp('[\\s]' + naechste + '\\s{2,}[A-ZÄÖÜ]').test(blick)) return true
    if (new RegExp('^' + naechste + '\\s{2,}[A-ZÄÖÜ]').test(blick.trim())) return true
  }
  const treffer = (blick.match(/(?:^|\s)\d+(\.\d+)*\s{2,}/gm) || []).length
  if (treffer >= 4) return true
  return false
}

// Findet den relevanten Abschnittsinhalt im PDF-extrahierten Text.
// Überspringt Inhaltsverzeichnis-Einträge und gibt den echten Abschnittstext zurück.
export function sucheAbschnittInText(text, abschnitt, titelInhalt) {
  if (!text) return null

  const nr = abschnitt?.match(/[\d.]+/)?.[0]
  const nrInt = nr && !nr.includes('.') ? parseInt(nr) : null

  const kandidaten = []
  if (nr && titelInhalt) {
    kandidaten.push(nr + '   ' + titelInhalt)
    kandidaten.push(nr + '  ' + titelInhalt)
    kandidaten.push(nr + ' ' + titelInhalt)
  }
  if (nr) {
    kandidaten.push('  ' + nr + '   ')
    kandidaten.push('\n' + nr + '   ')
    kandidaten.push('\n' + nr + '  ')
  }
  if (abschnitt) kandidaten.push(abschnitt)
  if (titelInhalt) kandidaten.push(titelInhalt)

  for (const k of kandidaten) {
    let von = 0
    while (true) {
      const idx = text.toLowerCase().indexOf(k.toLowerCase(), von)
      if (idx === -1) break

      if (!istInhaltsverzeichnis(text, idx, k.length, nrInt)) {
        const start = idx
        const rest = text.slice(idx + k.length)
        const abschnittsEnde = nrInt
          ? rest.search(new RegExp('(?:\\s{2,}|\\n)' + (nrInt + 1) + '\\s{2,}[A-ZÄÖÜ]'))
          : rest.search(/(?:\s{2,}|\n)\d+\s{3,}[A-ZÄÖÜ]/)
        const laenge = (abschnittsEnde > 100 && abschnittsEnde < 3000)
          ? abschnittsEnde
          : Math.min(rest.length, 2500)
        return text.slice(start, idx + k.length + laenge).trim()
      }
      von = idx + 1
    }
  }

  return null
}

// Sucht den passenden Abschnitt im Regelwerk-Array anhand eines Referenz-Strings.
// Gibt { dokTitel, abschnittText, gefunden } zurück.
export function findeVorschriftInRegelwerken(referenzText, regelwerke) {
  const ref = referenzText.replace(/^📖\s*(VORSCHRIFT:?\s*)?/, '').trim()
  const { dokName, abschnitt, titelInhalt } = extrahiereVorschriftRef(ref)

  let gefundenesRw = null
  if (dokName) {
    const dokKey = dokName.replace(/\s+/g, '').toLowerCase()
    gefundenesRw = regelwerke.find(rw =>
      rw.titel.replace(/\s+/g, '').toLowerCase().includes(dokKey) ||
      dokKey.includes(rw.titel.replace(/\s+/g, '').toLowerCase().split('–')[0].trim())
    )
  }
  if (!gefundenesRw && (abschnitt || titelInhalt)) {
    for (const rw of regelwerke) {
      if (sucheAbschnittInText(rw.inhalt_text, abschnitt, titelInhalt)) {
        gefundenesRw = rw
        break
      }
    }
  }

  const abschnittText = gefundenesRw
    ? sucheAbschnittInText(gefundenesRw.inhalt_text, abschnitt, titelInhalt)
    : null

  return {
    referenz: ref,
    dokTitel: gefundenesRw?.titel ?? dokName ?? 'Dienstvorschrift',
    abschnittText,
    gefunden: !!gefundenesRw,
  }
}
