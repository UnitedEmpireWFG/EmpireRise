// frontend/src/pages/AssistLI.jsx
import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { apiFetch } from "../lib/apiFetch"

export default function AssistLI() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let url = "/api/assist/li"
    if (id) url += `/${id}`
    apiFetch(url)
      .then(setData)
      .catch(() => setData({}))
  }, [id])

  const copy = async () => {
    const text = data?.text || ""
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // ignore clipboard errors
    }
  }

  const markSent = async () => {
    if (!id) return
    try {
      await apiFetch(`/api/assist/li/${id}/sent`, { method: "POST" })
      alert("Marked sent.")
    } catch (e) {
      alert("Failed to mark sent: " + e.message)
    }
  }

  const text = data?.text || ""
  const deepLink = data?.link || "https://www.linkedin.com/messaging/"

  return (
    <div className="card" style={{ padding: 12, display: "grid", gap: 12 }}>
      <div style={{ fontWeight: 800 }}>LinkedIn Assist</div>
      <textarea readOnly rows={8} value={text} style={{ width: "100%" }} />
      <div style={{ display: "flex", gap: 8 }}>
        <a className="btn" href={deepLink} target="_blank" rel="noreferrer">Open LinkedIn</a>
        <button className="btn" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        {id && <button className="btn" onClick={markSent}>Mark sent</button>}
      </div>
    </div>
  )
}
