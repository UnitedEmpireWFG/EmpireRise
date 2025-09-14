import { Link, useLocation } from "react-router-dom"

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/approvals", label: "Approvals" },
  { to: "/queue", label: "Queue" },
  { to: "/leads", label: "Leads" },
  { to: "/settings", label: "Settings" }
]

export default function Navbar() {
  const { pathname } = useLocation()
  const logoUrl = `${import.meta.env.BASE_URL || '/'}ue-logo.png` // in /public

  return (
    <header style={{ background:"#0c0c0c", borderBottom:"1px solid rgba(255,215,0,.25)", padding:"10px 16px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
        {/* Left: brand */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <img src={logoUrl} alt="EmpireRise logo" style={{ height:24 }} />
          <span style={{ fontWeight:"bold", letterSpacing:1, color:"#ffd700" }}>EMPIRE RISE</span>
        </div>

        {/* Center: pills */}
        <nav style={{ display:"flex", gap:10 }}>
          {links.map(l => {
            const active = pathname === l.to
            return (
              <Link
                key={l.to}
                to={l.to}
                style={{
                  padding:"6px 14px",
                  borderRadius:6,
                  textDecoration:"none",
                  border:"1px solid #ffd700",
                  fontWeight:700,
                  background: active ? "#ffd700" : "#0e4d1b",
                  color: active ? "#0c0c0c" : "#ffd700",
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,.25)"
                }}
              >
                {l.label}
              </Link>
            )
          })}
        </nav>

        {/* Right: tagline */}
        <div style={{ fontSize:12, color:"#ffd700", opacity:.9 }}>Powered by A SmartBass</div>
      </div>
    </header>
  )
}