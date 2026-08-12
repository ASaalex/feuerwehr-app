import { AVATARE } from '../data/avatare'

export default function AvatarPicker({ value, onChange, size = 52 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))`, gap: 10 }}>
      {AVATARE.map(a => {
        const selected = value === a.key
        return (
          <button
            key={a.key}
            type="button"
            onClick={() => onChange(a.key)}
            title={a.key}
            style={{
              width: size, height: size, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: a.farbe, fontSize: size * 0.55, cursor: 'pointer',
              border: selected ? '3px solid var(--red)' : '3px solid transparent',
              boxShadow: selected ? '0 0 0 2px white, 0 2px 8px rgba(0,0,0,0.25)' : '0 1px 4px rgba(0,0,0,0.15)',
              transform: selected ? 'scale(1.06)' : 'scale(1)',
              transition: 'all 150ms',
            }}
          >
            {a.emoji}
          </button>
        )
      })}
    </div>
  )
}
