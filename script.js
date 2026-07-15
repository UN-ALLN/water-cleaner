(function () {
const TYPES = ["debris", "bacteria", "chemical"];
  const TOTAL_LEVELS = 12;

  // difficulty modifiers layered on top of each level's base config
  const DIFFICULTY = {
    easy:   { label: "Easy",   timeAdjust: 5,  missPenalty: 0 },
    normal: { label: "Normal", timeAdjust: 0,  missPenalty: 10 },
    hard:   { label: "Hard",   timeAdjust: -3, missPenalty: 20 },
  };
  let difficulty = "normal";

  // level config: item count, time, active pollutant types, movement
  function levelConfig(n) {
    const itemCount = Math.min(6 + Math.floor((n - 1) / 2), 12);
    const baseTime = 10;
    const diff = DIFFICULTY[difficulty];
    const time = Math.max(4, baseTime + diff.timeAdjust);
    let types;
    if (n <= 4) types = ["debris", "bacteria"];
    else if (n <= 8) types = ["debris", "bacteria", "chemical"];
    else types = ["debris", "bacteria", "chemical"];
    return { itemCount, time, types };
  }

  const SOUNDS = {
    correct: new Audio("assets/sounds/correct.mp3"),
    miss: new Audio("assets/sounds/miss.mp3"),
    click: new Audio("assets/sounds/click.mp3"),
    win: new Audio("assets/sounds/win.mp3"),
  };
  function playSound(name) {
    const src = SOUNDS[name];
    if (!src) return;
    const sfx = src.cloneNode();
    sfx.volume = 0.6;
    sfx.play().catch(() => {});
  }

  let unlockedLevel = 1;
  let currentLevel = 1;
  let score = 0;
  let sortedCount = 0;
  let totalItems = 6;
  let timeLeft = 10;
  let timerId = null;
  let gameActive = false;
  let dragEl = null, offsetX = 0, offsetY = 0;

  const screens = {
    title: document.getElementById("titleScreen"),
    levels: document.getElementById("levelsScreen"),
    play: document.getElementById("levelScreen"),
    end: document.getElementById("endScreen"),
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  // ----- Title -----
  document.querySelectorAll(".difficulty-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      playSound("click");
      difficulty = btn.dataset.difficulty;
      document.querySelectorAll(".difficulty-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  document.getElementById("playBtn").addEventListener("click", () => {
    playSound("click");
    startLevel(currentLevel);
  });
  document.getElementById("levelsBtn").addEventListener("click", () => {
    playSound("click");
    renderLevelGrid();
    showScreen("levels");
  });
  document.getElementById("backFromLevels").addEventListener("click", () => {
    playSound("click");
    showScreen("title");
  });
  document.getElementById("backFromLevel").addEventListener("click", () => {
    playSound("click");
    clearInterval(timerId);
    gameActive = false;
    document.getElementById("countdownOverlay").classList.remove("show");
    showScreen("title");
  });

  function renderLevelGrid() {
    const grid = document.getElementById("levelGrid");
    grid.innerHTML = "";
    for (let i = 1; i <= TOTAL_LEVELS; i++) {
      const btn = document.createElement("button");
      btn.className = "level-cell";
      btn.textContent = i;
      btn.disabled = i > unlockedLevel;
      btn.addEventListener("click", () => {
        playSound("click");
        startLevel(i);
      });
      grid.appendChild(btn);
    }
  }

  // ----- Gameplay -----
  const scoreVal = document.getElementById("scoreVal");
  const progressVal = document.getElementById("progressVal");
  const timeVal = document.getElementById("timeVal");
  const waterCircle = document.getElementById("waterCircle");
  const bucketsRow = document.getElementById("bucketsRow");
  const levelTitle = document.getElementById("levelTitle");
  const difficultyBadge = document.getElementById("difficultyBadge");
  const toast = document.getElementById("toast");
  const milestoneBanner = document.getElementById("milestoneBanner");

  // milestone messages, keyed by percent of pollutants sorted in the current level
  const MILESTONES = [
    { percent: 0.25, message: "Nice start! Keep it up!" },
    { percent: 0.5, message: "Halfway there!" },
    { percent: 0.75, message: "Almost clean!" },
  ];
  let milestonesHit = [];

  function checkMilestones() {
    if (sortedCount >= totalItems) return; // level-clear celebration takes over instead
    const ratio = sortedCount / totalItems;
    MILESTONES.forEach(m => {
      if (ratio >= m.percent && !milestonesHit.includes(m.percent)) {
        milestonesHit.push(m.percent);
        showMilestone(m.message);
      }
    });
  }

  function showMilestone(text) {
    milestoneBanner.textContent = text;
    milestoneBanner.classList.add("show");
    setTimeout(() => milestoneBanner.classList.remove("show"), 1400);
  }

  const ICON_LABEL = { debris: "Debris", bacteria: "Bacteria", chemical: "Chemical" };

  const ICON_SVG = {
    debris: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.6 17.4c-.9-1.7-.7-3.7.6-5.2l2.9-3.4c.9-1.1 2.2-1.8 3.6-1.9l4.2-.4c1.7-.2 3.4.5 4.5 1.8l1.9 2.3c1.2 1.5 1.4 3.6.5 5.3l-.8 1.6c-.5.9-1.4 1.5-2.4 1.6l-10.8.9c-1.7.1-3.3-.8-4.2-2.6z"/></svg>',
    bacteria: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5.5"/><circle cx="4.5" cy="8" r="1.6"/><circle cx="19.5" cy="9" r="1.4"/><circle cx="6.5" cy="18.5" r="1.4"/><circle cx="17.5" cy="17.5" r="1.6"/><circle cx="12" cy="3.2" r="1.3"/></svg>',
    chemical: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 2a1 1 0 000 2h.3v4.9L4.9 17.4A2.5 2.5 0 007.1 21h9.8a2.5 2.5 0 002.2-3.6L14.2 8.9V4h.3a1 1 0 000-2h-5zm2.5 8.9c.2 0 .4.06.5.2l3.9 6.8H7.6l3.9-6.8c.1-.14.3-.2.5-.2z"/></svg>'
  };

  function showToast(text, good) {
    toast.textContent = text;
    toast.className = "toast show " + (good ? "good" : "bad");
    setTimeout(() => toast.classList.remove("show"), 600);
  }

  function startLevel(n) {
    currentLevel = n;
    const cfg = levelConfig(n);
    totalItems = cfg.itemCount;
    timeLeft = cfg.time;
    score = 0;
    sortedCount = 0;
    milestonesHit = [];
    milestoneBanner.classList.remove("show");

    levelTitle.textContent = "Level " + n;
    difficultyBadge.textContent = DIFFICULTY[difficulty].label;
    difficultyBadge.className = "difficulty-badge " + difficulty;
    scoreVal.textContent = "0";
    progressVal.textContent = "0/" + totalItems;
    timeVal.textContent = timeLeft + "s";
    timeVal.classList.remove("low");

    renderBuckets(cfg.types);
    showScreen("play");
    renderPollutants(cfg);
    gameActive = false; // locked during countdown, no dragging yet
    clearInterval(timerId);
    runCountdown(3, () => {
      gameActive = true;
      clearInterval(timerId);
      timerId = setInterval(tick, 1000);
    });
  }

  function runCountdown(from, onDone) {
    const overlay = document.getElementById("countdownOverlay");
    const numEl = document.getElementById("countdownNumber");
    let n = from;
    overlay.classList.add("show");
    numEl.textContent = n;
    numEl.style.animation = "none";
    void numEl.offsetWidth; // restart animation
    numEl.style.animation = "pulse 1s ease";

    const countdownId = setInterval(() => {
      n -= 1;
      if (n > 0) {
        numEl.textContent = n;
        numEl.style.animation = "none";
        void numEl.offsetWidth;
        numEl.style.animation = "pulse 1s ease";
      } else {
        clearInterval(countdownId);
        overlay.classList.remove("show");
        onDone();
      }
    }, 1000);
  }

  function renderBuckets(types) {
    bucketsRow.innerHTML = "";
    types.forEach(type => {
      const b = document.createElement("div");
      b.className = "bucket " + type + "-bucket";
      b.dataset.type = type;
      b.innerHTML = '<span class="bucket-icon">' + ICON_SVG[type] + '</span>' + ICON_LABEL[type];
      bucketsRow.appendChild(b);
    });
  }

  function randomPos() {
    const size = waterCircle.clientWidth || 220;
    const item = size <= 140 ? 22 : 32;
    // keep within circle bounds: center minus item's own radius minus a margin
    const angle = Math.random() * Math.PI * 2;
    const maxRadius = Math.max(0, size / 2 - item / 2 - 6);
    const radius = Math.random() * maxRadius;
    const cx = size / 2 - item / 2;
    const cy = size / 2 - item / 2;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      item
    };
  }

  function renderPollutants(cfg) {
    waterCircle.querySelectorAll(".pollutant").forEach(el => el.remove());
    for (let i = 0; i < cfg.itemCount; i++) {
      const type = cfg.types[i % cfg.types.length];
      const el = document.createElement("div");
      el.className = "pollutant " + type;
      el.dataset.type = type;
      el.innerHTML = ICON_SVG[type];
      const pos = randomPos();
      el.style.width = pos.item + "px";
      el.style.height = pos.item + "px";
      el.style.left = pos.x + "px";
      el.style.top = pos.y + "px";
      waterCircle.appendChild(el);
      el.addEventListener("pointerdown", onPointerDown);
    }
  }

  function onPointerDown(e) {
    if (!gameActive) return;
    dragEl = e.currentTarget;
    dragEl.setPointerCapture(e.pointerId);
    dragEl.classList.add("dragging");
    const rect = dragEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    dragEl.addEventListener("pointermove", onPointerMove);
    dragEl.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragEl) return;
    // move relative to whole document since it may leave the circle
    dragEl.style.position = "fixed";
    dragEl.style.left = (e.clientX - offsetX) + "px";
    dragEl.style.top = (e.clientY - offsetY) + "px";

    document.querySelectorAll(".bucket").forEach(b => b.classList.remove("hover"));
    // hide dragEl from hit-testing so we see what's underneath it, not itself
    dragEl.style.pointerEvents = "none";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    dragEl.style.pointerEvents = "";
    const bucket = under ? under.closest(".bucket") : null;
    if (bucket) bucket.classList.add("hover");
  }

  function onPointerUp(e) {
    if (!dragEl) return;
    dragEl.classList.remove("dragging");
    document.querySelectorAll(".bucket").forEach(b => b.classList.remove("hover"));

    dragEl.style.pointerEvents = "none";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    dragEl.style.pointerEvents = "";
    const bucket = under ? under.closest(".bucket") : null;
    const type = dragEl.dataset.type;

    if (bucket && bucket.dataset.type === type) {
      playSound("correct");
      score += 100;
      sortedCount++;
      scoreVal.textContent = score;
      progressVal.textContent = sortedCount + "/" + totalItems;
      showToast("+100", true);
      dragEl.remove();
      dragEl = null;
      checkMilestones();
      checkWin();
      return;
    } else if (bucket) {
      playSound("miss");
      const penalty = DIFFICULTY[difficulty].missPenalty;
      score = Math.max(0, score - penalty);
      scoreVal.textContent = score;
      showToast(penalty > 0 ? "-" + penalty : "Miss", false);
      dragEl.classList.add("shake");
      setTimeout(() => dragEl && dragEl.classList.remove("shake"), 300);
    }

    // snap back into circle coords
    dragEl.style.position = "absolute";
    const pos = randomPos();
    dragEl.style.left = pos.x + "px";
    dragEl.style.top = pos.y + "px";
    dragEl.removeEventListener("pointermove", onPointerMove);
    dragEl.removeEventListener("pointerup", onPointerUp);
    dragEl = null;
  }

  function checkWin() {
    if (sortedCount >= totalItems) endGame(true);
  }

  function tick() {
    timeLeft -= 1;
    timeVal.textContent = timeLeft + "s";
    if (timeLeft <= 3) timeVal.classList.add("low");
    if (timeLeft <= 0) endGame(false);
  }

  function endGame(won) {
    gameActive = false;
    clearInterval(timerId);
    document.getElementById("endTitle").textContent = won ? "Level Clear" : "Time's Up";
    document.getElementById("endSubtitle").textContent = won
      ? "All pollutants sorted in time."
      : sortedCount + " of " + totalItems + " sorted. Try again!";
    document.getElementById("endScore").textContent = score;

    const nextBtn = document.getElementById("nextBtn");
    if (won) {
      playSound("win");
      unlockedLevel = Math.max(unlockedLevel, currentLevel + 1);
      nextBtn.style.display = "inline-block";
      nextBtn.textContent = currentLevel < TOTAL_LEVELS ? "Next Level" : "Play Again";
      launchConfetti();
    } else {
      nextBtn.style.display = "none";
    }
    showScreen("end");
  }

  document.getElementById("nextBtn").addEventListener("click", () => {
    playSound("click");
    const next = currentLevel < TOTAL_LEVELS ? currentLevel + 1 : 1;
    startLevel(next);
  });
  document.getElementById("retryBtn").addEventListener("click", () => {
    playSound("click");
    startLevel(currentLevel);
  });
  document.getElementById("homeFromEnd").addEventListener("click", () => {
    playSound("click");
    showScreen("title");
  });

  function launchConfetti() {
    const colors = ["#FFC907", "#7CA9CE", "#4A8B5C", "#EFA97A"];
    const host = screens.play;
    for (let i = 0; i < 24; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animation = "fall " + (1 + Math.random()) + "s ease-in forwards";
      host.appendChild(piece);
      setTimeout(() => piece.remove(), 1600);
    }
    if (!document.getElementById("confetti-kf")) {
      const style = document.createElement("style");
      style.id = "confetti-kf";
      style.textContent = "@keyframes fall { to { transform: translateY(400px) rotate(280deg); opacity: 0; } }";
      document.head.appendChild(style);
    }
  }
})();
