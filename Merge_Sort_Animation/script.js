/* ==========================================================================
   MERGE SORT VISUALIZER — SCRIPT
   A beginner-friendly, fully commented implementation of an animated
   Merge Sort using vanilla JavaScript. No frameworks, no dependencies.
   ========================================================================== */

/* ------------------------------------------------------------------------
   1. DOM REFERENCES
   ------------------------------------------------------------------------ */
const visualizerEl = document.getElementById("visualizer");
const stepMessageEl = document.getElementById("stepMessage");
const terminalEl = document.getElementById("terminal");

const generateBtn = document.getElementById("generateBtn");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const resetBtn = document.getElementById("resetBtn");

const speedSlider = document.getElementById("speedSlider");
const speedValueLabel = document.getElementById("speedValueLabel");
const sizeSlider = document.getElementById("sizeSlider");
const sizeValueLabel = document.getElementById("sizeValueLabel");

const progressFill = document.getElementById("progressFill");
const progressPercent = document.getElementById("progressPercent");
const phaseLabel = document.getElementById("phaseLabel");
const timerDisplay = document.getElementById("timerDisplay");

const statLevel = document.getElementById("statLevel");
const statSubarray = document.getElementById("statSubarray");
const statComparison = document.getElementById("statComparison");
const statComparisons = document.getElementById("statComparisons");
const statAccesses = document.getElementById("statAccesses");
const statMerges = document.getElementById("statMerges");

const statePill = document.getElementById("statePill");
const stateDot = document.getElementById("stateDot");
const stateLabel = document.getElementById("stateLabel");

const themeToggle = document.getElementById("themeToggle");

const completionToast = document.getElementById("completionToast");
const completionSub = document.getElementById("completionSub");
const completionClose = document.getElementById("completionClose");
const confettiLayer = document.getElementById("confettiLayer");

/* ------------------------------------------------------------------------
   2. APPLICATION STATE
   ------------------------------------------------------------------------
   states: "IDLE" | "SORTING" | "PAUSED" | "COMPLETED"
   ------------------------------------------------------------------------ */
const appState = {
  status: "IDLE",
  paused: false,
  aborted: false, // set true when Reset is pressed, to unwind the recursion
};

let array = [];          // the working array being sorted (bar heights follow this)
let originalArray = [];  // a backup copy used to restore on Reset

let stats = {
  comparisons: 0,
  accesses: 0,
  merges: 0,
};

let writesSoFar = 0; // used to drive the progress bar
let totalWrites = 1;  // total writes expected for the current array size

let timerIntervalId = null;
let timerStart = 0;
let timerElapsedFrozen = 0;

/* ------------------------------------------------------------------------
   3. ARRAY GENERATION & RENDERING
   ------------------------------------------------------------------------ */

// Creates a brand-new random array sized by the Array Size slider.
function generateArray() {
  const size = Number(sizeSlider.value);
  const newArray = [];
  for (let i = 0; i < size; i++) {
    newArray.push(Math.floor(Math.random() * 95) + 5); // values 5–99
  }
  array = newArray;
  originalArray = [...newArray];
  renderArray();
  resetStatsAndPanels();
}

// Rebuilds the bar elements in the DOM to match the current `array`.
function renderArray() {
  visualizerEl.innerHTML = "";
  const maxValue = Math.max(...array, 1);

  array.forEach((value, index) => {
    const bar = document.createElement("div");
    bar.className = "bar state-normal";
    bar.dataset.index = String(index);
    bar.style.height = `${(value / maxValue) * 100}%`;

    const valueLabel = document.createElement("span");
    valueLabel.className = "bar__value";
    valueLabel.textContent = value;

    bar.appendChild(valueLabel);
    visualizerEl.appendChild(bar);
  });
}

// Updates a single bar's visual height + label to match `array[index]`.
function renderBarValue(index) {
  const bar = visualizerEl.children[index];
  if (!bar) return;
  const maxValue = Math.max(...array, 1);
  bar.style.height = `${(array[index] / maxValue) * 100}%`;
  bar.querySelector(".bar__value").textContent = array[index];
}

// Applies a color-state class to a contiguous range of bars [from, to].
function setRangeState(from, to, stateClass) {
  for (let i = from; i <= to; i++) {
    const bar = visualizerEl.children[i];
    if (!bar) continue;
    bar.className = `bar ${stateClass}`;
  }
}

// Applies a color-state class to a single bar by index.
function setBarState(index, stateClass) {
  const bar = visualizerEl.children[index];
  if (!bar) return;
  bar.className = `bar ${stateClass}`;
}

/* ------------------------------------------------------------------------
   4. TIMING HELPERS (speed, pause, abort)
   ------------------------------------------------------------------------ */

// Maps the Speed slider (1–10) to a millisecond delay (slower value = longer delay).
function getSpeedDelay() {
  const value = Number(speedSlider.value); // 1 (slow) .. 10 (fast)
  const minDelay = 60;   // fastest
  const maxDelay = 700;  // slowest
  const ratio = (value - 1) / 9;
  return Math.round(maxDelay - ratio * (maxDelay - minDelay));
}

// A sleep() that can be interrupted quickly by Reset, and that pauses
// (without losing progress) whenever appState.paused is true.
function sleep(ms) {
  return new Promise((resolve) => {
    const pollStep = 40; // check pause/abort frequently so Reset feels instant
    let elapsed = 0;

    function tick() {
      if (appState.aborted) {
        resolve();
        return;
      }
      if (appState.paused) {
        setTimeout(tick, pollStep);
        return;
      }
      if (elapsed >= ms) {
        resolve();
        return;
      }
      const step = Math.min(pollStep, ms - elapsed);
      setTimeout(() => {
        elapsed += step;
        tick();
      }, step);
    }
    tick();
  });
}

// A custom error used purely as a signal to unwind the recursive mergeSort
// call stack safely when Reset is pressed mid-sort.
class SortAbortedError extends Error {
  constructor() {
    super("SORT_ABORTED");
    this.name = "SortAbortedError";
  }
}

// The main delay used between meaningful animation steps (comparisons,
// placements, divide announcements). Respects both speed and pause state.
async function delay() {
  await sleep(getSpeedDelay());
  if (appState.aborted) throw new SortAbortedError();
}

// A shorter delay used for lighter visual transitions (range highlighting).
async function quickDelay() {
  await sleep(Math.max(30, Math.round(getSpeedDelay() / 2)));
  if (appState.aborted) throw new SortAbortedError();
}

/* ------------------------------------------------------------------------
   5. STEP MESSAGE / INFO PANEL / STATS RENDERING
   ------------------------------------------------------------------------ */

function updateStepMessage(message) {
  stepMessageEl.innerHTML = `${escapeHtml(message)}<span class="cursor"></span>`;
  // Keep the terminal scrolled to the latest line.
  terminalEl.scrollTop = terminalEl.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function updateInfoPanel({ level, subarray, comparison, phase }) {
  if (level !== undefined) statLevel.textContent = String(level);
  if (subarray !== undefined) statSubarray.textContent = subarray;
  if (comparison !== undefined) statComparison.textContent = comparison;
  if (phase !== undefined) phaseLabel.textContent = `Phase: ${phase}`;
}

function updateStatsPanel() {
  statComparisons.textContent = String(stats.comparisons);
  statAccesses.textContent = String(stats.accesses);
  statMerges.textContent = String(stats.merges);
}

function updateProgress() {
  const pct = Math.min(100, Math.round((writesSoFar / totalWrites) * 100));
  progressFill.style.width = `${pct}%`;
  progressPercent.textContent = `${pct}%`;
}

/* ------------------------------------------------------------------------
   6. STATE MACHINE / BUTTON MANAGEMENT
   ------------------------------------------------------------------------ */

function setAppStatus(status) {
  appState.status = status;

  stateLabel.textContent = status;
  stateDot.className = "state-pill__dot";
  if (status === "SORTING") stateDot.classList.add("is-sorting");
  if (status === "PAUSED") stateDot.classList.add("is-paused");
  if (status === "COMPLETED") stateDot.classList.add("is-completed");

  updateControlsState();
}

function updateControlsState() {
  const { status } = appState;

  generateBtn.disabled = status === "SORTING" || status === "PAUSED";
  startBtn.disabled = status === "SORTING" || status === "PAUSED";
  pauseBtn.disabled = status !== "SORTING";
  resumeBtn.disabled = status !== "PAUSED";
  resetBtn.disabled = status === "IDLE";
  sizeSlider.disabled = status === "SORTING" || status === "PAUSED";
  // Speed slider stays enabled at all times, including mid-sort and while paused.
}

/* ------------------------------------------------------------------------
   7. TIMER
   ------------------------------------------------------------------------ */

function startTimer() {
  timerStart = Date.now() - timerElapsedFrozen;
  clearInterval(timerIntervalId);
  timerIntervalId = setInterval(() => {
    const elapsed = Date.now() - timerStart;
    timerDisplay.textContent = `${elapsed} ms`;
  }, 100);
}

function stopTimer() {
  clearInterval(timerIntervalId);
  timerIntervalId = null;
  timerElapsedFrozen = Date.now() - timerStart;
}

function resetTimer() {
  clearInterval(timerIntervalId);
  timerIntervalId = null;
  timerElapsedFrozen = 0;
  timerDisplay.textContent = "0 ms";
}

/* ------------------------------------------------------------------------
   8. PROGRESS PRE-COMPUTATION
   ------------------------------------------------------------------------
   Merge Sort writes every element back into the array once per recursion
   level it participates in. We simulate the same left/right split used by
   mergeSort() to count the exact number of writes ahead of time, so the
   progress bar can reach a precise 100% exactly when sorting finishes.
   ------------------------------------------------------------------------ */
function countTotalWrites(left, right) {
  if (left >= right) return 0;
  const mid = Math.floor((left + right) / 2);
  return (
    countTotalWrites(left, mid) +
    countTotalWrites(mid + 1, right) +
    (right - left + 1)
  );
}

/* ------------------------------------------------------------------------
   9. MERGE SORT (recursive, animated)
   ------------------------------------------------------------------------ */

async function mergeSort(left, right, depth) {
  if (appState.aborted) throw new SortAbortedError();

  if (left >= right) {
    if (left === right) {
      updateInfoPanel({ level: depth, subarray: `[${left}]`, phase: "Divide" });
      setBarState(left, "state-subarray");
      updateStepMessage(`Subarray [${left}] contains one element — already sorted`);
      await quickDelay();
      setBarState(left, "state-sorted");
    }
    return;
  }

  // --- DIVIDE PHASE -------------------------------------------------
  updateInfoPanel({ level: depth, subarray: `[${left}-${right}]`, comparison: "—", phase: "Divide" });
  setRangeState(left, right, "state-subarray");
  updateStepMessage(`Dividing array [${left} - ${right}]`);
  await quickDelay();

  const mid = Math.floor((left + right) / 2);
  const leftValues = array.slice(left, mid + 1);
  const rightValues = array.slice(mid + 1, right + 1);
  updateStepMessage(
    `Splitting into left half [${leftValues.join(", ")}] and right half [${rightValues.join(", ")}]`
  );
  setRangeState(left, mid, "state-subarray-left");
  setRangeState(mid + 1, right, "state-subarray-right");
  await quickDelay();

  await mergeSort(left, mid, depth + 1);
  await mergeSort(mid + 1, right, depth + 1);

  await merge(left, mid, right, depth);
}

async function merge(left, mid, right, depth) {
  if (appState.aborted) throw new SortAbortedError();

  updateInfoPanel({ level: depth, subarray: `[${left}-${right}]`, phase: "Merge" });
  setRangeState(left, mid, "state-subarray-left");
  setRangeState(mid + 1, right, "state-subarray-right");
  updateStepMessage(`Merging subarrays [${left}-${mid}] and [${mid + 1}-${right}]`);
  await quickDelay();

  const leftValues = array.slice(left, mid + 1);
  const rightValues = array.slice(mid + 1, right + 1);
  stats.accesses += leftValues.length + rightValues.length;
  updateStatsPanel();

  let i = 0; // pointer into leftValues
  let j = 0; // pointer into rightValues
  let k = left; // write pointer into the main array

  while (i < leftValues.length && j < rightValues.length) {
    if (appState.aborted) throw new SortAbortedError();

    // Highlight the two elements currently being compared.
    setBarState(left + i, "state-comparing");
    setBarState(mid + 1 + j, "state-comparing");
    stats.comparisons++;
    updateInfoPanel({ comparison: `${leftValues[i]} vs ${rightValues[j]}` });
    updateStepMessage(`Comparing ${leftValues[i]} and ${rightValues[j]}`);
    updateStatsPanel();
    await delay();
    if (appState.aborted) throw new SortAbortedError();

    let picked;
    if (leftValues[i] <= rightValues[j]) {
      picked = leftValues[i];
      i++;
    } else {
      picked = rightValues[j];
      j++;
    }

    updateStepMessage(`Selecting ${picked}`);
    setBarState(k, "state-moving");
    array[k] = picked;
    stats.accesses++;
    renderBarValue(k);
    updateStatsPanel();
    await delay();
    if (appState.aborted) throw new SortAbortedError();

    updateStepMessage(`Placing ${picked} into position ${k}`);
    writesSoFar++;
    updateProgress();
    k++;
  }

  // Drain any remaining elements from the left half.
  while (i < leftValues.length) {
    if (appState.aborted) throw new SortAbortedError();
    setBarState(k, "state-moving");
    array[k] = leftValues[i];
    stats.accesses++;
    renderBarValue(k);
    updateStepMessage(`Placing remaining ${leftValues[i]} into position ${k}`);
    updateStatsPanel();
    writesSoFar++;
    updateProgress();
    await quickDelay();
    i++;
    k++;
  }

  // Drain any remaining elements from the right half.
  while (j < rightValues.length) {
    if (appState.aborted) throw new SortAbortedError();
    setBarState(k, "state-moving");
    array[k] = rightValues[j];
    stats.accesses++;
    renderBarValue(k);
    updateStepMessage(`Placing remaining ${rightValues[j]} into position ${k}`);
    updateStatsPanel();
    writesSoFar++;
    updateProgress();
    await quickDelay();
    j++;
    k++;
  }

  stats.merges++;
  updateStatsPanel();
  setRangeState(left, right, "state-sorted");
  updateInfoPanel({ comparison: "—" });
  updateStepMessage(`Merge completed for range [${left}-${right}]`);
  await quickDelay();
}

/* ------------------------------------------------------------------------
   10. CONTROL HANDLERS
   ------------------------------------------------------------------------ */

async function startSorting() {
  if (appState.status === "SORTING") return; // guard against double-start

  appState.aborted = false;
  appState.paused = false;
  setAppStatus("SORTING");

  // Reset stats/progress for a fresh run only if we're starting clean
  // (i.e. not resuming — resuming is handled by resumeSorting()).
  stats = { comparisons: 0, accesses: 0, merges: 0 };
  updateStatsPanel();
  writesSoFar = 0;
  totalWrites = Math.max(1, countTotalWrites(0, array.length - 1));
  updateProgress();
  updateInfoPanel({ level: 0, subarray: "—", comparison: "—", phase: "Divide" });
  updateStepMessage("Starting Merge Sort...");

  resetTimer();
  startTimer();

  try {
    await mergeSort(0, array.length - 1, 0);

    // Sorting finished successfully.
    writesSoFar = totalWrites;
    updateProgress();
    setRangeState(0, array.length - 1, "state-sorted");
    setAppStatus("COMPLETED");
    stopTimer();
    showCompletionMessage();
  } catch (err) {
    if (err instanceof SortAbortedError) {
      // Reset was pressed — resetSorting() already handles cleanup.
    } else {
      console.error("Unexpected error during sorting:", err);
    }
  }
}

function pauseSorting() {
  if (appState.status !== "SORTING") return;
  appState.paused = true;
  setAppStatus("PAUSED");
  updateStepMessage("Paused. Click Resume to continue from this exact step.");
}

function resumeSorting() {
  if (appState.status !== "PAUSED") return;
  appState.paused = false;
  setAppStatus("SORTING");
  updateStepMessage("Resuming Merge Sort...");
  startTimer(); // continues from the frozen elapsed time
}

function resetSorting() {
  // Signal any in-flight recursion to unwind (sleep() checks this quickly).
  appState.aborted = true;
  appState.paused = false;

  // Give the animation loop a brief moment to notice the abort flag and
  // stop before we wipe state — this prevents duplicate async loops.
  setTimeout(() => {
    appState.aborted = false;
    setAppStatus("IDLE");

    array = [...originalArray];
    renderArray();

    stats = { comparisons: 0, accesses: 0, merges: 0 };
    updateStatsPanel();

    writesSoFar = 0;
    totalWrites = 1;
    updateProgress();

    updateInfoPanel({ level: 0, subarray: "—", comparison: "—", phase: "Idle" });
    updateStepMessage('Ready. Click "Start Sorting" to begin.');

    stopTimer();
    resetTimer();

    hideCompletionMessage();
  }, 90);
}

function handleGenerateArray() {
  if (appState.status === "SORTING" || appState.status === "PAUSED") return;
  generateArray();
  setAppStatus("IDLE");
  hideCompletionMessage();
}

function handleSizeChange() {
  sizeValueLabel.textContent = sizeSlider.value;
  if (appState.status === "IDLE" || appState.status === "COMPLETED") {
    generateArray();
    setAppStatus("IDLE");
    hideCompletionMessage();
  }
}

function handleSpeedChange() {
  const value = Number(speedSlider.value);
  let label = "Medium";
  if (value <= 3) label = "Slow";
  else if (value >= 8) label = "Fast";
  speedValueLabel.textContent = label;
}

/* ------------------------------------------------------------------------
   11. STATS RESET HELPER (used by generateArray)
   ------------------------------------------------------------------------ */
function resetStatsAndPanels() {
  stats = { comparisons: 0, accesses: 0, merges: 0 };
  updateStatsPanel();
  writesSoFar = 0;
  totalWrites = 1;
  updateProgress();
  updateInfoPanel({ level: 0, subarray: "—", comparison: "—", phase: "Idle" });
  updateStepMessage('Ready. Click "Start Sorting" to begin.');
  resetTimer();
}

/* ------------------------------------------------------------------------
   12. COMPLETION MESSAGE + CONFETTI
   ------------------------------------------------------------------------ */
function showCompletionMessage() {
  const elapsed = timerElapsedFrozen;
  completionSub.textContent = `Sorted ${array.length} elements in ${elapsed} ms`;
  completionToast.classList.add("is-visible");
  launchConfetti();
}

function hideCompletionMessage() {
  completionToast.classList.remove("is-visible");
}

function launchConfetti() {
  const colors = [
    "var(--bar-normal)",
    "var(--bar-subarray)",
    "var(--bar-comparing)",
    "var(--bar-moving)",
    "var(--bar-sorted)",
  ];
  const pieceCount = 70;

  for (let i = 0; i < pieceCount; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}vw`;
    piece.style.backgroundColor = colors[i % colors.length];
    piece.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    confettiLayer.appendChild(piece);

    // Clean up each piece once its fall animation finishes.
    piece.addEventListener("animationend", () => piece.remove());
  }
}

/* ------------------------------------------------------------------------
   13. THEME (dark / light) WITH PERSISTENCE
   ------------------------------------------------------------------------ */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("mergeSortVisualizerTheme", theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
}

function loadSavedTheme() {
  const saved = localStorage.getItem("mergeSortVisualizerTheme");
  if (saved === "dark" || saved === "light") {
    applyTheme(saved);
  }
}

/* ------------------------------------------------------------------------
   14. EVENT WIRING
   ------------------------------------------------------------------------ */
generateBtn.addEventListener("click", handleGenerateArray);
startBtn.addEventListener("click", startSorting);
pauseBtn.addEventListener("click", pauseSorting);
resumeBtn.addEventListener("click", resumeSorting);
resetBtn.addEventListener("click", resetSorting);

speedSlider.addEventListener("input", handleSpeedChange);
sizeSlider.addEventListener("input", handleSizeChange);

themeToggle.addEventListener("click", toggleTheme);
completionClose.addEventListener("click", hideCompletionMessage);

/* ------------------------------------------------------------------------
   15. INITIALIZATION
   ------------------------------------------------------------------------ */
function init() {
  loadSavedTheme();
  handleSpeedChange();
  sizeValueLabel.textContent = sizeSlider.value;
  generateArray();
  setAppStatus("IDLE");
}

init();
