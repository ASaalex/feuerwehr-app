// Standard-Avatare fuer Gaeste ohne Login (Quiz-Beitritt per QR-Code/Link).
// Bewusst als Emoji + Farbe statt Bilddateien: kein Upload, keine externen Abhaengigkeiten.
// Thematisch an die Feuerwehr angelehnt: Personal, Fahrzeuge, Geraete.
export const AVATARE = [
  { key: 'feuerwehrmann',   emoji: '🧑‍🚒', farbe: '#DC2626' },
  { key: 'feuerwehrfrau',   emoji: '👩‍🚒', farbe: '#B91C1C' },
  { key: 'feuerwehrmann2',  emoji: '👨‍🚒', farbe: '#991B1B' },
  { key: 'loeschfahrzeug',  emoji: '🚒', farbe: '#DC2626' },
  { key: 'rettungswagen',   emoji: '🚑', farbe: '#2563EB' },
  { key: 'hubschrauber',    emoji: '🚁', farbe: '#1D4ED8' },
  { key: 'drehleiter',      emoji: '🪜', farbe: '#EA580C' },
  { key: 'strahlrohr',      emoji: '🚿', farbe: '#0284C7' },
  { key: 'feuerloescher',   emoji: '🧯', farbe: '#B91C1C' },
  { key: 'helm',            emoji: '⛑️', farbe: '#D97706' },
  { key: 'axt',             emoji: '🪓', farbe: '#57534E' },
  { key: 'rettungsschere',  emoji: '✂️', farbe: '#7C2D12' },
  { key: 'spreizer',        emoji: '🔧', farbe: '#475569' },
  { key: 'kettensaege',     emoji: '🪚', farbe: '#92400E' },
  { key: 'blaulicht',       emoji: '🚨', farbe: '#2563EB' },
  { key: 'feuer',           emoji: '🔥', farbe: '#EA580C' },
  { key: 'rauch',           emoji: '💨', farbe: '#6B7280' },
  { key: 'loeschwasser',    emoji: '💧', farbe: '#0EA5E9' },
  { key: 'feuerwehrknoten', emoji: '🪢', farbe: '#7C2D12' },
  { key: 'handschuhe',      emoji: '🧤', farbe: '#B45309' },
  { key: 'stiefel',         emoji: '🥾', farbe: '#44403C' },
  { key: 'melder',          emoji: '📟', farbe: '#374151' },
  { key: 'rettungsring',    emoji: '🛟', farbe: '#EA580C' },
  { key: 'drehleiterkorb',  emoji: '🏗️', farbe: '#57534E' },
]

export function getAvatar(key) {
  return AVATARE.find(a => a.key === key) ?? AVATARE[0]
}
