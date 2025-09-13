import { useEffect, useState } from 'react'
import { supa } from '../lib/supa'

export function useSession() {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState(null)

  useEffect(() => {
    let unsub = () => {}
    ;(async () => {
      const { data } = await supa.auth.getSession()
      setSession(data.session ?? null)
      setReady(true)
      const { data: sub } = supa.auth.onAuthStateChange((_evt, sess) => setSession(sess ?? null))
      unsub = () => sub.subscription.unsubscribe()
    })()
    return () => unsub()
  }, [])

  return { ready, session }
}

export function AuthBanner() {
  const [unauth, setUnauth] = useState(false)
  useEffect(() => {
    const on401 = () => setUnauth(true)
    window.addEventListener('er-unauthorized', on401)
    return () => window.removeEventListener('er-unauthorized', on401)
  }, [])
  if (!unauth) return null
  return (
    <div className="card" style={{ margin:12, padding:12, borderColor:'salmon' }}>
      <strong>Not signed in.</strong> Please sign in to view data.
    </div>
  )
}