(function () {
  "use strict";

  const app = document.getElementById("app");
  const chat = document.getElementById("chat");
  const form = document.getElementById("composer");
  const promptEl = document.getElementById("prompt");
  const sendBtn = document.getElementById("sendBtn");
  const sendLabel = document.getElementById("sendLabel");
  const clearBtn = document.getElementById("clearBtn");
  const banner = document.getElementById("offlineBanner");
  const statusEl = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const installBtn = document.getElementById("installBtn");
  const quickReplies = document.getElementById("quickReplies");
  const core = document.getElementById("core");
  const slotLarge = document.getElementById("coreSlotLarge");
  const slotSmall = document.getElementById("coreSlotSmall");

  const history = []; // {role: "student" | "assistant", text}
  let busy = false;

  /* ---------- Core state (tied to the real request lifecycle) ---------- */

  const STATUS_LABELS = {
    idle: "ONLINE",
    offline: "OFFLINE",
    thinking: "THINKING",
    responding: "RESPONDING",
    error: "ERROR",
  };
  let transient = null; // "thinking" | "responding" | "error" | null
  let transientTimer = null;

  function currentState() {
    if (!navigator.onLine) return "offline";
    return transient || "idle";
  }

  function render() {
    const state = currentState();
    core.dataset.state = state;
    statusEl.dataset.state = state;
    statusText.textContent = STATUS_LABELS[state];

    const offline = !navigator.onLine;
    banner.hidden = !offline;
    sendBtn.disabled = busy || offline;
    sendLabel.textContent = busy ? "Thinking" : "Send";
    document.querySelectorAll("[data-prompt]").forEach((b) => (b.disabled = busy || offline));
  }

  function setTransient(state, ms) {
    clearTimeout(transientTimer);
    transient = state;
    if (ms) {
      transientTimer = setTimeout(() => {
        transient = null;
        render();
      }, ms);
    }
    render();
  }

  window.addEventListener("online", render);
  window.addEventListener("offline", render);

  /* ---------- Welcome <-> chat view (same core element moves) ---------- */

  function setView(view) {
    app.dataset.view = view;
    const compact = view === "chat";
    (compact ? slotSmall : slotLarge).appendChild(core);
    core.classList.toggle("core--compact", compact);
  }

  /* ---------- Core decoration (markers + particles) ---------- */

  const SVG_NS = "http://www.w3.org/2000/svg";

  function buildMarkers() {
    const group = document.getElementById("coreMarkers");
    const arcs = [[145, 215], [-38, 48]]; // degrees, left side and right side
    let n = 0;
    arcs.forEach(([from, to]) => {
      const steps = 7;
      for (let i = 0; i <= steps; i++) {
        const deg = from + ((to - from) * i) / steps;
        const rad = (deg * Math.PI) / 180;
        const dot = document.createElementNS(SVG_NS, "ellipse");
        dot.setAttribute("cx", (200 + 172 * Math.cos(rad)).toFixed(1));
        dot.setAttribute("cy", (190 + 124 * Math.sin(rad)).toFixed(1));
        dot.setAttribute("rx", "3.4");
        dot.setAttribute("ry", "2.2");
        dot.setAttribute("fill", n % 3 === 0 ? "#BFF6FF" : "#FFFFFF");
        dot.style.animationDelay = (-(n * 0.37) % 3.4).toFixed(2) + "s";
        group.appendChild(dot);
        n++;
      }
    });
  }

  function buildParticles() {
    const group = document.getElementById("coreParticles");
    for (let i = 0; i < 18; i++) {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", (20 + Math.random() * 360).toFixed(1));
      c.setAttribute("cy", (20 + Math.random() * 360).toFixed(1));
      c.setAttribute("r", (0.8 + Math.random() * 1.4).toFixed(1));
      c.setAttribute("fill", "#BFEFFF");
      c.setAttribute("opacity", (0.35 + Math.random() * 0.5).toFixed(2));
      c.style.setProperty("--dx", (Math.random() * 24 - 12).toFixed(1) + "px");
      c.style.setProperty("--dy", (-8 - Math.random() * 20).toFixed(1) + "px");
      c.style.setProperty("--d", (9 + Math.random() * 9).toFixed(1) + "s");
      c.style.animationDelay = (-Math.random() * 10).toFixed(1) + "s";
      group.appendChild(c);
    }
  }

  /* ---------- Helpers ---------- */

  function getCookie(name) {
    const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : "";
  }

  function timeNow() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Small, safe markdown: escapes first, then supports code blocks, headings, **bold**, `code`, lists.
  function renderBlocks(text) {
    const lines = escapeHtml(text).split("\n");
    const out = [];
    let list = null;

    const inline = (s) =>
      s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
    const closeList = () => {
      if (list) { out.push("</" + list + ">"); list = null; }
    };

    lines.forEach((raw) => {
      const line = raw.trim();
      const heading = line.match(/^#{1,6}\s+(.*)/);
      const bullet = line.match(/^[*-]\s+(.*)/);
      const numbered = line.match(/^\d+[.)]\s+(.*)/);

      if (bullet || numbered) {
        const type = bullet ? "ul" : "ol";
        if (list !== type) { closeList(); out.push("<" + type + ">"); list = type; }
        out.push("<li>" + inline((bullet || numbered)[1]) + "</li>");
      } else if (heading) {
        closeList();
        out.push("<p><strong>" + inline(heading[1]) + "</strong></p>");
      } else if (line === "") {
        closeList();
      } else {
        closeList();
        out.push("<p>" + inline(line) + "</p>");
      }
    });
    closeList();
    return out.join("");
  }

  function renderMarkdown(text) {
    return text
      .split("```")
      .map((part, i) =>
        i % 2
          ? "<pre><code>" + escapeHtml(part.replace(/^[a-zA-Z0-9_+-]*\n/, "")) + "</code></pre>"
          : renderBlocks(part)
      )
      .join("");
  }

  const MARK_SVG =
    '<svg class="msg-mark" viewBox="0 0 12 12" aria-hidden="true"><polygon points="6,0.8 11.2,6 6,11.2 0.8,6" fill="none" stroke="currentColor" stroke-width="1.2"/><ellipse cx="6" cy="6" rx="2.2" ry="1" fill="currentColor"/></svg>';

  function addMessage(kind, text, opts) {
    opts = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "msg " + kind;

    const meta = document.createElement("div");
    meta.className = "msg-meta";
    if (kind === "assistant") {
      meta.innerHTML = MARK_SVG + "<span>ORDIS</span>";
    } else {
      meta.insertAdjacentHTML("beforeend", "<span>You</span>");
    }
    const time = document.createElement("span");
    time.textContent = timeNow();
    meta.appendChild(time);

    const body = document.createElement("div");
    body.className = "msg-body";
    if (opts.html) body.innerHTML = opts.html;
    else if (kind === "assistant") body.innerHTML = renderMarkdown(text);
    else body.textContent = text;

    wrap.appendChild(meta);
    wrap.appendChild(body);
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
    return wrap;
  }

  function addError(text) {
    addMessage("assistant", text).classList.add("error");
  }

  function autosize() {
    promptEl.style.height = "auto";
    promptEl.style.height = Math.min(promptEl.scrollHeight, 140) + "px";
  }

  /* ---------- Sending prompts ---------- */

  async function ask(text) {
    text = text.trim();
    if (!text || busy) return;
    if (!navigator.onLine) { render(); return; }

    setView("chat");
    addMessage("student", text);
    promptEl.value = "";
    autosize();

    busy = true;
    setTransient("thinking");

    const typing = addMessage("assistant", "", {
      html: '<span class="typing" aria-label="ORDIS is thinking"><span></span><span></span><span></span></span>',
    });

    let failed = false;
    try {
      const response = await fetch("/api/chat/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ prompt: text, history: history.slice(-20) }),
      });

      let data = {};
      try { data = await response.json(); } catch (e) { /* non-JSON error */ }
      typing.remove();

      if (!response.ok || !data.reply) {
        failed = true;
        addError(data.error || "Something went wrong. Please try again.");
      } else {
        addMessage("assistant", data.reply);
        history.push({ role: "student", text: text });
        history.push({ role: "assistant", text: data.reply });
      }
    } catch (err) {
      failed = true;
      typing.remove();
      addError(
        navigator.onLine
          ? "Could not reach the server. Please try again."
          : "You're offline. Reconnect to ask a question."
      );
    } finally {
      busy = false;
      if (failed) setTransient("error", 4000);
      else setTransient("responding", 2200);
      promptEl.focus();
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    ask(promptEl.value);
  });

  // Enter sends, Shift+Enter makes a new line.
  promptEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask(promptEl.value);
    }
  });
  promptEl.addEventListener("input", autosize);

  // Suggested prompt cards and quick replies
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-prompt]");
    if (btn) ask(btn.dataset.prompt);
  });

  clearBtn.addEventListener("click", () => {
    if (busy) return;
    chat.innerHTML = "";
    history.length = 0;
    setTransient(null);
    setView("welcome");
    promptEl.focus();
  });

  /* ---------- PWA: service worker + install button ---------- */

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch((err) => {
        console.warn("Service worker registration failed:", err);
      });
    });
  }

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  window.addEventListener("appinstalled", () => {
    installBtn.hidden = true;
  });

  /* ---------- Start ---------- */
  buildMarkers();
  buildParticles();
  setView("welcome");
  render();
})();
