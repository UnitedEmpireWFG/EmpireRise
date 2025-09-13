import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { supa } from "../lib/supa";

// Put your logo at: frontend/public/logo.png  (or change src below)
const LOGO_SRC = "/ue-logo.png";

const links = [
  { to: "/", label: "Dashboard" },
  { to: "/approvals", label: "Approvals" },
  { to: "/queue", label: "Queue" },
  { to: "/leads", label: "Leads" },
  { to: "/settings", label: "Settings" },
];

export default function Navbar() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (p) => (loc.pathname === p ? "#0a0" : "transparent");

  const logout = async () => {
    try { await supa.auth.signOut(); } catch {}
  };

  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "#0c0c0c", borderBottom: "1px solid #333" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px"
      }}>
        {/* Brand (left) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <img
            src={LOGO_SRC}
            alt="Empire Rise"
            width={28}
            height={28}
            style={{ display: "block", objectFit: "contain", borderRadius: 4 }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <div
            style={{
              color: "#ffd700",
              fontWeight: 700,
              letterSpacing: 1,
              // roman/serif feel; if you already load your brand font, this will fall back gracefully
              fontFamily: '"Cinzel","Trajan Pro","Times New Roman",serif',
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            EMPIRE RISE
          </div>
        </div>

        {/* Pills (center/left) */}
        <nav className="nav-desktop" style={{ display: "none" }}>
          {links.map(l => (
            <Link
              key={l.to}
              to={l.to}
              style={{
                display: "inline-block",
                padding: "8px 12px",
                marginRight: 8,
                border: "1px solid #665300",
                borderRadius: 10,
                color: "#ffd700",
                textDecoration: "none",
                background: isActive(l.to)
              }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right: Powered by */}
        <div style={{ justifySelf: "end", color: "#9c8f5a", fontSize: 12 }}>
          Powered by <strong style={{ color: "#ffd700" }}>A SmartBass</strong>
        </div>

        {/* Mobile hamburger (hidden on desktop) */}
        <button
          onClick={() => setOpen(!open)}
          aria-label="Menu"
          className="hamburger"
          style={{
            gridColumn: "1 / 2",
            justifySelf: "start",
            background: "transparent",
            border: "1px solid #444",
            color: "#ffd700",
            padding: "8px",
            borderRadius: 6,
            display: "inline-flex"
          }}
        >
          ☰
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="nav-mobile" style={{ borderTop: "1px solid #333", background: "#0c0c0c", padding: 10 }}>
          {links.map(l => (
            <div key={l.to} style={{ marginBottom: 8 }}>
              <Link
                to={l.to}
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #665300",
                  color: "#ffd700",
                  textDecoration: "none",
                  background: isActive(l.to)
                }}
              >
                {l.label}
              </Link>
            </div>
          ))}
          {/* Mobile-only logout so desktop stays clean like your screenshot */}
          <button
            onClick={() => { setOpen(false); logout(); }}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #2f6b2f",
              background: "#0a380a",
              color: "#d6ffd6"
            }}
          >
            Logout
          </button>
        </div>
      )}

      {/* CSS: show desktop pills & hide hamburger on wide screens */}
      <style>{`
        @media (min-width: 900px) {
          .nav-desktop { display: block !important; }
          .nav-mobile { display: none !important; }
          .hamburger { display: none !important; }
        }
      `}</style>
    </header>
  );
}