const API = "https://codeforces.com/api/";
const DAYS = 30;
const MAX_SUBMISSIONS = 1000;

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let lastApiCall = 0;

async function cf(method, params = {}) {
  const now = Date.now();
  const wait = Math.max(0, 2100 - (now - lastApiCall));
  if (wait) await sleep(wait);
  const url = new URL(API + method);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  lastApiCall = Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== "OK") throw new Error(data.comment || "Codeforces API error");
  return data.result;
}

function rankName(rating) {
  if (rating < 1200) return "Newbie";
  if (rating < 1400) return "Pupil";
  if (rating < 1600) return "Specialist";
  if (rating < 1900) return "Expert";
  if (rating < 2100) return "Candidate Master";
  if (rating < 2300) return "Master";
  if (rating < 2400) return "International Master";
  if (rating < 2600) return "Grandmaster";
  if (rating < 3000) return "International Grandmaster";
  return "Legendary Grandmaster";
}

function momentumRank(score) {
  // Generous calibration: strong recent form can move well above official rank.
  if (score < 16) return "Newbie";
  if (score < 29) return "Pupil";
  if (score < 43) return "Specialist";
  if (score < 57) return "Expert";
  if (score < 69) return "Candidate Master";
  if (score < 79) return "Master";
  if (score < 87) return "International Master";
  if (score < 94) return "Grandmaster";
  if (score < 98) return "International Grandmaster";
  return "Legendary Grandmaster";
}

function rankFromRating(rating) {
  if (rating < 1200) return "Newbie";
  if (rating < 1400) return "Pupil";
  if (rating < 1600) return "Specialist";
  if (rating < 1900) return "Expert";
  if (rating < 2100) return "Candidate Master";
  if (rating < 2300) return "Master";
  if (rating < 2400) return "International Master";
  if (rating < 2600) return "Grandmaster";
  if (rating < 3000) return "International Grandmaster";
  return "Legendary Grandmaster";
}


function ratingColor(rank) {
  const map = {
    "Newbie":"#b0b0b0",
    "Pupil":"#7bc8ff",
    "Specialist":"#55e6a5",
    "Expert":"#8aa7ff",
    "Candidate Master":"#c77dff",
    "Master":"#ff62d2",
    "International Master":"#ff626f",
    "Grandmaster":"#ff4d4d",
    "International Grandmaster":"#ff4d4d",
    "Legendary Grandmaster":"#ffcc4d"
  };
  return map[rank] || "#fff";
}

function momentumRatingColor(rating) {
  return ratingColor(rankFromRating(rating));
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString();
}

function daysAgo(sec) {
  return Date.now()/1000 - sec <= DAYS * 86400;
}

function percentileScore(value, low, high) {
  return Math.max(0, Math.min(1, (value-low)/(high-low)));
}

function calculateMomentum(profile, submissions, ratings) {
  const recentSubs = submissions.filter(s => daysAgo(s.creationTimeSeconds));
  const accepted = recentSubs.filter(s => s.verdict === "OK");

  const uniqueAccepted = new Map();
  for (const s of accepted) {
    const p = s.problem;
    const key = `${p.contestId ?? "gym"}:${p.index ?? p.name}`;
    if (!uniqueAccepted.has(key)) uniqueAccepted.set(key, p);
  }

  const problems = [...uniqueAccepted.values()];
  const ratedProblems = problems.filter(p => Number.isFinite(p.rating));
  const avgProblemRating = ratedProblems.length
    ? ratedProblems.reduce((a,p)=>a+p.rating,0)/ratedProblems.length : 0;
  const maxProblemRating = ratedProblems.length
    ? Math.max(...ratedProblems.map(p=>p.rating)) : 0;

  const activeDays = new Set(
    recentSubs.map(s => new Date(s.creationTimeSeconds*1000).toISOString().slice(0,10))
  ).size;

  const recentRatings = ratings.filter(r => daysAgo(r.ratingUpdateTimeSeconds));
  const contestCount = recentRatings.length;
  const avgContestRating = contestCount
    ? recentRatings.reduce((a,r)=>a+r.newRating,0)/contestCount : profile.rating || 0;
  const contestPeak = contestCount
    ? Math.max(...recentRatings.map(r=>r.newRating)) : profile.rating || 0;

  /*
    Weighted model.
    More important:
      1) Accepted volume
      2) Contest form
      3) Problem difficulty
      4) Consistency
      5) Submission volume
    Contribution is deliberately NOT used.
  */
  const acceptedScore = percentileScore(problems.length, 1, 28);
  const difficultyScore = percentileScore(avgProblemRating, 1050, 1950);
  const activityScore = percentileScore(activeDays, 1, 20);
  const submissionScore = percentileScore(recentSubs.length, 3, 150);
  const contestScore = percentileScore(avgContestRating, 1100, 2700);
  const peakScore = percentileScore(contestPeak, 1300, 3100);

  // Weights sum to 100. Accepted count is slightly more important than difficulty.
  let raw =
    acceptedScore * 24 +
    contestScore * 22 +
    difficultyScore * 21 +
    activityScore * 17 +
    peakScore * 10 +
    submissionScore * 6;

  // Consistency × difficulty bonus: sustained hard solving gets rewarded.
  raw += activityScore * difficultyScore * 9;

  // Small diminishing-return bonus for genuinely high solve volume.
  raw += Math.sqrt(Math.max(0, acceptedScore)) * 3;

  const score = Math.round(Math.max(0, Math.min(100, raw)));
  const rank = momentumRank(score);

  // CF-style recent-performance rating estimate.
  const base = profile.rating || 0;
  const difficultyPerformance = ratedProblems.length
    ? avgProblemRating + Math.max(0, maxProblemRating - avgProblemRating) * 0.18
    : base;

  let momentumRating =
    base * 0.34 +
    difficultyPerformance * 0.29 +
    (contestCount ? avgContestRating : base) * 0.25 +
    (contestCount ? contestPeak : base) * 0.12;

  momentumRating +=
    Math.max(0, activeDays - 4) * 5 +
    Math.max(0, problems.length - 5) * 2.5 +
    Math.max(0, avgProblemRating - base) * 0.20;

  // Generous floor: a very strong month should be able to escape a low official rating.
  momentumRating = Math.max(momentumRating, 1050 + score * 19.5);
  momentumRating = Math.round(Math.max(800, Math.min(3500, momentumRating)));

  return {
    recentSubs, accepted, problems, ratedProblems, avgProblemRating,
    maxProblemRating, activeDays, contestCount, recentRatings,
    avgContestRating, contestPeak, score, rank, momentumRating,
    components: {
      "Accepted volume": Math.round(acceptedScore*100),
      "Contest form": Math.round(contestScore*100),
      "Problem difficulty": Math.round(difficultyScore*100),
      "Consistency": Math.round(activityScore*100),
      "Contest peak": Math.round(peakScore*100),
      "Submission volume": Math.round(submissionScore*100)
    }
  };
}

function setLoading(text) {
  $("loadingText").textContent = text;
}

function showLoading(on) {
  $("loading").classList.toggle("hidden", !on);
}

function showError(title, text) {
  $("errorTitle").textContent = title;
  $("errorText").textContent = text;
  $("error").classList.remove("hidden");
}

function resetError() {
  $("error").classList.add("hidden");
}

function render(profile, result) {
  $("dashboard").classList.remove("hidden");

  $("avatar").src = profile.titlePhoto || profile.avatar || "";
  $("profileHandle").textContent = profile.handle;
  $("actualRank").textContent = profile.rank || rankName(profile.rating || 0);
  $("actualRank").style.color = ratingColor(profile.rank || rankName(profile.rating || 0));
  $("actualRating").textContent = `${profile.rating ?? 0} rating`;
  $("country").textContent = profile.country ? `• ${profile.country}` : "";

  $("momentumRank").textContent = result.rank;
  $("momentumRank").style.color = ratingColor(result.rank);
  $("momentumScore").textContent = result.score;
  $("momentumRating").textContent = result.momentumRating;
  $("momentumRating").style.color = ratingColor(result.rank);
  $("gaugeValue").textContent = result.score;
  const degrees = result.score * 3.6;
  $("gaugeValue").style.color = ratingColor(result.rank);
  $("gaugeValue").parentElement.parentElement.style.background =
    `conic-gradient(${ratingColor(result.rank)} ${degrees}deg, rgba(255,255,255,.08) ${degrees}deg)`;

  const actual = profile.rank || rankName(profile.rating || 0);
  let relation = "";
  if (rankName(profile.rating || 0) !== result.rank) {
    relation = `Your official rank is ${actual}, but your recent activity resembles ${result.rank}-level form.`;
  } else {
    relation = `Your recent activity is broadly consistent with your current ${actual} rating level.`;
  }
  $("momentumDescription").textContent =
    relation + ` Momentum Rating: ${result.momentumRating}, a CF-style estimate of recent performance.`;


  $("acceptedCount").textContent = formatNumber(result.problems.length);
  $("acceptedSub").textContent = `${result.accepted.length} accepted submissions`;
  $("avgProblemRating").textContent = result.avgProblemRating ? Math.round(result.avgProblemRating) : "—";
  $("activeDays").innerHTML = `${result.activeDays}<span>/30</span>`;
  $("contestCount").textContent = result.contestCount;
  $("contestSub").textContent = result.contestCount === 1 ? "rated contest" : "rated contests";

  $("currentRating2").textContent = profile.rating ?? "—";
  $("maxRating").textContent = profile.maxRating ?? "—";

  const bars = $("bars");
  bars.innerHTML = "";
  for (const [name, value] of Object.entries(result.components)) {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${name}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${value}%"></div></div>
      <span class="bar-value">${value}%</span>
    `;
    bars.appendChild(row);
  }

  const list = $("contestList");
  list.innerHTML = "";
  if (!result.recentRatings.length) {
    list.innerHTML = `<div class="contest-item"><span class="contest-name">No rated contests in the last 30 days</span><span class="contest-delta delta-flat">—</span></div>`;
  } else {
    result.recentRatings.slice().reverse().slice(0,5).forEach(r => {
      const delta = r.newRating - r.oldRating;
      const cls = delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "delta-flat";
      const sign = delta > 0 ? "+" : "";
      const row = document.createElement("div");
      row.className = "contest-item";
      row.innerHTML = `
        <span class="contest-name">Contest #${r.contestId}</span>
        <span class="contest-delta ${cls}">${sign}${delta} · ${r.newRating}</span>
      `;
      list.appendChild(row);
    });
  }

  window.scrollTo({top: $("dashboard").offsetTop - 25, behavior:"smooth"});
}

async function analyze(handle) {
  handle = handle.trim();
  if (!handle) return;
  resetError();
  $("dashboard").classList.add("hidden");
  showLoading(true);
  $("analyzeBtn").disabled = true;

  try {
    setLoading("Fetching Codeforces profile...");
    const users = await cf("user.info", {handles: handle});
    if (!users.length) throw new Error("User not found.");
    const profile = users[0];

    setLoading("Fetching recent submissions...");
    const submissions = await cf("user.status", {handle: profile.handle, from: 1, count: MAX_SUBMISSIONS});

    setLoading("Fetching contest rating history...");
    const ratings = await cf("user.rating", {handle: profile.handle});

    setLoading("Calculating the last 30 days...");
    const result = calculateMomentum(profile, submissions, ratings);
    render(profile, result);
  } catch (err) {
    console.error(err);
    showError(
      "Could not analyze handle",
      err.message.includes("limit") ?
        "Codeforces API is rate-limiting requests. Wait a few seconds and try again." :
        `Make sure the handle exists and try again. (${err.message})`
    );
  } finally {
    showLoading(false);
    $("analyzeBtn").disabled = false;
  }
}

$("searchForm").addEventListener("submit", e => {
  e.preventDefault();
  analyze($("handleInput").value);
});

document.querySelectorAll("[data-handle]").forEach(btn => {
  btn.addEventListener("click", () => {
    $("handleInput").value = btn.dataset.handle;
    analyze(btn.dataset.handle);
  });
});
