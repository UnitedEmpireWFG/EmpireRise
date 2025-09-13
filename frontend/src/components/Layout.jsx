import { Link, NavLink, Outlet } from "react-router-dom";
import "../styles/base.css";

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        "navitem" + (isActive ? " active" : "")
      }
      style={({ isActive }) => ({
        padding: "10px 12px",
        borderRadius: 8,
        color: isActive ? "#000" : "var(--text)",
        background: isActive ? "var(--gold)" : "transparent"
      })}
    >
      {children}
    </NavLink>
  );
}

export default function Layout() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", height: "100%" }}>
      <aside style={{ borderRight: "1px solid #1f1f26", padding: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 22, color: "var(--gold)", marginBottom: 18 }}>
          EmpireRise
        </div>
        <div className="grid" style={{ gap: 6 }}>
          <NavItem to="/">Dashboard</NavItem>
          <NavItem to="/approvals">Approvals</NavItem>
          <NavItem to="/queue">Queue</NavItem>
          <NavItem to="/leads">Leads</NavItem>
          <NavItem to="/settings">Settings</NavItem>
        </div>
        <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, color: "var(--muted)" }}>
          <div>EmpireRise - Powered By A SmartBass</div>
        </div>
      </aside>
      <main style={{ padding: 18, overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}