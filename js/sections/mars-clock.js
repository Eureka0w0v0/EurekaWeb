/* Coordinated Mars Time next to the Mars address. */
/* ═══════════════════════════════════════════════════════════════
   The address line says the owner lives on Mars. This makes that
   literally true by putting the local time next to it.
   ═══════════════════════════════════════════════════════════════ */

/* Mars Sol Date, the Martian equivalent of the Julian Date: whole days since
   a 1873 epoch, counted in sols rather than days.

   MSD = (JD_TT - 2405522.0028779) / 1.0274912517

   The divisor is the one number that matters -- a Martian solar day is
   1.0274912517 Earth days, or 24h 39m 35.244s. Everything else is epoch
   bookkeeping.

   Terrestrial Time, not UTC: TT = TAI + 32.184s, and TAI is currently UTC plus
   37 leap seconds. That 69.184s offset is worth about 0.0008 of a sol, so
   dropping it would put the clock a minute out. LEAP_SECONDS has to be bumped
   if IERS ever adds another; they have not since 2016, and the current
   proposal is to stop adding them by 2035. Being one second stale here moves
   the display by one second, so this is a comment, not an alarm. */
const MARS_SOL_IN_EARTH_DAYS = 1.0274912517;
const MSD_EPOCH_JD_TT = 2405522.0028779;
const UNIX_EPOCH_AS_JD = 2440587.5;
const LEAP_SECONDS = 37;
const TT_MINUS_TAI = 32.184;

function marsSolDate(date) {
  const jdUTC = UNIX_EPOCH_AS_JD + date.getTime() / 86400000;
  const jdTT = jdUTC + (LEAP_SECONDS + TT_MINUS_TAI) / 86400;
  return (jdTT - MSD_EPOCH_JD_TT) / MARS_SOL_IN_EARTH_DAYS;
}

/* Coordinated Mars Time: the fractional part of the sol, as a 24-hour clock.
   Mars hours are the sol split 24 ways, so a Mars second runs 2.75% longer
   than an Earth one -- which is why the ticker below waits 1027ms, not 1000. */
function marsCoordinatedTime(date = new Date()) {
  const sol = marsSolDate(date);
  const hours = (sol - Math.floor(sol)) * 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const sec = Math.floor(((hours - h) * 60 - m) * 60);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/* Ticks only while the card is on screen and the tab is in front, the same
   rule the welcome canvas and the brain scene follow. A clock nobody is
   looking at is exactly the kind of thing that quietly costs a wakeup a
   second for as long as the page stays open. */
export function initMarsClock() {
  const clock = document.querySelector("#mars-clock");
  const card = document.querySelector("#feature-card");
  if (!clock || !card) {
    return;
  }

  let timer = 0;
  let onScreen = true;

  const render = () => {
    clock.textContent = `MTC ${marsCoordinatedTime()}`;
    clock.hidden = false;
  };

  const start = () => {
    if (timer) {
      return;
    }
    render();
    /* One Mars second in Earth milliseconds. Ticking at 1000 would show the
       same second twice every 37 ticks and look like a stutter. */
    timer = window.setInterval(render, Math.round(1000 * MARS_SOL_IN_EARTH_DAYS));
  };

  const stop = () => {
    if (timer) {
      window.clearInterval(timer);
      timer = 0;
    }
  };

  if (typeof IntersectionObserver === "function") {
    const observer = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        if (onScreen && !document.hidden) {
          start();
        } else {
          stop();
        }
      },
      { rootMargin: "120px 0px", threshold: 0 }
    );
    observer.observe(card);
  } else {
    start();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !onScreen) {
      stop();
    } else {
      start();
    }
  });

  /* Paint once regardless, so the line is never blank on a browser where the
     observer has not fired yet. */
  render();
}
