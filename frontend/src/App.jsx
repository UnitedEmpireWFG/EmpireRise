import { Routes, Route, Navigate } from 'react-router-dom'
import { useSession, AuthBanner } from './components/AuthGate'

// pages
import Dashboard from './pages/Dashboard'
import Approvals from './pages/Approvals'
import Queue from './pages/Queue'
import Leads from './pages/Leads'
import AssistLI from './pages/AssistLI'
import Login from './pages/Login'          // ✅ you use Login.jsx

// navbar
import Navbar from './components/Navbar'

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
          <Route path="/assist-li" element={<Private><AssistLI/></Private>} />
          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
          <Route path="/settings" element={<Settings/>} />
        </Routes>
      </main>
    </div>
  )
}