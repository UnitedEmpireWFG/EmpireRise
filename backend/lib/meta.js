import fetch from "node-fetch";

export async function getPageToken(userToken, pageId) {
  const url = `https://graph.facebook.com/v19.0/${pageId}?fields=access_token&access_token=${userToken}`;
  const r = await fetch(url);
  const out = await r.json();
  if (!r.ok || !out.access_token) {
    throw new Error(`Failed to get page token: ${JSON.stringify(out)}`);
  }
  return out.access_token;
}

export async function fbPagePost(pageId, pageToken, message) {
  const url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
  const body = new URLSearchParams({ message, access_token: pageToken });
  const r = await fetch(url, { method: "POST", body });
  const out = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(out));
  return out;
}

export async function igCreateMedia(igId, pageToken, imageUrl, caption = "") {
  const url = `https://graph.facebook.com/v19.0/${igId}/media`;
  const body = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: pageToken
  });
  const r = await fetch(url, { method: "POST", body });
  const out = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(out));
  return out; // returns { id: creation_id }
}

export async function igPublish(igId, pageToken, creationId) {
  const url = `https://graph.facebook.com/v19.0/${igId}/media_publish`;
  const body = new URLSearchParams({
    creation_id: creationId,
    access_token: pageToken
  });
  const r = await fetch(url, { method: "POST", body });
  const out = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(out));
  return out;
}

