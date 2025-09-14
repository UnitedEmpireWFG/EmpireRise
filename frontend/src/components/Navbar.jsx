// frontend/src/components/Navbar.jsx
import { Link, useLocation } from 'react-router-dom'
import { supa } from '../lib/supa'

const links = [
  { to: '/',          label: 'Dashboard' },
  { to: '/approvals', label: 'Approvals' },
  { to: '/queue',     label: 'Queue' },
  { to: '/leads',     label: 'Leads' },
  { to: '/settings',  label: 'Settings' },
]

export default function Navbar() {
  const { pathname } = useLocation()

  const Pill = ({ to, label }) => {
    const active = pathname === to
    // Inactive: green fill, gold text + gold border
    // Active: gold fill, dark text + gold border (reverse)
    const base = {
      padding: '6px 14px',
      borderRadius: 6,
      textDecoration: 'none',
      fontWeight: 700,
      border: '1px solid #ffd700',
      transition: '0.15s ease-in-out',
    }
    const style = active
      ? { ...base, background: '#ffd700', color: '#0c0c0c' }
      : { ...base, background: '#0c6133', color: '#ffd700' }
    return <Link to={to} style={style}>{label}</Link>
  }

  const logout = async () => { await supa.auth.signOut(); location.assign('/login') }

  return (
    <header style={{
      background: '#0c0c0c',
      borderBottom: '1px solid rgba(255,215,0,.25)',
      padding: '10px 16px',
      position: 'sticky', top: 0, zIndex: 50
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        gap: 12
      }}>
        {/* LEFT: brand */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src={'/ue-logo.png.PNG'} alt="EmpireRise logo" style={{ height: 26 }} />
          <span style={{ fontWeight: 800, letterSpacing: .5, color:'#ffd700' }}>EMPIRE RISE</span>
        </div>

        {/* CENTER: pills */}
        <nav style={{ display:'flex', gap:12, justifyContent:'center' }}>
          {links.map(l => <Pill key={l.to} {...l} />)}
        </nav>

        {/* RIGHT: Powered by + Logout */}
        <div style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'flex-end' }}>
          <span style={{ fontSize:12, color:'#ffd700', opacity:.85 }}>Powered by A SmartBass</span>
          <button
            onClick={logout}
            style={{
              padding:'6px 12px',
              borderRadius: 6,
              border: '1px solid #ffd700',
              background: '#0c6133',
              color: '#ffd700',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}