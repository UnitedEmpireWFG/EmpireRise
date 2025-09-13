import { useState } from "react"
import { apiFetch } from "../lib/apiFetch"

export default function AdminUsers() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState("member")
  const [msg, setMsg] = useState("")

  async function createUser(e) {
    e.preventDefault()
    setMsg("")
    try {
      const out = await apiFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, password, name, role })
      })
      if (!out.ok) throw new Error(out.error || "create_failed")
      setMsg("User created.")
      setEmail(""); setPassword(""); setName(""); setRole("member")
    } catch (e) {
      setMsg(e.message || "create_failed")
    }
  }

  return (
    <div style={{ padding:16 }}>
      <h2>Admin: Create user</h2>
      <form onSubmit={createUser} style={{ display:"grid", gap:8, maxWidth:360 }}>
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
        <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
        <input placeholder="Name (optional)" value={name} onChange={e=>setName(e.target.value)} />
        <select value={role} onChange={e=>setRole(e.target.value)}>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button className="btn" type="submit">Create</button>
        {msg && <div style={{ marginTop:6 }}>{msg}</div>}
      </form>
    </div>
  )
}
