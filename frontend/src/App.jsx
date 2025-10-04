import { Routes, Route, Navigate } from 'react-router-dom'
import { useSession, AuthBanner } from './components/AuthGate'
import Navbar from './components/Navbar'

// pages
import Dashboard from './pages/Dashboard'
import Approvals from './pages/Approvals'
import Queue from './pages/Queue'
import Leads from './pages/Leads'
import Settings from './pages/Settings.jsx'
import Login from './pages/Login'   // your existing Login.jsx

export default function App() {
  const { ready, session } = useSession()
  if (!ready) return <div style={{ padding:24, color:'#ffd700' }}>Loading…</div>

  const Private = ({ children }) => (session ? children : <Navigate to="/login" replace />)

  return (
    <div style={{ minHeight:'100vh', background:'#0c0c0c', color:'#ffd700' }}>
      <Navbar />
      <AuthBanner />
      <main style={{ padding:12 }}>
        <Routes>
          {/* public */}
          <Route path="/login" element={<Login />} />
          {/* protected */}
          <Route path="/" element={<Private><Dashboard/></Private>} />
          <Route path="/approvals" element={<Private><Approvals/></Private>} />
          <Route path="/queue" element={<Private><Queue/></Private>} />
          <Route path="/leads" element={<Private><Leads/></Private>} />
          <Route path="/settings" element={<Private><Settings/></Private>} />
          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}