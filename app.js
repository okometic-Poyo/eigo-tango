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

// 単一のAudio要素を使い回す。最初のタップ時に無音を1回鳴らして「解錠」しておくと、
// iOS/Silkでもタップ直後以外のタイミング（出題時の自動再生など）で音を出せる
const SILENT_WAV = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
const player = new Audio();
let audioUnlocked = false;

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  player.src = SILENT_WAV;
  player.play().catch(() => {});
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
  } catch (e) { /* 効果音なしで続行 */ }
}
document.addEventListener("pointerdown", unlockAudio, { capture: true });
document.addEventListener("touchstart", unlockAudio, { capture: true });

function playAudio(id) {
  const play = (url, fallback) => {
    player.onerror = () => {
      if (fallback) play(fallback, null);
      else delete audioUrlCache[id];
    };
    player.src = url;
    player.play().then(() => { audioUrlCache[id] = url; }).catch(() => {});
  };
  if (audioUrlCache[id]) play(audioUrlCache[id], null);
  else play(`content/audio/${id}.mp3`, `content/audio/${id}.m4a`);
}

// ---------- 正解演出 ----------

let audioCtx = null;

function playChime() {
  // 「ピンポーン♪」をWeb Audioで生成（素材ファイル不要）
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [[784, 0], [1047, 0.18]].forEach(([freq, delay]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.3, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.5);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.55);
    });
  } catch (e) { /* 音が出なくても続行 */ }
}

function playBuzzer() {
  // 不正解の「ブッ」（低いノコギリ波を短く）
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 110;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch (e) { /* 音が出なくても続行 */ }
}

function celebrate() {
  playChime();
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);

  // 大きく弾む⭕
  const mark = el(`<div class="big-maru">⭕</div>`);
  document.body.appendChild(mark);
  setTimeout(() => mark.remove(), 1000);

  // 紙吹雪
  const box = el(`<div class="confetti-box"></div>`);
  const shapes = ["🎉", "⭐", "✨", "🌟", "💮", "🎊"];
  for (let i = 0; i < 24; i++) {
    const p = el(`<span class="confetti">${shapes[i % shapes.length]}</span>`);
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDelay = `${Math.random() * 0.4}s`;
    p.style.animationDuration = `${1 + Math.random() * 0.8}s`;
    p.style.fontSize = `${18 + Math.random() * 22}px`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2400);
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
    </div>
    <a class="admin-door" href="admin.html" aria-label="かんりページ">·</a>
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
      playAudio(q.word.id); // 出題と同時に1回再生（きくボタンは聞き直し用）
    }

    // --- 選択肢: どの形式でも「タップで選択 → きめた！で確定」 ---
    const choicesBox = page.querySelector(".choices");
    const confirmArea = page.querySelector(".confirm-area");
    let selected = null;
    let answered = false;

    const confirmBtn = el(`<button class="confirm" disabled>きめた！</button>`);
    confirmBtn.onclick = () => { if (selected && !answered) answer(selected.cw, selected.btn); };
    confirmArea.appendChild(confirmBtn);

    function select(cw, btn) {
      if (answered) return;
      if (q.mode.answer === "audio") playAudio(cw.id); // 音声選択肢は聞き比べできる
      selected = { cw, btn };
      choicesBox.querySelectorAll(".choice").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      confirmBtn.disabled = false;
    }

    q.choices.forEach((cw) => {
      let btn;
      if (q.mode.answer === "spell") {
        btn = el(`<button class="choice choice-spell ${cw.category === "sentence" ? "sentence" : ""}">${escapeHtml(cw.text)}</button>`);
      } else if (q.mode.answer === "image") {
        btn = el(`<button class="choice choice-image"><img src="${imageUrl(cw)}" alt=""></button>`);
      } else {
        btn = el(`<button class="choice choice-audio">🔊</button>`);
      }
      btn.onclick = () => {
        if (answered) {
          // 回答後: つづり・音声の選択肢はタップでその単語を読み上げ（聞き比べ・復習用）
          if (q.mode.answer === "spell" || q.mode.answer === "audio") playAudio(cw.id);
        } else {
          select(cw, btn);
        }
      };
      choicesBox.appendChild(btn);
    });

    function answer(chosen, btn) {
      if (answered) return;
      answered = true;
      const correct = chosen.id === q.word.id;
      const p = wordProgress(q.word.id);
      if (correct) {
        correctCount++;
        p.passed[q.mode.key] = true;
        btn.classList.add("correct");
        celebrate();
      } else {
        p.wrong++;
        delete p.passed[q.mode.key]; // 間違えたらその方式はやり直し
        btn.classList.add("wrong");
        playBuzzer();
        // 正解の選択肢を光らせる
        [...choicesBox.children].forEach((b, i2) => {
          if (q.choices[i2].id === q.word.id) b.classList.add("correct");
        });
      }
      saveProgress();

      // 音声の選択肢: 回答後はどの音がどの単語か分かるようにスペルを表示
      if (q.mode.answer === "audio") {
        [...choicesBox.children].forEach((b, i2) => {
          b.insertAdjacentHTML("beforeend", `<span class="audio-label">${escapeHtml(q.choices[i2].text)}</span>`);
        });
      }

      // 日本語訳を出さない条件: 機能語（日英変換のクセを防ぐ）／イラストが問題のとき（絵で意味が伝わるため）
      const showJa = q.word.ja && q.word.category !== "function-word" && q.mode.prompt !== "image";
      const fb = el(`<div class="feedback ${correct ? "ok" : "ng"}">
        <div class="fb-mark">${correct ? "⭕ せいかい！" : "❌ ざんねん"}</div>
        <div class="fb-word">${escapeHtml(q.word.text)}${showJa ? `　<span class="fb-ja">${escapeHtml(q.word.ja)}</span>` : ""}</div>
        <button class="next">つぎへ ▶</button>
      </div>`);
      fb.querySelector(".next").onclick = () => { qi++; showQuestion(); };
      // 正解の音を必ず聞かせて定着させる（効果音が鳴り終わってから）
      setTimeout(() => playAudio(q.word.id), correct ? 700 : 450);
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
      const listJa = w.category !== "function-word" ? w.ja || "" : "";
      const row = el(`<div class="word-row ${mastered ? "mastered" : ""}">
        <span class="row-visual"></span>
        <span class="row-text">
          <span class="row-spell ${w.category === "sentence" ? "sentence" : ""}">${escapeHtml(w.text)}</span>
          <span class="row-ja">${escapeHtml(listJa)}</span>
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
