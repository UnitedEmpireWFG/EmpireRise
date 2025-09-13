import { useState } from "react"
import { NavLink } from "react-router-dom"

const linksMain = [
  { to: "/", label: "Dashboard" },
  { to: "/approvals", label: "Approvals" },
  { to: "/queue", label: "Queue" },
  { to: "/leads", label: "Leads" },
  { to: "/prospects", label: "Prospects" },
  { to: "/settings", label: "Settings" }
]
const linksMore = [
  { to: "/assist-li", label: "Assist LI" },
  { to: "/li-batch", label: "LI Batch" }
]

export default function Nav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="topbar">
      <div className="brand">EMPIRE RISE</div>
      <button className="hamburger" aria-label="Menu" onClick={() => setOpen(v => !v)}>☰</button>
      <nav className={`nav ${open ? "open" : ""}`}>
        {linksMain.map(l => (
          <NavLink key={l.to} to={l.to} className={({isActive}) => isActive ? "active" : ""}>{l.label}</NavLink>
        ))}
        <div className="more">
          <span>More ▾</span>
          <div className="dropdown">
            {linksMore.map(l => (
              <NavLink key={l.to} to={l.to}>{l.label}</NavLink>
            ))}
          </div>
        </div>
      </nav>
    </header>
  )
}
