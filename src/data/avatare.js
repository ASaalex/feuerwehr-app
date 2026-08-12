// Standard-Avatare fuer Gaeste ohne Login (Quiz-Beitritt per QR-Code/Link).
// Bewusst als Emoji + Farbe statt Bilddateien: kein Upload, keine externen Abhaengigkeiten.
export const AVATARE = [
  { key: 'fuchs',      emoji: '🦊', farbe: '#EA580C' },
  { key: 'baer',       emoji: '🐻', farbe: '#92400E' },
  { key: 'loewe',      emoji: '🦁', farbe: '#D97706' },
  { key: 'tiger',      emoji: '🐯', farbe: '#EA580C' },
  { key: 'panda',      emoji: '🐼', farbe: '#374151' },
  { key: 'koala',      emoji: '🐨', farbe: '#6B7280' },
  { key: 'frosch',     emoji: '🐸', farbe: '#16A34A' },
  { key: 'drache',     emoji: '🐲', farbe: '#15803D' },
  { key: 'einhorn',    emoji: '🦄', farbe: '#DB2777' },
  { key: 'krake',      emoji: '🐙', farbe: '#7C3AED' },
  { key: 'hai',        emoji: '🦈', farbe: '#2563EB' },
  { key: 'pinguin',    emoji: '🐧', farbe: '#1D4ED8' },
  { key: 'eule',       emoji: '🦉', farbe: '#7C2D12' },
  { key: 'chamaeleon', emoji: '🦎', farbe: '#059669' },
  { key: 'roboter',    emoji: '🤖', farbe: '#475569' },
  { key: 'alien',      emoji: '👽', farbe: '#16A34A' },
  { key: 'geist',      emoji: '👻', farbe: '#64748B' },
  { key: 'ninja',      emoji: '🥷', farbe: '#1F2937' },
  { key: 'clown',      emoji: '🤡', farbe: '#DC2626' },
  { key: 'zauberer',   emoji: '🧙', farbe: '#4338CA' },
  { key: 'superheld',  emoji: '🦸', farbe: '#2563EB' },
  { key: 'ritter',     emoji: '🛡️', farbe: '#57534E' },
  { key: 'pirat',      emoji: '🏴‍☠️', farbe: '#1F2937' },
  { key: 'rakete',     emoji: '🚀', farbe: '#DC2626' },
]

export function getAvatar(key) {
  return AVATARE.find(a => a.key === key) ?? AVATARE[0]
}
