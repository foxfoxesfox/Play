import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { InkDefs } from './Card'
import { Home } from './Home'
import { TablePage } from './Table'
import './styles.css'

function App() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const onPop = () => setPath(location.pathname)
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  const go = (p: string) => { history.pushState(null, '', p); setPath(p) }
  const table = path.match(/^\/t\/([a-z]{3}-\d{6})\/?$/)
  useEffect(() => { document.title = table ? `play · ${table[1]}` : 'play' }, [table?.[1]])
  return (
    <>
      <InkDefs />
      {table ? <TablePage key={table[1]} code={table[1]} /> : <Home go={go} />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
