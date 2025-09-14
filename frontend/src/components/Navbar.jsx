import { Link, useLocation, useNavigate } from "react-router-dom"
import { supa } from "../lib/supa"  // uses your existing Supabase client

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/approvals", label: "Approvals" },
  { to: "/queue", label: "Queue" },
  { to: "/leads", label: "Leads" },
  { to: "/settings", label: "Settings" }
]

export default function Navbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  // Your logo lives in /public as ue-logo.png.PNG
  const logoUrl = `${import.meta.env.BASE_URL || '/'}ue-logo.png.PNG`

  // inactive = green fill + gold text; active = gold fill + dark text
  const pill = (active) => ({
    padding: "6px 14px",
    borderRadius: 6,
    textDecoration: "none",
    border: "1px solid #ffd700",
    fontWeight: 700,
    background: active ? "#ffd700" : "#0e4d1b",
    color: active ? "#0c0c0c" : "#ffd700",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.25)"
  })

  const handleLogout = async () => {
    try { await supa.auth.signOut() } catch {}
    // clear any local/session storage just in case
    localStorage.removeItem("er-auth")
    sessionStorage.clear()
    navigate("/login")
  }

  return (
    <header style={{ background:"#0c0c0c", borderBottom:"1px solid rgba(255,215,0,.25)", padding:"10px 16px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
        {/* Left: brand */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <img src={logoUrl} alt="EmpireRise logo" style={{ height:24 }} />
          <span style={{
            fontFamily: "'Cinzel', serif",
            fontWeight: 700,
            letterSpacing: 1,
            color: "#ffd700",
            fontSize: 20
          }}>
            EmpireRise
          </span>
        </div>

        {/* Center: pills */}
        <nav style={{ display:"flex", gap:10 }}>
          {links.map(l => {
            const active = pathname === l.to
            return (
              <Link key={l.to} to={l.to} style={pill(active)}>
                {l.label}
              </Link>
            )
          })}
        </nav>

        {/* Right: tagline + logout */}
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ fontSize:12, color:"#ffd700", opacity:.9 }}>
            Powered by A SmartBass
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding:"6px 12px",
              border:"1px solid #ffd700",
              borderRadius:6,
              background:"#0e4d1b",
              color:"#ffd700",
              fontWeight:700,
              cursor:"pointer"
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}