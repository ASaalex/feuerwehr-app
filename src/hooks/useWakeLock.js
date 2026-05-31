import { useEffect, useRef } from 'react'

export function useWakeLock() {
  const lockRef = useRef(null)

  useEffect(() => {
    let active = true

    async function acquire() {
      if (!('wakeLock' in navigator)) return
      try {
        lockRef.current = await navigator.wakeLock.request('screen')
        lockRef.current.addEventListener('release', () => {
          // Automatisch neu anfordern wenn Seite wieder sichtbar
          if (active && document.visibilityState === 'visible') acquire()
        })
      } catch {}
    }

    function onVisible() {
      if (document.visibilityState === 'visible') acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
      lockRef.current?.release().catch(() => {})
    }
  }, [])
}
