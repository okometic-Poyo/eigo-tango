/* えいごのたんご — フラッシュカード＆小テスト
 *
 * データ: content/words.json（単語マスタ）/ content/sets.json（セット定義）
 * 素材:   content/images/<id>.png / content/audio/<id>.mp3（無ければ .m4a）
 * 進捗:   localStorage "tango-progress-v1"
 *         { <wordId>: { passed: { <modeKey>: true }, wrong: n } }
 */

const PROGRESS_KEY = "tango-progress-v1";
const QUESTIONS_PER_SET = 10; // 新規8問 + 復習2問が基本形
const REVIEW_PER_SET = 2;

// 出題方式（①②③ × 双方向 = 6パターン）
const MODES = [
  { key: "spell-audio", prompt: "spell", answer: "audio", label: "つづり → よみ" },
  { key: "audio-spell", prompt: "audio", answer: "spell", label: "よみ → つづり" },
  { key: "image-audio", prompt: "image", answer: "audio", label: "え → よみ" },
  { key: "audio-image", prompt: "audio", answer: "image", label: "よみ → え" },
  { key: "image-spell", prompt: "image", answer: "spell", label: "え → つづり" },
  { key: "spell-image", prompt: "spell", answer: "image", label: "つづり → え" },
];

let WORDS = [];            // 単語マスタ（配列）
let WORD_MAP = {};         // id → word
let SETS = [];             // セット定義（順序＝出題順）
let progress = {};         // 習得状況
const audioUrlCache = {};  // id → 実在が確認できた音源URL

// ---------- データ読み込み ----------

async function loadData() {
  const bust = `?v=${Date.now()}`;
  const [wordsRes, setsRes] = await Promise.all([
    fetch(`content/words.json${bust}`),
    fetch(`content/sets.json${bust}`),
  ]);
  WORDS = (await wordsRes.json()).words;
  SETS = (await setsRes.json()).sets;
  WORD_MAP = Object.fromEntries(WORDS.map((w) => [w.id, w]));
  progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
}

function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

// ---------- 習得判定 ----------

function modesFor(word) {
  // 機能語は①（スペル⇄音声）のみ。名詞・文章は全6パターン
  return word.category === "function-word" ? MODES.slice(0, 2) : MODES;
}

function wordProgress(id) {
  if (!progress[id]) progress[id] = { passed: {}, wrong: 0 };
  return progress[id];
}

function isMastered(word) {
  const p = progress[word.id];
  if (!p) return false;
  return modesFor(word).every((m) => p.passed[m.key]);
}

function unpassedModes(word) {
  const p = progress[word.id];
  return modesFor(word).filter((m) => !p || !p.passed[m.key]);
}

// ---------- 素材のURL ----------

function imageUrl(word) {
  return `content/images/${word.id}.png`;
}

function playAudio(id) {
  const tryPlay = (url, fallback) => {
    const a = new Audio(url);
    a.play().catch(() => {});
    a.onerror = () => {
      if (fallback) tryPlay(fallback, null);
      else delete audioUrlCache[id];
    };
    a.oncanplaythrough = () => { audioUrlCache[id] = url; };
  };
  if (audioUrlCache[id]) tryPlay(audioUrlCache[id], null);
  else tryPlay(`content/audio/${id}.mp3`, `content/audio/${id}.m4a`);
}

// ---------- ユーティリティ ----------

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- 出題の組み立て ----------

// 選択肢のダミー（誤答）を選ぶ: 同カテゴリ優先。answer=image のときは画像を持つ語のみ
function pickDistractors(word, answerKind, setWordIds) {
  const usable = (w) =>
    w.id !== word.id && (answerKind !== "image" || w.category !== "function-word");
  const sameCat = WORDS.filter((w) => usable(w) && w.category === word.category);
  const inSet = sameCat.filter((w) => setWordIds.includes(w.id));
  const pool = [...shuffle(inSet), ...shuffle(sameCat.filter((w) => !setWordIds.includes(w.id))),
                ...shuffle(WORDS.filter((w) => usable(w) && w.category !== word.category))];
  const seen = new Set();
  const out = [];
  for (const w of pool) {
    if (!seen.has(w.id)) { seen.add(w.id); out.push(w); }
    if (out.length === 3) break;
  }
  return out;
}

function buildQuestion(word, mode, setWordIds) {
  const distractors = pickDistractors(word, mode.answer, setWordIds);
  const choices = shuffle([word, ...distractors]);
  return { word, mode, choices };
}

// セットの出題リスト（新規最大8問 + 前セット復習2問 = 約10問）
function buildSession(setIndex) {
  const set = SETS[setIndex];
  const setWords = set.words.map((id) => WORD_MAP[id]).filter(Boolean);

  const questions = [];
  const newCount = QUESTIONS_PER_SET - REVIEW_PER_SET;

  // 未習得の単語を優先し、単語ごとに未クリアの方式から1つ出題
  const unmastered = shuffle(setWords.filter((w) => !isMastered(w)));
  const mastered = shuffle(setWords.filter((w) => isMastered(w)));
  for (const w of [...unmastered, ...mastered]) {
    if (questions.length >= newCount) break;
    const modes = unpassedModes(w);
    const mode = modes.length ? pick(modes) : pick(modesFor(w));
    questions.push(buildQuestion(w, mode, set.words));
  }
  // 単語数が少なければ、別方式でもう1周
  while (questions.length < newCount && setWords.length) {
    const w = pick(setWords);
    const modes = unpassedModes(w);
    const mode = modes.length ? pick(modes) : pick(modesFor(w));
    questions.push(buildQuestion(w, mode, set.words));
  }

  // 復習: それ以前のセットから未習得優先で2問
  const earlierIds = SETS.slice(0, setIndex).flatMap((s) => s.words);
  const earlierWords = earlierIds.map((id) => WORD_MAP[id]).filter(Boolean);
  if (earlierWords.length) {
    const revPool = shuffle(earlierWords.filter((w) => !isMastered(w)));
    const revFill = shuffle(earlierWords.filter((w) => isMastered(w)));
    for (const w of [...revPool, ...revFill].slice(0, REVIEW_PER_SET)) {
      const modes = unpassedModes(w);
      const mode = modes.length ? pick(modes) : pick(modesFor(w));
      questions.push(buildQuestion(w, mode, set.words));
    }
  }
  return shuffle(questions);
}

// ---------- 画面: 共通 ----------

const app = document.getElementById("app");

function render(node) {
  app.replaceChildren(node);
}

function route() {
  const hash = location.hash || "#home";
  if (hash.startsWith("#quiz/")) {
    const setId = hash.slice(6);
    const idx = SETS.findIndex((s) => s.id === setId);
    if (idx >= 0) return renderQuiz(idx);
  }
  if (hash === "#list") return renderList();
  renderHome();
}

// ---------- 画面: ホーム ----------

function renderHome() {
  const page = el(`<div class="page home">
    <h1 class="app-title">🦁 えいごの たんご</h1>
    <div class="set-list"></div>
    <div class="home-links">
      <a class="link-btn" href="#list">📚 ことばリスト（よしゅう）</a>
      <a class="link-btn subtle" href="admin.html">⚙️ かんりページ</a>
    </div>
  </div>`);
  const list = page.querySelector(".set-list");
  SETS.forEach((set, i) => {
    const words = set.words.map((id) => WORD_MAP[id]).filter(Boolean);
    const done = words.filter(isMastered).length;
    const pct = words.length ? Math.round((done / words.length) * 100) : 0;
    const card = el(`<button class="set-card">
      <span class="set-emoji">${set.emoji || "⭐"}</span>
      <span class="set-info">
        <span class="set-title">セット${i + 1}　${escapeHtml(set.title)}</span>
        <span class="bar"><span class="bar-fill" style="width:${pct}%"></span></span>
        <span class="set-count">${done} / ${words.length} ことば おぼえた${done === words.length && words.length ? "🎉" : ""}</span>
      </span>
      <span class="set-go">▶</span>
    </button>`);
    card.onclick = () => { location.hash = `#quiz/${set.id}`; };
    list.appendChild(card);
  });
  render(page);
}

// ---------- 画面: クイズ ----------

function renderQuiz(setIndex) {
  const set = SETS[setIndex];
  const questions = buildSession(setIndex);
  let qi = 0;
  let correctCount = 0;

  function showQuestion() {
    if (qi >= questions.length) return showResult();
    const q = questions[qi];
    const page = el(`<div class="page quiz">
      <div class="quiz-head">
        <a class="quit" href="#home">✕</a>
        <span class="q-progress">${qi + 1} / ${questions.length}</span>
        <span class="q-stars">${"⭐".repeat(correctCount)}</span>
      </div>
      <p class="instruction"></p>
      <div class="prompt-area"></div>
      <div class="choices"></div>
      <div class="confirm-area"></div>
    </div>`);

    const instruction = {
      audio: "ただしい よみかたは どれ？",
      spell: q.word.category === "sentence" ? "ただしい ぶんは どれ？" : "ただしい つづりは どれ？",
      image: "あう えは どれ？",
    }[q.mode.answer];
    page.querySelector(".instruction").textContent = instruction;

    // --- 問題の提示 ---
    const promptArea = page.querySelector(".prompt-area");
    if (q.mode.prompt === "spell") {
      promptArea.appendChild(el(`<div class="prompt-spell ${q.word.category === "sentence" ? "sentence" : ""}">${escapeHtml(q.word.text)}</div>`));
    } else if (q.mode.prompt === "image") {
      promptArea.appendChild(el(`<img class="prompt-image" src="${imageUrl(q.word)}" alt="">`));
    } else {
      const btn = el(`<button class="prompt-audio">🔊<span>きく</span></button>`);
      btn.onclick = () => playAudio(q.word.id);
      promptArea.appendChild(btn);
      setTimeout(() => playAudio(q.word.id), 300); // 自動再生（ブロックされたらボタンで）
    }

    // --- 選択肢 ---
    const choicesBox = page.querySelector(".choices");
    const confirmArea = page.querySelector(".confirm-area");
    let selected = null;
    let answered = false;

    q.choices.forEach((cw) => {
      let btn;
      if (q.mode.answer === "spell") {
        btn = el(`<button class="choice choice-spell ${cw.category === "sentence" ? "sentence" : ""}">${escapeHtml(cw.text)}</button>`);
        btn.onclick = () => answer(cw, btn);
      } else if (q.mode.answer === "image") {
        btn = el(`<button class="choice choice-image"><img src="${imageUrl(cw)}" alt=""></button>`);
        btn.onclick = () => answer(cw, btn);
      } else {
        // 音声の選択肢: タップで再生＋選択 → 「きめた！」で確定
        btn = el(`<button class="choice choice-audio">🔊</button>`);
        btn.onclick = () => {
          if (answered) return;
          playAudio(cw.id);
          selected = { cw, btn };
          choicesBox.querySelectorAll(".choice").forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          confirmBtn.disabled = false;
        };
      }
      choicesBox.appendChild(btn);
    });

    let confirmBtn = null;
    if (q.mode.answer === "audio") {
      confirmBtn = el(`<button class="confirm" disabled>きめた！</button>`);
      confirmBtn.onclick = () => { if (selected) answer(selected.cw, selected.btn); };
      confirmArea.appendChild(confirmBtn);
    }

    function answer(chosen, btn) {
      if (answered) return;
      answered = true;
      const correct = chosen.id === q.word.id;
      const p = wordProgress(q.word.id);
      if (correct) {
        correctCount++;
        p.passed[q.mode.key] = true;
        btn.classList.add("correct");
      } else {
        p.wrong++;
        delete p.passed[q.mode.key]; // 間違えたらその方式はやり直し
        btn.classList.add("wrong");
        // 正解の選択肢を光らせる
        [...choicesBox.children].forEach((b, i2) => {
          if (q.choices[i2].id === q.word.id) b.classList.add("correct");
        });
      }
      saveProgress();

      const fb = el(`<div class="feedback ${correct ? "ok" : "ng"}">
        <div class="fb-mark">${correct ? "⭕ せいかい！" : "❌ ざんねん"}</div>
        <div class="fb-word">${escapeHtml(q.word.text)}${q.word.ja ? `　<span class="fb-ja">${escapeHtml(q.word.ja)}</span>` : ""}</div>
        <button class="next">つぎへ ▶</button>
      </div>`);
      fb.querySelector(".next").onclick = () => { qi++; showQuestion(); };
      playAudio(q.word.id); // 正解の音を必ず聞かせて定着させる
      confirmArea.replaceChildren(fb);
      if (isMastered(q.word)) {
        fb.querySelector(".fb-mark").insertAdjacentHTML("beforeend",
          `<div class="mastered-banner">🏅 「${escapeHtml(q.word.text)}」を マスター！</div>`);
      }
    }

    render(page);
  }

  function showResult() {
    const total = questions.length;
    const page = el(`<div class="page result">
      <h2>${correctCount === total ? "🎉 パーフェクト！" : "✨ よくがんばりました！"}</h2>
      <div class="result-stars">${"⭐".repeat(correctCount)}${"☆".repeat(total - correctCount)}</div>
      <p class="result-score">${total}もん中 ${correctCount}もん せいかい</p>
      <div class="result-btns">
        <button class="big-btn again">もういちど</button>
        <button class="big-btn home-btn">ホームへ</button>
      </div>
    </div>`);
    page.querySelector(".again").onclick = () => renderQuiz(setIndex);
    page.querySelector(".home-btn").onclick = () => { location.hash = "#home"; };
    render(page);
  }

  showQuestion();
}

// ---------- 画面: ことばリスト（予習・出題順） ----------

function renderList() {
  const page = el(`<div class="page list">
    <div class="list-head">
      <a class="back" href="#home">◀ もどる</a>
      <h2>📚 ことばリスト</h2>
    </div>
    <p class="list-note">うえから じゅんばんに でてくるよ。🔊 をおすと きこえるよ。</p>
    <div class="list-body"></div>
  </div>`);
  const body = page.querySelector(".list-body");
  SETS.forEach((set, i) => {
    body.appendChild(el(`<h3 class="list-set-title">${set.emoji || "⭐"} セット${i + 1}　${escapeHtml(set.title)}</h3>`));
    set.words.forEach((id) => {
      const w = WORD_MAP[id];
      if (!w) return;
      const mastered = isMastered(w);
      const row = el(`<div class="word-row ${mastered ? "mastered" : ""}">
        <span class="row-visual"></span>
        <span class="row-text">
          <span class="row-spell ${w.category === "sentence" ? "sentence" : ""}">${escapeHtml(w.text)}</span>
          <span class="row-ja">${escapeHtml(w.ja || "")}</span>
        </span>
        <button class="row-play">🔊</button>
        <span class="row-badge">${mastered ? "🏅" : ""}</span>
      </div>`);
      const visual = row.querySelector(".row-visual");
      if (w.category !== "function-word") {
        visual.appendChild(el(`<img src="${imageUrl(w)}" alt="" loading="lazy">`));
      } else {
        visual.textContent = "🔤";
      }
      row.querySelector(".row-play").onclick = () => playAudio(w.id);
      body.appendChild(row);
    });
  });
  render(page);
}

// ---------- 起動 ----------

(async function main() {
  try {
    await loadData();
  } catch (e) {
    app.innerHTML = `<p class="loading">データのよみこみに しっぱいしました。<br>${escapeHtml(String(e))}</p>`;
    return;
  }
  window.addEventListener("hashchange", route);
  route();
})();
