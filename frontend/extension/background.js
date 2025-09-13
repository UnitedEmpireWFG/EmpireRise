let timer = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "START") start();
  if (msg.type === "STOP") stop();
});

function start() {
  if (timer) return;
  timer = setInterval(tick, 20_000);
  tick();
}

function stop() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

async function tick() {
  try {
    const r = await fetch("http://localhost:8787/api/outreach/queue");
    const data = await r.json();
    if (!data || !data.message) return;

    // find or open target site tab. simple pass, assumes LinkedIn as first target
    const urlGuess = "https://www.linkedin.com/feed/";
    const tabs = await chrome.tabs.query({ url: "*://www.linkedin.com/*" });
    const tabId = tabs[0]?.id;
    if (!tabId) {
      const newTab = await chrome.tabs.create({ url: urlGuess, active: true });
      await waitMs(4000);
      await pasteToCompose(newTab.id, data);
    } else {
      await chrome.tabs.update(tabId, { active: true });
      await waitMs(2000);
      await pasteToCompose(tabId, data);
    }
  } catch (e) {
    // silent
  }
}

async function pasteToCompose(tabId, data) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (payload) => {
      function tryLinkedIn() {
        // open new message box if available
        const buttons = Array.from(document.querySelectorAll("button, a"));
        const msgBtn = buttons.find(b => /message/i.test(b.textContent || ""));
        if (msgBtn) msgBtn.click();

        const editor = document.querySelector("[contenteditable='true']");
        if (editor) {
          editor.focus();
          const txt = payload.message;
          document.execCommand("insertText", false, txt);
          return true;
        }
        return false;
      }
      // try LI first. other sites can be added later
      return tryLinkedIn();
    },
    args: [data]
  });
}
function waitMs(ms) { return new Promise(r => setTimeout(r, ms)); }
