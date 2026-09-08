/* =========================================================
   GBET Lucky Draw
   ---------------------------------------------------------
   users.json holds everything: names[0] is tonight's winner,
   names[1..8] fill the slots around it, winner_history feeds
   the overlay. Publish the file before 20:00 and the page
   reveals it at 20:00.

   Three things differ from the original build:
     - the file is read again as the reel lands, so a tab
       opened this morning shows the same name as one opened
       a minute ago
     - the clock comes from the server that served the file,
       not from worldtimeapi.org
     - the file is fetched from this same site rather than
       raw.githubusercontent.com, which is rate-limited
   ========================================================= */

const DATA_URL   = 'users.json';   // same origin — served by the CDN, not raw.githubusercontent
const DRAW_TIME  = 72000;   // 20:00:00, in seconds past local midnight
const DRAW_GRACE = 10;      // seconds after DRAW_TIME that still trigger the spin
const SPIN_TICK  = 50;      // ms between name changes while spinning
const SPIN_TIME  = 5000;    // ms the reel runs before landing

/* ---------- Elements ---------- */

const movingWeb        = document.querySelector('.movingWeb');
const movingMobile     = document.querySelector('.movingMobile');
const historyContainer = document.querySelector('.historyContainer');
const winnerSlot       = document.getElementById('userNames');
const nameSlots        = document.querySelectorAll('.namesContainer');   // 8 slots

/* ---------- State ---------- */

let data       = null;    // users.json once loaded
let spinTimer  = null;
let isSpinning = false;
let hasRevealed = false;

let hours = 0, minutes = 0, seconds = 0;   // Manila wall clock
let clockReady = null;

// Left undefined on purpose: updateCountdown() only runs at the end of the
// first tick, and an initial 0 here would fire a draw immediately.
let secondsToDraw;
let cdHours = 99, cdMinutes = 99, cdSeconds = 99;

/* ---------- Background pulse ---------- */
/* Both layers toggle a .moved / .movedMobile class every second; the CSS
   transition is 1.3s, so the scale never fully settles — that overlap is
   what produces the slow breathing effect. */

setInterval(() => movingMobile.classList.toggle('movedMobile'), 1000);
setInterval(() => movingWeb.classList.toggle('moved'), 1000);

/* ---------- Winner history overlay ---------- */

function showHistory() {
  document.querySelector('.winnerHistoryContainer').classList.add('showContainer');
  setTimeout(() => historyContainer.classList.add('opacityOne'), 200);
}

function hideContainer(event) {
  if (event.target !== event.currentTarget) return;   // ignore clicks inside the panel
  const overlay = document.querySelector('.winnerHistoryContainer');
  historyContainer.classList.remove('opacityOne');
  setTimeout(() => overlay.classList.remove('showContainer'), 200);
}

/* ---------- Clock ---------- */

// Split a moment into Manila hours, minutes and seconds. Asia/Manila has no
// DST, but go through Intl rather than assuming a fixed +8.
function manilaParts(moment) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(moment);

  const get = type => Number(parts.find(p => p.type === type).value);
  return { hours: get('hour') % 24, minutes: get('minute'), seconds: get('second') };
}

// Every HTTP response carries a Date header set by the server that sent it.
// That gives us an authoritative clock from the request we were making
// anyway — no second request, and no third-party API to go down. Falls back
// to the device clock, which is only wrong if the viewer's own clock is.
let clockMoment = null;   // the instant the clock was seeded from

function startClock(response) {
  const header = response && response.headers.get('date');
  let moment = header ? new Date(header) : new Date();
  if (Number.isNaN(moment.getTime())) moment = new Date();

  clockMoment = moment;
  const now = manilaParts(moment);
  hours = now.hours;
  minutes = now.minutes;
  seconds = now.seconds;
  clockReady = header ? 'Server' : 'Device';
}

// Today in Manila, in the same shape winner_history uses: "September 8,2026".
function manilaToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric'
  }).formatToParts(clockMoment || new Date());

  const get = type => parts.find(p => p.type === type).value;
  return `${get('month')} ${get('day')},${get('year')}`;
}

// The history has drifted through several date formats over the years —
// "September 5,2024", "September 5, 2024", "Sept. 5, 2024". Compare loosely
// so a stray space doesn't decide whether a name leaks early.
function sameDate(a, b) {
  const normalise = value => String(value).toLowerCase().replace(/\s+/g, '');
  return normalise(a) === normalise(b);
}

/* ---------- Load the draw data ---------- */

function historyRow(entry) {
  const row = document.createElement('div');
  row.className = 'previousWinner';

  const name = document.createElement('div');
  name.className = 'historyName';
  name.innerHTML = `<strong>${entry.name}</strong>`;

  const date = document.createElement('div');
  date.className = 'historyDate';
  date.textContent = entry.date;

  row.appendChild(name);
  row.appendChild(date);
  return row;
}

function renderHistory(entries) {
  entries.forEach(entry => historyContainer.appendChild(historyRow(entry)));
}

function beforeDraw() {
  return (hours * 3600 + minutes * 60 + seconds) < DRAW_TIME;
}

// Tonight's winner is published to users.json before 20:00, history entry and
// all. Rendering the whole list on load would put that name in the history
// panel hours early — one click from the board that is still counting down.
// So hold tonight's entry back and add it at the reveal, which is when it
// actually became history.
//
// "Tonight's" is decided by the date, not by matching names[0]: between
// midnight and the daily update, names[0] is still last night's winner, and
// that entry is real history that should stay on show.
let historyHeld = false;

// Read the entry from `data` rather than remembering it, so that if refresh()
// picked up a newer users.json as the reel landed, the panel gets that file's
// winner rather than the one this tab loaded hours ago.
function releaseHistory() {
  if (!historyHeld) return;
  historyHeld = false;

  const top = data && data.winner_history && data.winner_history[0];
  if (top && top.name === data.names[0]) {
    historyContainer.prepend(historyRow(top));
  }
}

fetch(DATA_URL)
  .then(response => {
    if (!response.ok) throw new Error('Network response was not ok');
    startClock(response);              // the clock rides along with the data
    return response.json();
  })
  .then(json => {
    data = json;

    const entries = json.winner_history;
    const top = entries[0];

    // Dated today, matching the name about to be revealed, and the draw has
    // not run yet — that is tonight's entry and nobody should see it until
    // 20:00. Anything else is genuine history and renders normally.
    const isTonights = top
      && sameDate(top.date, manilaToday())
      && top.name === json.names[0]
      && beforeDraw();

    if (isTonights) {
      historyHeld = true;
      renderHistory(entries.slice(1));
    } else {
      renderHistory(entries);
    }
  })
  .catch(error => {
    console.error('There was a problem with the fetch operation:', error);
    startClock(null);                  // still count down, even if the file failed
  });

/* ---------- Reveal ---------- */

function moveLogo() {
  document.querySelector('.logo').classList.add('moveLogo');
}

function addGlow() {
  document.getElementById('userNames').classList.add('glowingWhite');
}

function pickRandom() {
  return data.names[Math.floor(Math.random() * data.names.length)];
}

// Fills the board with the published result: names[0] is the winner,
// names[1..8] fill the eight surrounding slots.
function showResult() {
  winnerSlot.innerText = `${data.names[0]}`;
  for (let i = 0; i < nameSlots.length; i++) {
    nameSlots[i].innerText = data.names[i + 1];
  }
}

// Read users.json again. A tab opened at 18:00 is holding the file as it
// looked at 18:00 — without this it would land on last night's winner while
// a tab opened at 19:45 lands on tonight's.
async function refresh() {
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) data = await response.json();
  } catch (error) {
    console.error('Could not refresh before the reveal:', error);
  }
}

function getRandomName() {
  clearInterval(spinTimer);
  isSpinning = true;
  moveLogo();

  spinTimer = setInterval(() => {
    winnerSlot.innerText = pickRandom();
    nameSlots.forEach(slot => { slot.innerText = pickRandom(); });
  }, SPIN_TICK);

  setTimeout(async () => {
    if (!hasRevealed) await refresh();

    clearInterval(spinTimer);
    isSpinning = false;

    // Repaint the whole board on every landing, not just the first. The
    // 10-second grace window restarts the reel once a second, and each of
    // those later spinners scribbles random pool names over the eight slots
    // on its way past — without this they stay random after the draw.
    showResult();

    if (!hasRevealed) {
      addGlow();
      hasRevealed = true;
      celebrate();
      releaseHistory();          // tonight's entry joins the panel now, not earlier
    }
  }, SPIN_TIME);
}

/* ---------- Celebration ---------- */

function celebrate() {
  document.getElementById('myAudio').play();

  const end = Date.now() + 10000;
  const colors = ['#bb0000', '#ffffff'];

  (function frame() {
    confetti({ particleCount: 2, angle: 60,  spread: 55, origin: { x: 0 }, colors });
    confetti({ particleCount: 2, angle: 120, spread: 55, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

/* ---------- Tick ---------- */

// Seconds remaining until the next 20:00, plus the split-out countdown digits.
function updateCountdown() {
  let remaining = DRAW_TIME - (hours * 3600 + minutes * 60 + seconds);
  if (remaining < 0) remaining += 86400;

  secondsToDraw = remaining;
  cdHours   = Math.floor(remaining / 3600);
  cdMinutes = Math.floor((remaining % 3600) / 60);
  cdSeconds = remaining % 60;
}

function pad(value) {
  return value < 10 ? `0${value}` : value;
}

function updateTime() {
  if (!clockReady || !data) return;   // wait for users.json and the clock it carried

  // Advance the local counter one second.
  seconds++;
  if (seconds >= 60) {
    seconds = 0;
    minutes++;
    if (minutes >= 60) {
      minutes = 0;
      hours++;
      if (hours >= 24) hours = 0;
    }
  }

  if (secondsToDraw === 0) {
    getRandomName();                                   // exactly 20:00:00
  } else if (secondsToDraw > 86400 - DRAW_GRACE) {
    getRandomName();                                   // within 10s after 20:00
  } else if (secondsToDraw < 86400 - DRAW_GRACE && secondsToDraw > DRAW_TIME && !isSpinning) {
    // Between 20:00 and midnight — the result is already published, show it flat.
    if (!hasRevealed) {
      moveLogo();
      addGlow();
      showResult();
      hasRevealed = true;
      celebrate();
      releaseHistory();
    }
  } else if (secondsToDraw < DRAW_TIME && !isSpinning) {
    // Midnight to 20:00 — count down.
    winnerSlot.innerText = `Next draw: ${pad(cdHours)}:${pad(cdMinutes)}:${pad(cdSeconds)}`;
    for (let i = 0; i < nameSlots.length; i++) nameSlots[i].innerText = '';
  }

  updateCountdown();
}

setInterval(updateTime, 1000);
