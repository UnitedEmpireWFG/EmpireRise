// frontend/src/components/Navbar.jsx
import { Link, useLocation } from "react-router-dom"
import logo from "/ue-logo.png"   // ✅ since it's in /public

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/approvals", label: "Approvals" },
  { to: "/queue", label: "Queue" },
  { to: "/leads", label: "Leads" },
  { to: "/settings", label: "Settings" }
]

function pillStyle(isActive) {
  const base = {
    padding: "6px 14px",
    borderRadius: 6,
    textDecoration: "none",
    fontWeight: 700,
    display: "inline-block",
    transition: "background .15s ease, color .15s ease, border-color .15s ease",
  }
  return isActive
    ? { ...base, background: "#ffd700", color: "#0c0c0c", border: "1px solid #228B22" } // active = gold fill
    : { ...base, background: "#228B22", color: "#ffd700", border: "1px solid #ffd700" } // inactive = green fill
}

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <header style={{
      background: "#0c0c0c",
      borderBottom: "1px solid rgba(255,215,0,.25)",
      padding: "10px 20px"
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        {/* Left side logo + Empire Rise */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={logo} alt="UE Logo" style={{ height: 28 }} />
          <span style={{ fontWeight: "bold", fontSize: 18, color: "#ffd700" }}>
            EMPIRE RISE
          </span>
        </div>

        {/* Center nav pills */}
        <nav style={{ display: "flex", gap: 12 }}>
          {links.map(l => (
            <Link
              key={l.to}
              to={l.to}
              style={pillStyle(pathname === l.to)}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right side tagline */}
        <div style={{ fontSize: 12, color: "#ffd700", opacity: 0.8 }}>
          Powered by A SmartBass
        </div>
      </div>
    </header>
  )
}