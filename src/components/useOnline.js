import { useEffect, useState } from 'react'

// Whether the browser thinks it has a network.
//
// It lives here rather than in lib because it is a hook, and lib stays free
// of React. `navigator.onLine` is a coarse signal — it knows there is an
// interface, not that WaniKani is reachable — so it is used only to say so
// plainly, never to decide that an answer failed. That decision belongs to
// the submitter, which retries.
export default function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  return online
}
