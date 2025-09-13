import { NavLink } from "react-router-dom";

export default function TopNav(){
  const tabs = [
    { to: "/", label: "Dashboard" },
    { to: "/approvals", label: "Approvals" },
    { to: "/queue", label: "Queue" },
    { to: "/leads", label: "Leads" },
    { to: "/settings", label: "Settings" }
  ];
  return (
    <div className="topnav">
      <div className="container topnav-inner">
        <div className="brand">
          <img src="/united-empire-logo.png" alt="United Empire" />
          <span>EmpireRise</span>
        </div>
        <div className="tabs">
          {tabs.map(t => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) => "tab"+(isActive ? " active":"")}
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}