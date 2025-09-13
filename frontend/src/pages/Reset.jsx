import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supa } from "../lib/supa";

export default function Reset() {
  const nav = useNavigate();
  const [status, setStatus] = useState("checking"); // "checking" | "ready" | "invalid" | "saving"
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // Supabase v2 automatically handles the recovery link and sets a special session.
        // We just verify we have *some* session so updateUser will succeed.
        const { data, error } = await supa.auth.getSession();

        if (!mounted) return;

        if (error) {
          setMsg(error.message || "Could not read session.");
          setStatus("invalid");
          return;
        }

        if (data && data.session && data.session.access_token) {
          setStatus("ready");
        } else {
          // Even if we didn’t catch the session, allow the form and let the API error speak.
          setMsg("If you just opened a reset link, try the form below. If it fails, request a new link.");
          setStatus("ready");
        }
      } catch (e) {
        if (!mounted) return;
        setMsg(e.message || "Unexpected error while checking reset link.");
        setStatus("ready");
      }
    })();

    return () => { mounted = false; };
  }, []);

  async function submitNewPassword(e) {
    e.preventDefault();
    setMsg("");

    if (!password || password.length < 8) {
      setMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setMsg("Passwords do not match.");
      return;
    }

    setStatus("saving");
    try {
      const { error } = await supa.auth.updateUser({ password });
      if (error) throw error;

      setMsg("Password updated. Redirecting to login…");
      setTimeout(() => nav("/login"), 900);
    } catch (e) {
      setMsg(e.message || "Failed to update password. The reset link may be invalid/expired.");
      setStatus("ready");
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" style={{ width: 360, padding: 20, borderRadius: 12 }}>
        <h2 style={{ marginTop: 0 }}>Reset Password</h2>

        {status === "checking" ? (
          <p>Validating your reset link…</p>
        ) : (
          <>
            {msg ? <div style={{ marginBottom: 10, color: "salmon" }}>{msg}</div> : null}
            <form onSubmit={submitNewPassword}>
              <label style={{ display: "block", marginBottom: 8 }}>
                New password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: "100%", marginTop: 4 }}
                  minLength={8}
                  required
                />
              </label>
              <label style={{ display: "block", marginBottom: 12 }}>
                Confirm new password
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={{ width: "100%", marginTop: 4 }}
                  minLength={8}
                  required
                />
              </label>

              <button className="btn" type="submit" disabled={status === "saving"} style={{ width: "100%" }}>
                {status === "saving" ? "Saving…" : "Update password"}
              </button>
            </form>

            <div style={{ marginTop: 12, textAlign: "center" }}>
              <a className="btn" href="/login">Back to Login</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
