// frontend/src/components/Navbar.jsx
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

  return (
    <header
      style={{
        background: "#0c0c0c",
        borderBottom: "1px solid rgba(255,215,0,.25)",
        padding: "10px 20px"
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        {/* Left spacer (keeps pills centered) */}
        <div style={{ width: 100 }} />

        {/* Centered nav pills */}
        <nav style={{ display: "flex", gap: 12 }}>
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                textDecoration: "none",
                color: pathname === l.to ? "#0c0c0c" : "#ffd700",
                background: pathname === l.to ? "#ffd700" : "transparent",
                border: "1px solid #ffd700",
                fontWeight: "bold",
                transition: "0.2s"
              }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right side logo + text + tagline */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: "bold", fontSize: 16, color: "#ffd700" }}>
            EMPIRE RISE
          </span>

          {/* From /public — no import needed */}
          <img src="/ue-logo.png" alt="EmpireRise logo" style={{ height: 28 }} />

          <span style={{ fontSize: 12, color: "#ffd700", opacity: 0.8 }}>
            Powered by A SmartBass
          </span>
        </div>
      </div>
    </header>
  )
}