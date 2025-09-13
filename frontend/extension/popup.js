let running = false;
document.getElementById("start").onclick = async () => {
  running = true;
  document.getElementById("status").textContent = "Running";
  chrome.runtime.sendMessage({ type: "START" });
};
document.getElementById("stop").onclick = async () => {
  running = false;
  document.getElementById("status").textContent = "Stopped";
  chrome.runtime.sendMessage({ type: "STOP" });
};
