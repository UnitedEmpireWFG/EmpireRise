export const API_BASE =
  (typeof window !== "undefined" && window.location.port === "5173")
    ? "http://127.0.0.1:8787"
    : "";