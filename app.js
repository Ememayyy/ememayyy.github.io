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

function momentumBounds(rank) {
  const bounds = {
    "Newbie":[800,1199],
    "Pupil":[1200,1399],
    "Specialist":[1400,1599],
    "Expert":[1600,1899],
    "Candidate Master":[1900,2099],
    "Master":[2100,2299],
    "International Master":[2300,2399],
    "Grandmaster":[2400,2599],
    "International Grandmaster":[2600,2999],
    "Legendary Grandmaster":[3000,3500]
  };
  return bounds[rank] || [800,3500];
}

function momentumRatingFromScore(score) {
  const rank = momentumRank(score);
  const [lo, hi] = momentumBounds(rank);
  const thresholds = [0,16,29,43,57,69,79,87,94,98,100];
  const idx = ["Newbie","Pupil","Specialist","Expert","Candidate Master","Master","International Master","Grandmaster","International Grandmaster","Legendary Grandmaster"].indexOf(rank);
  const a = thresholds[idx], b = thresholds[idx+1];
  const t = Math.max(0, Math.min(1, (score-a)/(b-a || 1)));
  return Math.round(lo + (hi-lo)*t);
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
    ? ratedProblems.reduce((a,p) => a + p.rating, 0) / ratedProblems.length : 0;
  const maxProblemRating = ratedProblems.length
    ? Math.max(...ratedProblems.map(p => p.rating)) : 0;

  const activeDays = new Set(
    recentSubs.map(s => new Date(s.creationTimeSeconds * 1000).toISOString().slice(0,10))
  ).size;

  const recentRatings = ratings.filter(r => daysAgo(r.ratingUpdateTimeSeconds));
  const contestCount = recentRatings.length;
  const avgContestRating = contestCount
    ? recentRatings.reduce((a,r) => a + r.newRating, 0) / contestCount : profile.rating || 0;
  const contestPeak = contestCount
    ? Math.max(...recentRatings.map(r => r.newRating)) : profile.rating || 0;

  const acceptedScore = percentileScore(problems.length, 1, 28);
  const difficultyScore = percentileScore(avgProblemRating, 1050, 1950);
  const highestSolvedScore = percentileScore(maxProblemRating, 1300, 2800);
  const activityScore = percentileScore(activeDays, 1, 20);
  const contestScore = percentileScore(avgContestRating, 1100, 2700);
  const contributionScore = percentileScore(Math.max(0, profile.contribution || 0), 0, 80);

  // Momentum v8: problem difficulty and the hardest solved problem are stronger.
  // The six weights below sum to exactly 100.
  const raw =
    acceptedScore * 24 +
    difficultyScore * 32 +
    highestSolvedScore * 12 +
    contestScore * 18 +
    activityScore * 9 +
    contributionScore * 5;

  const score = Math.round(Math.max(0, Math.min(100, raw)));
  const rank = momentumRank(score);

  const base = profile.rating || 0;
  const difficultyPerformance = ratedProblems.length
    ? avgProblemRating + Math.max(0, maxProblemRating - avgProblemRating) * 0.22
    : base;

  let momentumRating =
    base * 0.30 +
    difficultyPerformance * 0.34 +
    (contestCount ? avgContestRating : base) * 0.20 +
    (contestCount ? contestPeak : base) * 0.10 +
    (ratedProblems.length ? maxProblemRating : base) * 0.06;

  momentumRating +=
    Math.max(0, activeDays - 4) * 2.5 +
    Math.max(0, problems.length - 5) * 1.4 +
    Math.max(0, avgProblemRating - base) * 0.10;

  const bounds = momentumBounds(rank);
  momentumRating = Math.max(bounds[0], Math.min(bounds[1], Math.round(momentumRating)));
  if (!contestCount && !ratedProblems.length) momentumRating = Math.round((bounds[0] + bounds[1]) / 2);

  return {
    recentSubs, accepted, problems, ratedProblems, avgProblemRating,
    maxProblemRating, activeDays, contestCount, recentRatings,
    avgContestRating, contestPeak, score, rank, momentumRating,
    currentRating: profile.rating || 0,
    allRatings: ratings,
    components: {
      "Accepted volume": Math.round(acceptedScore * 100),
      "Problem difficulty": Math.round(difficultyScore * 100),
      "Highest solved": Math.round(highestSolvedScore * 100),
      "Contest form": Math.round(contestScore * 100),
      "Consistency": Math.round(activityScore * 100),
      "Contribution": Math.round(contributionScore * 100)
    }
  };
}



function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function contestBucket(contest) {
  const name=String(contest.name||"").toLowerCase();
  if(contest.type==="EDU"||name.includes("educational")) return "EDU";
  if(contest.type==="ICPC"||/\bicpc\b|nwerc|neerc|regional|world finals|\bwf\b/.test(name)) return "ICPC";
  if(/\bdiv\.?\s*1\b|\bdivision\s*1\b|\bdiv1\b/.test(name)) return "DIV1";
  if(/\bdiv\.?\s*2\b|\bdivision\s*2\b|\bdiv2\b/.test(name)) return "DIV2";
  if(/\bdiv\.?\s*3\b|\bdivision\s*3\b|\bdiv3\b/.test(name)) return "DIV3";
  if(/\bdiv\.?\s*4\b|\bdivision\s*4\b|\bdiv4\b/.test(name)) return "DIV4";
  return "OTHER";
}
function isRatedContest(contest) {
  const name=String(contest.name||"").toLowerCase();
  if(contest.type==="IOI"||contest.type==="ICPC") return false;
  if(/unrated|practice|virtual|testing|icpc|nwerc|neerc|regional|world finals/.test(name)) return false;
  if(contest.phase!=="BEFORE"&&contest.phase!=="FINISHED") return false;
  if(contest.type==="EDU") return true;
  if(/\bdiv\.?\s*[1-4]\b|\bdivision\s*[1-4]\b|\bdiv[1-4]\b/.test(name)) return true;
  return contest.type==="CF";
}

function recentRatingForm(ratings) {
  const recent = ratings.slice(-6);
  if (!recent.length) return {avgDelta: 0, trend: 0, sample: 0};

  let weightedSum = 0, weightSum = 0;
  recent.forEach((r, i) => {
    const weight = i + 1;
    weightedSum += (r.newRating - r.oldRating) * weight;
    weightSum += weight;
  });

  const avgDelta = weightedSum / weightSum;

  const last3 = recent.slice(-3).map(r => r.newRating - r.oldRating);
  const prev3 = recent.slice(-6, -3).map(r => r.newRating - r.oldRating);
  const avgLast = last3.length
    ? last3.reduce((a,b) => a+b, 0) / last3.length : avgDelta;
  const avgPrev = prev3.length
    ? prev3.reduce((a,b) => a+b, 0) / prev3.length : avgLast;

  return {
    avgDelta,
    trend: avgLast - avgPrev,
    sample: recent.length
  };
}


function typePerformance(result,bucket) {
  const typed=(result.allRatings||[])
    .filter(r=>contestBucket(r.contestMeta||{})===bucket).slice(-6);
  if(!typed.length) return {delta:0,sample:0,confidence:0};
  let sum=0,weights=0;
  typed.forEach((r,i)=>{const w=i+1;sum+=(r.newRating-r.oldRating)*w;weights+=w;});
  return {delta:sum/weights,sample:typed.length,confidence:Math.min(1,typed.length/5)};
}
function expectedContestDelta(result,contest) {
  if(!isRatedContest(contest)) return null;
  const overall=recentRatingForm(result.recentRatings);
  const bucket=contestBucket(contest);
  const typed=typePerformance(result,bucket);
  const tw=typed.confidence*0.58;
  let delta=typed.delta*tw+overall.avgDelta*(1-tw);
  delta+=Math.max(-15,Math.min(15,overall.trend))*0.08;
  const formatAdjustment={DIV1:3,DIV2:1,DIV3:-1,DIV4:-2,EDU:0,OTHER:0}[bucket]||0;
  delta+=formatAdjustment*0.35;
  delta=Math.round(Math.max(-90,Math.min(90,delta)));
  const uncertainty=Math.round(Math.max(9,Math.min(24,
    11+(1-typed.confidence)*7+
    (bucket==="DIV1"?2:(bucket==="EDU"||bucket==="DIV3"||bucket==="DIV4"?1:0))
  )));
  return {delta,uncertainty,bucket,typeSample:typed.sample};
}
function drawRatingChart(history) {
  const canvas = $("ratingChart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = 230;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!history.length) {
    ctx.fillStyle = "#7b8799";
    ctx.font = "11px JetBrains Mono";
    ctx.fillText("No rated contests in the last 30 days.", 14, 28);
    return;
  }

  const points = [
    {
      newRating: history[0].oldRating,
      ratingUpdateTimeSeconds: history[0].ratingUpdateTimeSeconds - 1
    },
    ...history
  ];

  const values = points.map(p => p.newRating);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const padding = Math.max(35, Math.round((maxValue - minValue) * 0.18));
  const min = minValue - padding;
  const max = maxValue + padding;

  const left = 14;
  const right = 12;
  const top = 18;
  const bottom = 24;

  const x = i =>
    left + (width - left - right) *
    (i / Math.max(1, points.length - 1));

  const y = value =>
    height - bottom -
    (height - top - bottom) * ((value - min) / Math.max(1, max - min));

  ctx.strokeStyle = "rgba(255,255,255,.07)";
  ctx.lineWidth = 1;

  for (let i = 0; i < 4; i++) {
    const gy = top + i * (height - top - bottom) / 3;
    ctx.beginPath();
    ctx.moveTo(left, gy);
    ctx.lineTo(width - right, gy);
    ctx.stroke();
  }

  // Filled area.
  const gradient = ctx.createLinearGradient(0, top, 0, height);
  gradient.addColorStop(0, "rgba(157,124,255,.22)");
  gradient.addColorStop(1, "rgba(157,124,255,0)");

  ctx.beginPath();
  ctx.moveTo(x(0), height - bottom);
  points.forEach((p, i) => ctx.lineTo(x(i), y(p.newRating)));
  ctx.lineTo(x(points.length - 1), height - bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Rating line.
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(x(i), y(p.newRating));
    else ctx.lineTo(x(i), y(p.newRating));
  });
  ctx.strokeStyle = "#9d7cff";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Points.
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(p.newRating), i === points.length - 1 ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = "#d7c9ff";
    ctx.fill();
  });

  ctx.fillStyle = "#778397";
  ctx.font = "9px JetBrains Mono";
  ctx.fillText(`${Math.round(max)}`, left, 11);
  ctx.fillText(`${Math.round(min)}`, left, height - 5);

  $("chartCurrentRating").textContent =
    `${points[points.length - 1].newRating}`;
}


function renderContestForecasts(result,contests) {
  const box=$("contestForecasts"); if(!box)return;
  const now=Math.floor(Date.now()/1000), monthLater=now+30*86400;
  const upcoming=contests.filter(c=>c.phase==="BEFORE"&&c.startTimeSeconds>=now&&c.startTimeSeconds<=monthLater&&isRatedContest(c))
    .sort((a,b)=>a.startTimeSeconds-b.startTimeSeconds);
  if(!upcoming.length){box.innerHTML='<div class="analysis-empty">No upcoming rated contests found in the next 30 days.</div>';return;}
  box.innerHTML=upcoming.map(c=>{
    const f=expectedContestDelta(result,c), cls=f.delta>2?"delta-up":f.delta<-2?"delta-down":"delta-flat";
    const sign=f.delta>0?"+":"",date=new Date(c.startTimeSeconds*1000).toLocaleDateString(undefined,{month:"short",day:"numeric"});
    return `<div class="contest-row"><div><div class="contest-name">${escapeHtml(c.name)}</div><div class="contest-date">${date} · ${f.bucket}${f.typeSample?` · ${f.typeSample} prior`:""}</div></div><div class="contest-delta ${cls}">${sign}${f.delta}<small>±${f.uncertainty}</small></div></div>`;
  }).join("");
}

function renderRealRatingForecast(result,contests) {
  const now=Math.floor(Date.now()/1000), monthLater=now+30*86400;
  const upcoming=contests.filter(c=>c.phase==="BEFORE"&&c.startTimeSeconds>=now&&c.startTimeSeconds<=monthLater&&isRatedContest(c))
    .sort((a,b)=>a.startTimeSeconds-b.startTimeSeconds);
  const current=result.currentRating;
  if(!upcoming.length){
    $("ratingForecast").textContent=current;$("forecastRange").textContent=`${current} — ${current}`;
    $("ratingForecastText").textContent="No upcoming rated contests are currently scheduled in the next 30 days.";return;
  }
  const fs=upcoming.map(c=>expectedContestDelta(result,c)).filter(Boolean);
  const total=fs.reduce((a,f)=>a+f.delta,0);
  const uncertainty=Math.round(Math.max(15,Math.min(45,Math.sqrt(fs.reduce((a,f)=>a+f.uncertainty*f.uncertainty,0))*0.65)));
  const forecast=Math.round(current+total);
  $("ratingForecast").textContent=forecast;$("forecastRange").textContent=`${forecast-uncertainty} — ${forecast+uncertainty}`;
  const sign=total>0?"+":"";
  $("ratingForecastText").textContent=`Current ${current} → expected ${sign}${total} rating change across ${fs.length} upcoming rated contest${fs.length===1?"":"s"} in the next 30 days. Unrated contests are excluded.`;
}
async function fetchUpcomingContests() {
  const contests=await cf("contest.list",{gym:"false"});
  const now=Math.floor(Date.now()/1000), monthLater=now+30*86400;
  return contests.filter(c=>c.phase==="BEFORE"&&c.startTimeSeconds>=now&&c.startTimeSeconds<=monthLater)
    .sort((a,b)=>a.startTimeSeconds-b.startTimeSeconds);
}
async function enrichRatingHistoryWithContestTypes(ratings) {
  try {
    const contests=await cf("contest.list",{gym:"false"});
    const byId=new Map(contests.map(c=>[c.id,c]));
    return ratings.map(r=>({...r,contestMeta:byId.get(r.contestId)||{}}));
  } catch(e) {
    return ratings.map(r=>({...r,contestMeta:{}}));
  }
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
  window.__lastProfile=profile; window.__lastResult=result;
  $("dashboard").classList.remove("hidden");

  $("avatar").src = profile.titlePhoto || profile.avatar || "";
  $("profileHandle").textContent = profile.handle;
  $("profileHandle").href = `https://codeforces.com/profile/${encodeURIComponent(profile.handle)}`;
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

  const analysis = $("performanceAnalysis");
  analysis.classList.remove("hidden");
  analysis.classList.remove("result-reveal");
  void analysis.offsetWidth;
  analysis.classList.add("result-reveal");

  drawRatingChart(result.recentRatings);

  fetchUpcomingContests()
    .then(upcoming => {
      renderContestForecasts(result, upcoming);
      renderRealRatingForecast(result, upcoming);
    })
    .catch(err => {
      console.error("Upcoming contests:", err);
      renderContestForecasts(result, []);
      renderRealRatingForecast(result, []);
    });

  window.scrollTo({top: $("dashboard").offsetTop - 25, behavior:"smooth"});
}

async function analyze(handle) {
  handle = handle.trim();
  if (!handle) return;
  resetError();
  $("dashboard").classList.add("hidden");
  $("performanceAnalysis").classList.add("hidden");
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
    const enrichedRatings = await enrichRatingHistoryWithContestTypes(ratings);
    const result = calculateMomentum(profile, submissions, enrichedRatings);
    render(profile, result);
  } catch (err) {
    console.error(err);
    showError(
      "Could not analyze handle",
      err.message.includes("limit") ?
        "Codeforces API is rate-limiting requests. Wait a few seconds and try again." :
        `Could not load all Codeforces data. Please try again. (${err.message})`
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


const themeToggle = $("themeToggle");
const savedTheme = localStorage.getItem("cfdm-theme");
if(savedTheme === "light") document.body.classList.add("light-theme");
function updateThemeButton(){ if(themeToggle) themeToggle.innerHTML = document.body.classList.contains("light-theme") ? "☾ <span>Dark</span>" : "☼ <span>Light</span>"; }
updateThemeButton();
if(themeToggle) themeToggle.addEventListener("click",()=>{
  document.body.classList.toggle("light-theme");
  localStorage.setItem("cfdm-theme",document.body.classList.contains("light-theme")?"light":"dark");
  const d=document.getElementById("dashboard");
  if(d && !d.classList.contains("hidden")) { const r=window.__lastResult; const p=window.__lastProfile; if(r&&p) drawRatingChart(r.recentRatings); }
  updateThemeButton();
});
window.addEventListener("resize",()=>{ const r=window.__lastResult,p=window.__lastProfile; if(r&&p&&!$("dashboard").classList.contains("hidden")) drawRatingChart(r.recentRatings); });
