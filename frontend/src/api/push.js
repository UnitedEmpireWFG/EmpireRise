import { api } from "./client";

export async function getVapidKey() {
  const r = await api("/api/push/pubkey");
  return r?.key || "";
}

export async function subscribePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push not supported");
  }
  const reg = await navigator.serviceWorker.ready;
  const key = await getVapidKey();
  if (!key) throw new Error("Server missing VAPID key");
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key)
  });
  await api("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub)
  });
  return true;
}

// helper
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i=0; i<rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}