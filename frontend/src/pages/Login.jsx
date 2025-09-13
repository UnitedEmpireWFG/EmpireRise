// frontend/src/pages/Login.jsx
import { useState } from "react";
import { supa } from "../lib/supa";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function doLogin(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const { error } = await supa.auth.signInWithPassword({ email, password });
      if (error) throw error;
      nav("/");
    } catch (e) {
      setMsg(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(e) {
    e.preventDefault();
    setMsg("");
    if (!email) {
      setMsg("Enter your email first");
      return;
    }
    try {
      const { error } = await supa.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset`,
      });
      if (error) throw error;
      setMsg("Password reset email sent. Check your inbox.");
    } catch (e) {
      setMsg(e.message || "Reset failed");
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
      <form
        onSubmit={doLogin}
        style={{ width: 320, background: "#111", padding: 20, borderRadius: 8 }}
      >
        <h2 style={{ marginTop: 0 }}>Sign In</h2>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ width: "100%", marginBottom: 12 }}
        />
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: "100%", marginBottom: 12 }}
        />

        <button type="submit" className="btn" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Logging in..." : "Login"}
        </button>

        <div style={{ marginTop: 12, textAlign: "center" }}>
          <a href="#" onClick={sendReset} style={{ color: "#FFD700" }}>
            Forgot password?
          </a>
        </div>

        {msg && (
          <div style={{ marginTop: 12, fontSize: 14, color: "salmon" }}>{msg}</div>
        )}
      </form>
    </div>
  );
}
