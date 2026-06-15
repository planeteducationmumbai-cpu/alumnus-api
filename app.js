/* ============================================================
   Alumnus frontend — wired to the REST API.
   • Set the backend URL via API_BASE below (or window.ALUMNUS_API).
   • Reads catalog from the API; persists enrollments, peer
     connections, posts and likes for the logged-in user.
   • Falls back to demo data when the API is unreachable, so the
     site still renders when you just want to preview it.
   ============================================================ */
const API_BASE = ((typeof window !== "undefined" && window.ALUMNUS_API) || "https://alumnus-api.onrender.com") + "/api";

/* ---------------- state ---------------- */
let TOKEN = (typeof localStorage !== "undefined" && localStorage.getItem("alumnus_token")) || null;
let ME = null;
let OFFLINE = false;
const ENROLLED = new Set();   // keys: "type:id"
const CONNECTED = new Set();  // peer ids
const LIKED = new Set();      // post ids
let DATA = { peers: [], mentors: [], classes: [], comps: [], interns: [], honors: [], posts: [] };

/* ---------------- demo fallback ---------------- */
const FALLBACK = {
  peers: [
    { id: "d1", n: "Rohan M.", f: "Data Science", c: "#3B5BA9", y: 2023, mutual: 14, tags: ["Python", "ML"], online: true },
    { id: "d2", n: "Aditi S.", f: "Design", c: "#B05B7A", y: 2024, mutual: 9, tags: ["UX", "Figma"], online: false },
    { id: "d3", n: "Kabir J.", f: "Robotics", c: "#2F7D5B", y: 2022, mutual: 21, tags: ["ROS", "C++"], online: true },
    { id: "d4", n: "Mei L.", f: "Finance", c: "#C79A3F", y: 2024, mutual: 6, tags: ["Quant", "Risk"], online: false },
    { id: "d5", n: "Sara V.", f: "Biotech", c: "#7A5BB0", y: 2023, mutual: 11, tags: ["Genomics"], online: true },
    { id: "d6", n: "Omar R.", f: "Product", c: "#4A6A8A", y: 2024, mutual: 8, tags: ["Strategy", "Growth"], online: false },
    { id: "d7", n: "Ines D.", f: "Law", c: "#3B5BA9", y: 2022, mutual: 5, tags: ["Policy"], online: false },
    { id: "d8", n: "Yuki T.", f: "Marketing", c: "#B05B7A", y: 2023, mutual: 17, tags: ["Brand", "SEO"], online: true },
  ],
  mentors: [
    { id: 1, n: "Dr. Priya Nair", r: "AI Research Lead · DeepMind", t: "AI / ML", c: "#3B5BA9" },
    { id: 2, n: "James Okoro", r: "VP Engineering · Stripe", t: "Systems", c: "#2F7D5B" },
    { id: 3, n: "Lena Brandt", r: "Design Director · Figma", t: "Product Design", c: "#B05B7A" },
  ],
  classes: [
    { id: 1, t: "AI & The Future of Tech", by: "Innovate Corp", d: "6 sessions · Live", tag: "Industry", c: "#1B2F52" },
    { id: 2, t: "Creative Writing Studio", by: "Faculty of Arts", d: "4 sessions · On-demand", tag: "Faculty", c: "#B05B7A" },
    { id: 3, t: "Quant Finance Bootcamp", by: "Subject Experts", d: "8 sessions · Live", tag: "Expert", c: "#2F7D5B" },
    { id: 4, t: "Product Management 101", by: "Industry Panel", d: "5 sessions · Hybrid", tag: "Industry", c: "#C79A3F" },
  ],
  comps: [
    { id: 1, t: "Scholarship Challenge 2026", p: "Win 100% Tuition Fee", days: 12, c: "#13294B" },
    { id: 2, t: "Data Science Arena 2026", p: "Full Scholarship + Internship", days: 21, c: "#214A7B" },
  ],
  interns: [
    { id: 1, r: "SDE Intern", co: "Stripe", loc: "Remote", pay: "Rs 80k/mo" },
    { id: 2, r: "Research Intern", co: "DeepMind", loc: "London", pay: "Funded" },
    { id: 3, r: "Design Intern", co: "Figma", loc: "Hybrid", pay: "Rs 65k/mo" },
  ],
  honors: [
    { id: 1, t: "National Innovator of the Year", s: "All Streams", w: "Aisha K." },
    { id: 2, t: "Rising Researcher Award", s: "Sciences", w: "Kabir J." },
    { id: 3, t: "Creative Excellence", s: "Arts & Design", w: "Aditi S." },
  ],
  posts: [
    { id: 101, n: "Mei L.", t: "Just wrapped the Quant Bootcamp — incredible cohort!", l: 42, c: "#C79A3F" },
    { id: 102, n: "Omar R.", t: "Anyone forming a study group for the DS Arena?", l: 18, c: "#4A6A8A" },
    { id: 103, n: "Sara V.", t: "Grateful to my mentor Dr. Nair — offer accepted!", l: 76, c: "#7A5BB0" },
  ],
};

/* ---------------- API helper ---------------- */
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (TOKEN) headers.Authorization = "Bearer " + TOKEN;
  const res = await fetch(API_BASE + path, { ...opts, headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
  return res.json();
}

/* normalize API rows -> render shape */
const mapMentor = m => ({ id: m.id, n: m.name, r: m.role, t: m.topic, c: m.color });
const mapClass  = c => ({ id: c.id, t: c.title, by: c.host, d: c.detail, tag: c.tag, c: c.color });
const mapComp   = c => ({ id: c.id, t: c.title, p: c.prize, days: c.days_left, c: c.color });
const mapIntern = i => ({ id: i.id, r: i.role, co: i.company, loc: i.location, pay: i.pay });
const mapHonor  = h => ({ id: h.id, t: h.title, s: h.stream, w: h.winner });
const mapPost   = p => ({ id: p.id, n: p.author, t: p.body, l: p.likes, c: p.avatar_color });

async function loadData() {
  try {
    const [peers, mentors, classes, comps, interns, honors, posts] = await Promise.all([
      api("/peers"), api("/mentors"), api("/masterclasses"), api("/competitions"),
      api("/internships"), api("/honors"), api("/posts"),
    ]);
    DATA = {
      peers, mentors: mentors.map(mapMentor), classes: classes.map(mapClass),
      comps: comps.map(mapComp), interns: interns.map(mapIntern),
      honors: honors.map(mapHonor), posts: posts.map(mapPost),
    };
    OFFLINE = false;
  } catch (e) {
    DATA = JSON.parse(JSON.stringify(FALLBACK));
    OFFLINE = true;
  }
  if (TOKEN && !OFFLINE) await loadUserState();
}

async function loadUserState() {
  try {
    ME = await api("/me");
    (await api("/enrollments")).forEach(e => ENROLLED.add(e.item_type + ":" + e.item_id));
    (await api("/connections")).forEach(id => CONNECTED.add(id));
  } catch { TOKEN = null; ME = null; if (typeof localStorage !== "undefined") localStorage.removeItem("alumnus_token"); }
}

/* ---------------- helpers ---------------- */
const initials = n => n.split(" ").map(w => w[0]).join("").slice(0, 2);
const av = (n, c, s) => `<div class="av" style="width:${s}px;height:${s}px;font-size:${s * .36}px;background:linear-gradient(135deg,${c},var(--ink))">${initials(n)}</div>`;
const $ = id => document.getElementById(id);

function needAuth() {
  if (OFFLINE) { return true; }      // demo mode: allow local-only toggles
  if (!TOKEN) { openAuth(); return false; }
  return true;
}

/* ---- enroll (mentor/masterclass/competition/internship) ---- */
async function toggleEnroll(type, id, label, el) {
  if (!needAuth()) return;
  const key = type + ":" + id, on = ENROLLED.has(key);
  on ? ENROLLED.delete(key) : ENROLLED.add(key);
  el.classList.toggle("on"); el.textContent = on ? label : "✓ Enrolled";
  if (!OFFLINE) {
    try { await api("/enroll", { method: on ? "DELETE" : "POST", body: JSON.stringify({ item_type: type, item_id: id }) }); }
    catch { on ? ENROLLED.add(key) : ENROLLED.delete(key); el.classList.toggle("on"); el.textContent = on ? "✓ Enrolled" : label; }
  }
}

/* ---- peer connect ---- */
async function toggleConnect(id, el) {
  if (!needAuth()) return;
  const on = CONNECTED.has(id);
  on ? CONNECTED.delete(id) : CONNECTED.add(id);
  el.classList.toggle("on"); el.textContent = on ? "Connect" : "✓ Connected";
  if (!OFFLINE) {
    try { await api("/connections", { method: on ? "DELETE" : "POST", body: JSON.stringify({ peer_id: id }) }); }
    catch { on ? CONNECTED.add(id) : CONNECTED.delete(id); el.classList.toggle("on"); el.textContent = on ? "✓ Connected" : "Connect"; }
  }
}

/* ---- likes ---- */
async function likePost(id, base, el) {
  if (!needAuth()) return;
  const on = LIKED.has(id);
  on ? LIKED.delete(id) : LIKED.add(id);
  el.style.color = on ? "var(--muted)" : "var(--gold)";
  el.querySelector("span").textContent = "♥ " + (base + (on ? 0 : 1));
  if (!OFFLINE && !on) { try { await api("/posts/" + id + "/like", { method: "POST" }); } catch {} }
}

/* ---- peer card ---- */
function peerCard(p) {
  const on = CONNECTED.has(p.id);
  return `<div class="pcard">
    <div class="cover" style="background:linear-gradient(120deg,${p.c},var(--ink))"></div>
    ${av(p.n, p.c, 72).replace('class="av"', 'class="av ava"')}
    ${p.online ? '<span class="online" title="Online"></span>' : ""}
    <div class="body">
      <div class="name">${p.n}</div>
      <div class="fieldp"><span class="pill">${p.f}</span></div>
      <div class="meta"><span><b>${p.mutual}</b> mutual</span><span>Class of <b>${p.y}</b></span></div>
      <div class="tags">${(p.tags || []).map(t => `<span class="tag">${t}</span>`).join("")}</div>
      <div class="actions">
        <button class="btn block ${on ? "on" : ""}" onclick="toggleConnect('${p.id}',this)">${on ? "✓ Connected" : "Connect"}</button>
        <button class="icobtn" title="Message"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></button>
      </div>
    </div>
  </div>`;
}

function enrollBtn(type, id, label) {
  const on = ENROLLED.has(type + ":" + id);
  return `<button class="btn ${on ? "on" : ""}" onclick="toggleEnroll('${type}',${JSON.stringify(id)},'${label}',this)">${on ? "✓ Enrolled" : label}</button>`;
}

/* ---------------- render ---------------- */
function render(filter = "") {
  const f = filter.toLowerCase(), m = s => !f || (s || "").toLowerCase().includes(f);

  if ($("peers")) $("peers").innerHTML = DATA.peers.filter(p => m(p.n) || m(p.f) || (p.tags || []).some(m)).map(peerCard).join("");

  const mentorCard = mt => `<div class="card tap pad">${av(mt.n, mt.c, 48)}
    <h3 style="font-size:16px;margin-top:10px">${mt.n}</h3><p class="muted" style="font-size:13px">${mt.r}</p>
    <div style="margin-top:6px"><span class="pill">${mt.t}</span></div>
    <div style="margin-top:12px">${enrollBtn("mentor", mt.id, "Connect")}</div></div>`;
  if ($("home-mentors")) $("home-mentors").innerHTML = DATA.mentors.filter(x => m(x.n) || m(x.t)).map(mentorCard).join("");
  if ($("mentors")) $("mentors").innerHTML = DATA.mentors.map(mentorCard).join("");

  const classCard = c => `<div class="card tap" style="overflow:hidden">
    <div class="mc-top" style="background:linear-gradient(135deg,${c.c},var(--ink))"><span class="pill" style="background:rgba(255,255,255,.2);color:#fff">${c.tag}</span></div>
    <div class="pad"><h3 style="font-size:16px">${c.t}</h3><p class="muted" style="font-size:12px;margin:4px 0 12px">${c.by} · ${c.d}</p>${enrollBtn("masterclass", c.id, "Enroll Now")}</div></div>`;
  if ($("home-classes")) $("home-classes").innerHTML = DATA.classes.filter(c => m(c.t) || m(c.by)).map(classCard).join("");
  if ($("classes")) $("classes").innerHTML = DATA.classes.map(classCard).join("");

  if ($("comps")) $("comps").innerHTML = DATA.comps.map(c =>
    `<div class="card comp" style="background:linear-gradient(110deg,${c.c},var(--ink))">
      <div style="flex:1"><h3 style="font-size:20px">${c.t}</h3>
      <div style="color:var(--goldSoft);font-weight:700;font-size:13px;margin-top:4px">${c.p}</div>
      <div style="font-size:12px;opacity:.75;margin-top:8px">⏱ ${c.days} days left to register</div></div>
      ${enrollBtn("competition", c.id, "Register")}</div>`).join("");

  if ($("interns")) $("interns").innerHTML = DATA.interns.map(it =>
    `<div class="card tap pad row"><div class="av" style="width:46px;height:46px;border-radius:12px;background:var(--paper);color:var(--ink);font-size:18px">${it.co[0]}</div>
     <div style="flex:1"><h3 style="font-size:15px">${it.r} · ${it.co}</h3><p class="muted" style="font-size:12px">${it.loc} · ${it.pay}</p></div>
     ${enrollBtn("internship", it.id, "Apply")}</div>`).join("");

  if ($("honors")) $("honors").innerHTML = DATA.honors.map((h, i) =>
    `<div class="card tap pad row"><div class="av" style="width:48px;height:48px;border-radius:12px;background:var(--paper);color:var(--gold);font-family:Fraunces,serif;font-size:22px">${i + 1}</div>
     <div style="flex:1"><h3 style="font-size:15px">${h.t}</h3><p class="muted" style="font-size:12px">${h.s}</p></div>
     <div style="text-align:right"><div class="muted" style="font-size:10px">Winner</div><b style="font-size:13px">${h.w}</b></div></div>`).join("");

  if ($("posts")) $("posts").innerHTML = DATA.posts.map(p =>
    `<div class="card pad"><div class="row">${av(p.n, p.c, 40)}<div><b style="font-size:14px">${p.n}</b><div class="muted" style="font-size:11px">Circle of Peers</div></div></div>
     <p style="margin:12px 0;font-size:14px">${p.t}</p>
     <button style="border:none;background:none;cursor:pointer;font-family:inherit;font-weight:600;font-size:13px;color:${LIKED.has(p.id) ? "var(--gold)" : "var(--muted)"}" onclick="likePost(${JSON.stringify(p.id)},${p.l},this)"><span>♥ ${p.l + (LIKED.has(p.id) ? 1 : 0)}</span></button></div>`).join("");

  if ($("social-peers")) $("social-peers").innerHTML = DATA.peers.slice(0, 6).map(p =>
    `<div class="miniav">${av(p.n, p.c, 46)}<div class="n">${p.n.split(" ")[0]}</div></div>`).join("");
}

/* ---------------- auth UI ---------------- */
function injectAuth() {
  if ($("auth-modal")) return;
  const wrap = document.createElement("div");
  wrap.id = "auth-modal";
  wrap.style.cssText = "position:fixed;inset:0;z-index:100;display:none;align-items:center;justify-content:center;background:rgba(11,20,36,.55);backdrop-filter:blur(3px)";
  wrap.innerHTML = `
    <div class="card" style="width:360px;max-width:92vw;padding:26px;position:relative">
      <button onclick="closeAuth()" style="position:absolute;top:14px;right:16px;border:none;background:none;font-size:20px;cursor:pointer;color:var(--muted)">×</button>
      <h2 id="auth-title" style="font-size:22px">Welcome back</h2>
      <p class="muted" style="font-size:13px;margin-top:2px" id="auth-sub">Sign in to save your network.</p>
      <div id="auth-reg" style="display:none">
        <input id="auth-name" placeholder="Full name" class="ainput"/>
        <input id="auth-field" placeholder="Field (e.g. Computer Science)" class="ainput"/>
      </div>
      <input id="auth-email" placeholder="Email" class="ainput" value="aisha@alumnus.io"/>
      <input id="auth-pass" type="password" placeholder="Password" class="ainput" value="demo1234"/>
      <div id="auth-err" style="color:#B0413E;font-size:12px;min-height:16px;margin:6px 2px"></div>
      <button class="btn block" id="auth-submit" onclick="submitAuth()">Sign in</button>
      <p style="font-size:13px;text-align:center;margin-top:14px;color:var(--muted)">
        <span id="auth-switch-txt">New here?</span>
        <a id="auth-switch" style="color:var(--gold);font-weight:700;cursor:pointer">Create account</a>
      </p>
    </div>`;
  document.body.appendChild(wrap);
  const st = document.createElement("style");
  st.textContent = ".ainput{width:100%;margin-top:10px;padding:11px 13px;border:1px solid var(--line);border-radius:11px;font-family:inherit;font-size:14px;outline:none}.ainput:focus{border-color:var(--goldSoft)}";
  document.head.appendChild(st);
  $("auth-switch").onclick = toggleAuthMode;
}
let regMode = false;
function toggleAuthMode() {
  regMode = !regMode;
  $("auth-reg").style.display = regMode ? "block" : "none";
  $("auth-title").textContent = regMode ? "Join Alumnus" : "Welcome back";
  $("auth-sub").textContent = regMode ? "Create an account to get started." : "Sign in to save your network.";
  $("auth-submit").textContent = regMode ? "Create account" : "Sign in";
  $("auth-switch-txt").textContent = regMode ? "Already a member?" : "New here?";
  $("auth-switch").textContent = regMode ? "Sign in" : "Create account";
  $("auth-err").textContent = "";
}
function openAuth() { injectAuth(); $("auth-modal").style.display = "flex"; }
function closeAuth() { if ($("auth-modal")) $("auth-modal").style.display = "none"; }

async function submitAuth() {
  const email = $("auth-email").value.trim(), password = $("auth-pass").value;
  const err = $("auth-err"); err.textContent = "";
  if (OFFLINE) { err.textContent = "Demo mode — start the API to sign in."; return; }
  try {
    let r;
    if (regMode) {
      r = await api("/auth/register", { method: "POST", body: JSON.stringify({ name: $("auth-name").value.trim(), email, password, field: $("auth-field").value.trim() }) });
    } else {
      r = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    }
    TOKEN = r.token; if (typeof localStorage !== "undefined") localStorage.setItem("alumnus_token", TOKEN);
    ENROLLED.clear(); CONNECTED.clear();
    await loadUserState();
    closeAuth(); paintAuthButton(); render($("search") ? $("search").value : "");
  } catch (e) { err.textContent = regMode ? "Could not register (email may be taken)." : "Invalid email or password."; }
}

function signOut() {
  TOKEN = null; ME = null; ENROLLED.clear(); CONNECTED.clear(); LIKED.clear();
  if (typeof localStorage !== "undefined") localStorage.removeItem("alumnus_token");
  paintAuthButton(); render($("search") ? $("search").value : "");
}

function paintAuthButton() {
  const btn = document.querySelector("header button.btn");
  if (!btn) return;
  if (ME) { btn.textContent = "Hi, " + ME.name.split(" ")[0] + " · Sign out"; btn.onclick = signOut; }
  else { btn.textContent = "Sign in"; btn.onclick = openAuth; }
}

function showDemoBanner() {
  if (!OFFLINE || $("demo-banner")) return;
  const b = document.createElement("div");
  b.id = "demo-banner";
  b.style.cssText = "background:var(--ink);color:#fff;text-align:center;font-size:12.5px;padding:7px 12px";
  b.innerHTML = "Demo mode — the site is showing sample data. Start the API (npm start) and refresh to save your changes.";
  document.body.prepend(b);
}

/* ---------------- boot ---------------- */
document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  document.querySelectorAll(".navlinks a").forEach(a => a.classList.toggle("active", a.dataset.v === page));
  const s = $("search"); if (s) s.addEventListener("input", e => render(e.target.value));
  const b = $("burger"); if (b) b.onclick = () => $("navlinks").classList.toggle("open");
  injectAuth();
  await loadData();
  showDemoBanner();
  paintAuthButton();
  render();
});
