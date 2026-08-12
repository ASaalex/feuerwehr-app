import { getAvatar } from '../data/avatare'

// Einheitliche Avatar-Darstellung: hochgeladenes Profilbild > Emoji-Avatar (Gast) > Initialen
export default function Avatar({ url, avatarKey, name, size = 40, style }) {
  const base = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', userSelect: 'none', ...style,
  }

  if (url) {
    return <img src={url} alt={name ?? 'Avatar'} style={{ ...base, objectFit: 'cover' }} />
  }

  if (avatarKey) {
    const a = getAvatar(avatarKey)
    return (
      <div style={{ ...base, background: a.farbe, fontSize: size * 0.55 }} title={name}>
        {a.emoji}
      </div>
    )
  }

  const initials = (name ?? '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <div style={{ ...base, background: 'var(--red)', color: 'white', fontSize: size * 0.4, fontWeight: 600 }}>
      {initials}
    </div>
  )
}
