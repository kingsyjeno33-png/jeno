/* EduGenie front end – vanilla JavaScript, no frameworks. */
"use strict";

/* ------------------------------------------------------------------ *
 * Task configuration. Each task maps to one FastAPI endpoint.
 * ------------------------------------------------------------------ */
const TASKS = {
  qa: {
    endpoint: "/qa", key: "answer", max: 1000, rows: 4,
    pageTitle: "What do you want to know?",
    pageHint: "Ask anything you are studying and get a short, clear answer.",
    title: "Ask a question", hint: "Get a short, clear answer with an example when it helps.",
    placeholder: "Ask your question here...", resultTitle: "Answer", loading: "Finding the best answer...",
    examples: ["What is photosynthesis?", "Why is the sky blue?", "What causes inflation?"],
  },
  explain: {
    endpoint: "/explain", key: "explanation", max: 300, rows: 3,
    pageTitle: "Which idea is confusing you?",
    pageHint: "Enter a concept and EduGenie will break it down in plain language.",
    title: "Explain a topic", hint: "You get a definition, main points, an easy example and a short summary.",
    placeholder: "Enter a topic you want to understand...", resultTitle: "Explanation", loading: "Breaking it down simply...",
    examples: ["Object Oriented Programming", "Explain inheritance in OOP", "How does a neural network learn?"],
  },
  quiz: {
    endpoint: "/quiz", key: "quiz", max: 8000, rows: 7,
    pageTitle: "Ready to test yourself?",
    pageHint: "Give EduGenie a topic or paste your notes to get a 3-question quiz.",
    title: "Generate a quiz", hint: "Answer each question, check it, and see your score at the end.",
    placeholder: "Paste a topic or passage to generate a quiz...", resultTitle: "Quiz", loading: "Writing your quiz...",
    examples: ["Photosynthesis", "The French Revolution", "Basic SQL joins"],
  },
  summarize: {
    endpoint: "/summarize", key: "summary", max: 20000, rows: 9,
    pageTitle: "Turn long notes into a quick read.",
    pageHint: "Paste a chapter, article or lecture notes and get the key points.",
    title: "Summarize text", hint: "The summary keeps the important facts and adds nothing new.",
    placeholder: "Paste the text you want to summarize...", resultTitle: "Summary", loading: "Reading and summarizing...",
    examples: [],
  },
  path: {
    endpoint: "/learn/recommendations", key: "learning_path", max: 200, rows: 0,
    pageTitle: "Where do you want to get to?",
    pageHint: "Choose a subject and your level to get a roadmap from beginner to advanced.",
    title: "Build a learning path", hint: "Pick a topic and your current level. You get a full roadmap with practice and a timeline.",
    placeholder: "e.g. Python, SQL, Data Structures", resultTitle: "Your learning path", loading: "Planning your roadmap...",
    examples: ["Python", "SQL", "Data Structures", "Machine Learning", "Mathematics", "Biology"],
  },
};

const EMPTY_MESSAGE = "Please enter some text before continuing.";
const REQUEST_TIMEOUT_MS = 90000;

const el = {
  body: document.body,
  nav: document.getElementById("taskNav"),
  pageTitle: document.getElementById("pageTitle"),
  pageHint: document.getElementById("pageHint"),
  composerTitle: document.getElementById("composerTitle"),
  composerHint: document.getElementById("composerHint"),
  input: document.getElementById("mainInput"),
  pathFields: document.getElementById("pathFields"),
  topic: document.getElementById("topicInput"),
  level: document.getElementById("levelSelect"),
  examples: document.getElementById("examples"),
  counter: document.getElementById("counter"),
  generateBtn: document.getElementById("generateBtn"),
  generateLabel: document.getElementById("generateLabel"),
  result: document.getElementById("result"),
  empty: document.getElementById("emptyState"),
  resultBody: document.getElementById("resultBody"),
  themeToggle: document.getElementById("themeToggle"),
  themeLabel: document.getElementById("themeLabel"),
};

let currentTask = "qa";
let isLoading = false;
const drafts = {};   // text the student typed, remembered per task
const results = {};  // last result per task, so switching tabs does not lose it

/* ------------------------------------------------------------------ *
 * Small DOM helpers (textContent is used for untrusted text).
 * ------------------------------------------------------------------ */
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value; // only used with escaped/known-safe markup
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ------------------------------------------------------------------ *
 * Tiny, safe Markdown renderer (headings, lists, bold, italic, code).
 * All text is escaped first, so model output can never inject HTML.
 * ------------------------------------------------------------------ */
function inlineMarkdown(escaped) {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>");
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  let html = "";
  let listType = null;
  let inCode = false;
  let codeLines = [];

  const closeList = () => { if (listType) { html += `</${listType}>`; listType = null; } };
  const openList = (type) => { if (listType !== type) { closeList(); html += `<${type}>`; listType = type; } };

  for (const raw of lines) {
    if (raw.trim().startsWith("```")) {
      if (inCode) {
        html += `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`;
        codeLines = []; inCode = false;
      } else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }

    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { closeList(); continue; } // horizontal rule

    let m;
    if ((m = line.match(/^\s*(#{1,6})\s+(.*)$/))) {
      closeList();
      const level = Math.min(m[1].length + 2, 5); // "##" -> h4 inside cards
      html += `<h${level}>${inlineMarkdown(escapeHtml(m[2]))}</h${level}>`;
    } else if ((m = line.match(/^(\s*)[-*\u2022]\s+(.*)$/))) {
      openList("ul");
      html += `<li${m[1].length >= 2 ? ' class="sub"' : ""}>${inlineMarkdown(escapeHtml(m[2]))}</li>`;
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      openList("ol");
      html += `<li>${inlineMarkdown(escapeHtml(m[1]))}</li>`;
    } else {
      closeList();
      html += `<p>${inlineMarkdown(escapeHtml(line.trim()))}</p>`;
    }
  }
  if (inCode) html += `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`;
  closeList();
  return html;
}

function prose(markdown) {
  return h("div", { class: "prose", html: markdownToHtml(markdown) });
}

/* Split "## Heading" sections; returns [{title, body}]. */
function splitSections(text) {
  const sections = [];
  let current = null;
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const m = line.match(/^\s*##\s+(.*)$/);
    if (m) { current = { title: m[1].replace(/[*#]/g, "").trim(), body: "" }; sections.push(current); }
    else if (current) current.body += line + "\n";
  }
  return sections.filter((s) => s.body.trim());
}

/* ------------------------------------------------------------------ *
 * Loading, errors and result display
 * ------------------------------------------------------------------ */
function showLoading(on, task = currentTask) {
  isLoading = on;
  el.generateBtn.disabled = on;
  el.generateBtn.classList.toggle("is-loading", on);
  el.generateLabel.textContent = on ? "Working..." : "Generate";
  el.result.setAttribute("aria-busy", String(on));
  if (on) {
    el.empty.hidden = true;
    el.resultBody.replaceChildren(
      h("div", { class: "card loading" },
        h("div", { class: "loading-label", text: TASKS[task].loading }),
        h("div", { class: "skeleton" }), h("div", { class: "skeleton" }),
        h("div", { class: "skeleton" }), h("div", { class: "skeleton" }), h("div", { class: "skeleton" }))
    );
  }
}

function showError(message) {
  el.empty.hidden = true;
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.2v.1"/></svg>';
  el.resultBody.replaceChildren(
    h("div", { class: "error-box", role: "alert" },
      h("span", { html: icon }),
      h("div", {}, h("h2", { text: "Something needs attention" }), h("p", { text: message })))
  );
}

function copyButton(getText) {
  const button = h("button", { class: "btn-ghost", type: "button", text: "Copy" });
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getText());
      button.textContent = "Copied";
    } catch { button.textContent = "Copy failed"; }
    setTimeout(() => (button.textContent = "Copy"), 1800);
  });
  return button;
}

function resultCard(title, rawText, bodyNode, badgeText) {
  const heading = h("h2", { text: title });
  if (badgeText) heading.append(h("span", { class: "badge", text: badgeText }));
  return h("article", { class: "card result-card" },
    h("div", { class: "result-head" }, heading, copyButton(() => rawText)),
    h("div", { class: "result-body" }, bodyNode));
}

const SECTION_ICONS = {
  intro: '<path d="M12 3l2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z"/>',
  beginner: '<path d="M5 20V10M12 20V6M19 20v0"/>',
  intermediate: '<path d="M5 20v-6M12 20V6M19 20v0"/>',
  advanced: '<path d="M5 20v-6M12 20v-9M19 20V4"/>',
  order: '<path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  practice: '<path d="M14.5 5.5l4 4L8 20H4v-4zM13 7l4 4"/>',
  resources: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 21V5"/>',
  timeline: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  definition: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM4 21V5"/>',
  points: '<path d="M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  example: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  summary: '<path d="M4 6h16M4 12h10M4 18h14"/>',
};

function sectionKind(title) {
  const t = title.toLowerCase();
  const rules = [
    ["beginner", "beginner"], ["intermediate", "intermediate"], ["advanced", "advanced"],
    ["order", "order"], ["practice", "practice"], ["resource", "resources"],
    ["timeline", "timeline"], ["intro", "intro"], ["definition", "definition"],
    ["main point", "points"], ["example", "example"], ["summary", "summary"],
  ];
  for (const [word, kind] of rules) if (t.includes(word)) return kind;
  return "intro";
}

function sectionCards(text, wideKinds) {
  const sections = splitSections(text);
  if (!sections.length) return null;
  const grid = h("div", { class: "sections" });
  for (const section of sections) {
    const kind = sectionKind(section.title);
    const card = h("section", { class: "section-card" + (wideKinds.includes(kind) ? " wide" : ""), "data-kind": kind },
      h("h3", { html: `<svg viewBox="0 0 24 24" aria-hidden="true">${SECTION_ICONS[kind] || ""}</svg>` }),
      prose(section.body));
    card.querySelector("h3").append(document.createTextNode(section.title));
    grid.append(card);
  }
  return grid;
}

function displayResult(task, data, meta = {}) {
  el.empty.hidden = true;
  const config = TASKS[task];
  const value = data[config.key] ?? data.result;
  if (value === undefined || value === null || value === "") {
    throw new Error("EduGenie received an empty response. Please try again.");
  }

  let node;
  if (task === "quiz") {
    node = renderQuiz(value);
  } else if (task === "path") {
    const grid = sectionCards(value, ["intro", "order", "timeline"]);
    node = grid
      ? h("div", {},
          h("div", { class: "quiz-head" }, h("h2", { text: `${config.resultTitle}: ${meta.topic || ""}`.trim() }),
            h("span", { class: "quiz-progress", text: `Starting as: ${meta.level || "Beginner"}` }),
            copyButton(() => value)),
          grid)
      : resultCard(config.resultTitle, value, prose(value), meta.level);
  } else if (task === "explain") {
    const grid = sectionCards(value, ["definition", "summary"]);
    node = grid
      ? h("div", {},
          h("div", { class: "quiz-head" }, h("h2", { text: config.resultTitle }), copyButton(() => value)),
          grid)
      : resultCard(config.resultTitle, value, prose(value));
  } else {
    node = resultCard(config.resultTitle, value, prose(value));
  }

  el.resultBody.replaceChildren(node);
  results[task] = { data, meta };
}

/* ------------------------------------------------------------------ *
 * Interactive quiz
 * ------------------------------------------------------------------ */
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function renderQuiz(quiz) {
  const questions = quiz && Array.isArray(quiz.questions) ? quiz.questions : null;
  if (!questions || !questions.length) throw new Error("The quiz came back in an unexpected format. Please try again.");

  const total = questions.length;
  const state = { answered: 0, correct: 0 };
  const root = h("div", {});
  const progress = h("span", { class: "quiz-progress", text: `0 of ${total} answered` });
  const list = h("div", { class: "quiz" });
  const scoreSlot = h("div", {});
  root.append(h("div", { class: "quiz-head" }, h("h2", { text: "Your quiz" }), progress), list, scoreSlot);

  questions.forEach((q, index) => {
    let selected = null;
    let checked = false;
    const optionButtons = [];
    const feedback = h("div", {});
    const checkBtn = h("button", { class: "btn-check", type: "button", text: "Check answer", disabled: "" });
    const group = h("div", { class: "options", role: "radiogroup", "aria-label": `Options for question ${index + 1}` });

    shuffle(q.options).forEach((option, i) => {
      const btn = h("button", { class: "option", type: "button", role: "radio", "aria-checked": "false" },
        h("span", { class: "letter", text: "ABCD"[i] || String(i + 1) }),
        h("span", { text: option }));
      btn.addEventListener("click", () => {
        if (checked) return;
        selected = option;
        optionButtons.forEach(({ button }) => {
          const on = button === btn;
          button.classList.toggle("is-selected", on);
          button.setAttribute("aria-checked", String(on));
        });
        checkBtn.disabled = false;
      });
      optionButtons.push({ button: btn, option });
      group.append(btn);
    });

    checkBtn.addEventListener("click", () => {
      if (checked || selected === null) return;
      checked = true;
      checkBtn.hidden = true;
      const isCorrect = selected === q.correct_answer;
      optionButtons.forEach(({ button, option }) => {
        button.disabled = true;
        button.classList.remove("is-selected");
        if (option === q.correct_answer) {
          button.classList.add("is-correct");
          button.append(h("span", { class: "mark", text: "Correct answer" }));
        } else if (option === selected) {
          button.classList.add("is-wrong");
          button.append(h("span", { class: "mark", text: "Your answer" }));
        }
      });
      feedback.replaceChildren(
        h("div", { class: "feedback " + (isCorrect ? "good" : "bad"), role: "status" },
          h("strong", { text: isCorrect ? "Correct!" : "Not quite." }),
          isCorrect ? null : h("div", { text: `The correct answer is: ${q.correct_answer}` }),
          h("p", { text: q.explanation })));

      state.answered += 1;
      if (isCorrect) state.correct += 1;
      progress.textContent = `${state.answered} of ${total} answered`;
      if (state.answered === total) {
        scoreSlot.replaceChildren(scoreCard(state.correct, total, () => {
          el.resultBody.replaceChildren(renderQuiz(quiz)); // retake with fresh order
        }));
        scoreSlot.firstChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    list.append(h("article", { class: "card q-card" },
      h("p", { class: "q-meta", text: `Question ${index + 1} of ${total}` }),
      h("p", { class: "q-text", text: q.question }),
      group,
      h("div", { class: "q-actions" }, checkBtn),
      feedback));
  });
  return root;
}

function scoreCard(correct, total, onRetake) {
  const wrong = total - correct;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const ratio = correct / total;
  const message = ratio === 1 ? "Perfect score. Great work!"
    : ratio >= 0.67 ? "Nice work. Review the one you missed."
    : ratio >= 0.34 ? "A good start. Read the explanations and try again."
    : "Keep going. Try the Explain tool, then retake the quiz.";

  // SVG elements must be created in the SVG namespace.
  const bar = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  bar.setAttribute("class", "bar");
  bar.setAttribute("cx", "56");
  bar.setAttribute("cy", "56");
  bar.setAttribute("r", String(radius));
  bar.setAttribute("stroke-linecap", "round");
  bar.setAttribute("stroke-dasharray", String(circumference));
  bar.setAttribute("stroke-dashoffset", String(circumference));
  const ring = h("div", { class: "ring", "aria-hidden": "true" },
    h("span", { text: `${correct}/${total}` }));
  ring.insertAdjacentHTML("afterbegin",
    `<svg viewBox="0 0 112 112"><circle class="track" cx="56" cy="56" r="${radius}"/></svg>`);
  ring.querySelector("svg").append(bar);
  requestAnimationFrame(() => bar.setAttribute("stroke-dashoffset", String(circumference * (1 - ratio))));

  return h("section", { class: "card score-card", "aria-label": "Quiz results" },
    ring,
    h("div", { class: "score-info" },
      h("h2", { text: `Score: ${correct} / ${total}` }),
      h("p", { text: message }),
      h("div", { class: "score-stats" },
        h("span", { class: "good", text: `${correct} correct` }),
        h("span", { class: "bad", text: `${wrong} incorrect` })),
      h("div", { class: "score-actions" },
        h("button", { class: "btn-check", type: "button", text: "Retake this quiz", onclick: onRetake }),
        h("button", { class: "btn-ghost", type: "button", text: "New quiz", onclick: () => {
          el.input.focus(); window.scrollTo({ top: 0, behavior: "smooth" });
        } }))));
}

/* ------------------------------------------------------------------ *
 * Network layer
 * ------------------------------------------------------------------ */
async function postJson(endpoint, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("This is taking too long. Please try again in a moment.");
    throw new Error("Cannot reach the EduGenie server. Check that it is running and try again.");
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try { data = await response.json(); } catch { /* not JSON */ }

  if (!data || typeof data !== "object") {
    throw new Error(response.ok
      ? "EduGenie received an unreadable response. Please try again."
      : `The server returned an error (${response.status}). Please try again.`);
  }
  if (!response.ok || data.success === false) {
    throw new Error(data.error || "EduGenie could not generate a response right now. Please try again.");
  }
  return data;
}

async function runTask(task, payload, meta = {}) {
  showLoading(true, task);
  try {
    const data = await postJson(TASKS[task].endpoint, payload);
    if (task !== currentTask) { results[task] = { data, meta }; return; } // student switched tabs
    displayResult(task, data, meta);
  } catch (err) {
    if (task === currentTask) showError(err.message || "Something went wrong. Please try again.");
  } finally {
    showLoading(false);
  }
  if (task === currentTask) el.result.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ------------------------------------------------------------------ *
 * One function per feature
 * ------------------------------------------------------------------ */
function requireText(value, focusEl) {
  const text = value.trim();
  if (!text) { showError(EMPTY_MESSAGE); focusEl.focus(); return null; }
  return text;
}

async function submitQuestion() {
  const question = requireText(el.input.value, el.input);
  if (question) await runTask("qa", { question });
}
async function explainTopic() {
  const topic = requireText(el.input.value, el.input);
  if (topic) await runTask("explain", { topic });
}
async function generateQuiz() {
  const text = requireText(el.input.value, el.input);
  if (text) await runTask("quiz", { text });
}
async function summarizeText() {
  const text = requireText(el.input.value, el.input);
  if (text) await runTask("summarize", { text });
}
async function generateLearningPath() {
  const topic = requireText(el.topic.value, el.topic);
  if (topic) await runTask("path", { topic, level: el.level.value }, { topic, level: el.level.value });
}

const HANDLERS = {
  qa: submitQuestion, explain: explainTopic, quiz: generateQuiz,
  summarize: summarizeText, path: generateLearningPath,
};

/* ------------------------------------------------------------------ *
 * Task switching and input handling
 * ------------------------------------------------------------------ */
function activeField() { return currentTask === "path" ? el.topic : el.input; }

function updateCounter() {
  const { max } = TASKS[currentTask];
  const length = activeField().value.length;
  el.counter.textContent = `${length.toLocaleString()} / ${max.toLocaleString()}`;
  el.counter.classList.toggle("near-limit", length > max * 0.9);
}

function selectTask(task) {
  if (isLoading || !TASKS[task]) return;
  drafts[currentTask] = activeField().value;
  currentTask = task;
  const config = TASKS[task];

  el.body.dataset.task = task;
  el.nav.querySelectorAll(".nav-item").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.task === task)));
  el.pageTitle.textContent = config.pageTitle;
  el.pageHint.textContent = config.pageHint;
  el.composerTitle.textContent = config.title;
  el.composerHint.textContent = config.hint;

  const isPath = task === "path";
  el.input.hidden = isPath;
  el.pathFields.hidden = !isPath;
  if (isPath) {
    el.topic.placeholder = config.placeholder;
    el.topic.maxLength = config.max;
    el.topic.value = drafts.path || "";
  } else {
    el.input.placeholder = config.placeholder;
    el.input.rows = config.rows;
    el.input.maxLength = config.max;
    el.input.value = drafts[task] || "";
  }

  el.examples.replaceChildren(...config.examples.map((text) =>
    h("button", { class: "chip", type: "button", text, onclick: () => {
      activeField().value = text; updateCounter(); activeField().focus();
    } })));

  updateCounter();
  if (results[task]) {
    try { displayResult(task, results[task].data, results[task].meta); }
    catch { el.resultBody.replaceChildren(); el.empty.hidden = false; }
  } else {
    el.resultBody.replaceChildren();
    el.empty.hidden = false;
  }
}

el.nav.addEventListener("click", (event) => {
  const button = event.target.closest(".nav-item");
  if (button) selectTask(button.dataset.task);
});
el.generateBtn.addEventListener("click", () => { if (!isLoading) HANDLERS[currentTask](); });
[el.input, el.topic].forEach((field) => {
  field.addEventListener("input", updateCounter);
  field.addEventListener("keydown", (event) => {
    const submitShortcut = (event.ctrlKey || event.metaKey) && event.key === "Enter";
    const enterInTopic = field === el.topic && event.key === "Enter";
    if ((submitShortcut || enterInTopic) && !isLoading) { event.preventDefault(); HANDLERS[currentTask](); }
  });
});

/* ------------------------------------------------------------------ *
 * Theme toggle
 * ------------------------------------------------------------------ */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  el.themeLabel.textContent = theme === "dark" ? "Light mode" : "Dark mode";
  try { localStorage.setItem("edugenie-theme", theme); } catch { /* storage unavailable */ }
}
el.themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
el.themeLabel.textContent = document.documentElement.dataset.theme === "dark" ? "Light mode" : "Dark mode";

selectTask("qa");
