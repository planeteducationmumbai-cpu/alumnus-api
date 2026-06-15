/* ============================================================
   ALUMNUS API — Express + SQLite backend for the alumni app
   Covers: auth, profile, mentors, masterclasses, competitions,
   internships, honors, peers/study-groups, social posts, and
   enrollments. Zero external services — SQLite file on disk.

   Run:
     npm install
     npm run seed     # creates alumnus.db with demo data
     npm start        # http://localhost:4000
   ============================================================ */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

/* Use Node's built-in SQLite (Node 22.5+) — no native compilation needed */
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.env.DB_FILE || "alumnus.db");

/* WAL mode via exec */
db.exec("PRAGMA journal_mode = WAL;");

const app = express();
app.use(cors());
app.use(express.json());

/* ---------------- schema ---------------- */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, pass_hash TEXT,
  field TEXT, grad_year INTEGER, avatar_color TEXT, token TEXT,
  tags TEXT DEFAULT '[]', mutual INTEGER DEFAULT 0, online INTEGER DEFAULT 0,
  role TEXT DEFAULT 'user'
);
CREATE TABLE IF NOT EXISTS mentors (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, role TEXT, topic TEXT,
  color TEXT, photo_url TEXT, bio TEXT, linkedin TEXT, twitter TEXT
);
CREATE TABLE IF NOT EXISTS masterclasses (
  id INTEGER PRIMARY KEY, title TEXT, host TEXT, detail TEXT, tag TEXT, color TEXT
);
CREATE TABLE IF NOT EXISTS competitions (
  id INTEGER PRIMARY KEY, title TEXT, prize TEXT, days_left INTEGER, color TEXT
);
CREATE TABLE IF NOT EXISTS internships (
  id INTEGER PRIMARY KEY, role TEXT, company TEXT, location TEXT, pay TEXT
);
CREATE TABLE IF NOT EXISTS honors (
  id INTEGER PRIMARY KEY, title TEXT, stream TEXT, winner TEXT, year INTEGER
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, author_id TEXT, body TEXT,
  likes INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- generic enrollment / apply / connect ledger
CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT,
  item_type TEXT, item_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_type, item_id)
);
-- peer connections (Peer Connect)
CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, peer_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, peer_id)
);
`);

/* ---------------- helpers ---------------- */
const hash = (p) => crypto.createHash("sha256").update(p).digest("hex");
const newToken = () => crypto.randomBytes(24).toString("hex");
const safeJSON = (s) => { try { return JSON.parse(s || "[]"); } catch { return []; } };

function getUser(req) {
  const t = (req.headers.authorization || "").replace("Bearer ", "");
  return db.prepare("SELECT * FROM users WHERE token = ?").get(t) || null;
}

function auth(req, res, next) {
  const u = getUser(req);
  if (!u) return res.status(401).json({ error: "unauthorized" });
  req.user = u; next();
}

/* any admin or master admin */
function adminAuth(req, res, next) {
  const u = getUser(req);
  if (!u || (u.role !== "admin" && u.role !== "master")) return res.status(403).json({ error: "admin only" });
  req.user = u; next();
}

/* master admin only */
function masterAuth(req, res, next) {
  const u = getUser(req);
  if (!u || u.role !== "master") return res.status(403).json({ error: "master admin only" });
  req.user = u; next();
}

/* ---------------- auth ---------------- */
app.post("/api/auth/register", (req, res) => {
  const { name, email, password, field, grad_year } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: "missing fields" });
  const id = crypto.randomUUID();
  const token = newToken();
  try {
    db.prepare(`INSERT INTO users (id,name,email,pass_hash,field,grad_year,avatar_color,token)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, name, email, hash(password), field || null, grad_year || null, "#C79A3F", token);
  } catch { return res.status(409).json({ error: "email already registered" }); }
  res.json({ token, user: { id, name, email, field, grad_year } });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!u || u.pass_hash !== hash(password || "")) return res.status(401).json({ error: "invalid credentials" });
  const token = newToken();
  db.prepare("UPDATE users SET token = ? WHERE id = ?").run(token, u.id);
  res.json({ token, user: { id: u.id, name: u.name, email: u.email, field: u.field } });
});

app.get("/api/me", auth, (req, res) => {
  const { id, name, email, field, grad_year, avatar_color, role } = req.user;
  res.json({ id, name, email, field, grad_year, avatar_color, role: role || "user", is_admin: role === "admin" || role === "master" });
});

/* ---------------- catalog (public reads) ---------------- */
const list = (table) => (_req, res) => res.json(db.prepare(`SELECT * FROM ${table}`).all());
app.get("/api/mentors", list("mentors"));
app.get("/api/masterclasses", list("masterclasses"));
app.get("/api/competitions", list("competitions"));
app.get("/api/internships", list("internships"));
app.get("/api/honors", list("honors"));

/* peers = other users (the "circle of peers") */
app.get("/api/peers", (_req, res) => {
  const rows = db.prepare(
    "SELECT id,name,field,avatar_color,grad_year,tags,mutual,online FROM users LIMIT 50"
  ).all();
  res.json(rows.map((r) => ({
    id: r.id, n: r.name, f: r.field, c: r.avatar_color || "#3B5BA9",
    y: r.grad_year, mutual: r.mutual || 0, online: !!r.online,
    tags: safeJSON(r.tags),
  })));
});

/* ---------------- enrollments (Connect / Upskill / Compete / Apply) ----------------
   item_type: mentor | masterclass | competition | internship           */
app.get("/api/enrollments", auth, (req, res) =>
  res.json(db.prepare("SELECT item_type,item_id FROM enrollments WHERE user_id = ?").all(req.user.id)));

app.post("/api/enroll", auth, (req, res) => {
  const { item_type, item_id } = req.body || {};
  const ok = ["mentor", "masterclass", "competition", "internship"].includes(item_type);
  if (!ok || item_id == null) return res.status(400).json({ error: "bad item" });
  db.prepare(`INSERT OR IGNORE INTO enrollments (user_id,item_type,item_id) VALUES (?,?,?)`)
    .run(req.user.id, item_type, item_id);
  res.json({ ok: true });
});

app.delete("/api/enroll", auth, (req, res) => {
  const { item_type, item_id } = req.body || {};
  db.prepare("DELETE FROM enrollments WHERE user_id=? AND item_type=? AND item_id=?")
    .run(req.user.id, item_type, item_id);
  res.json({ ok: true });
});

/* ---------------- peer connections ---------------- */
app.get("/api/connections", auth, (req, res) =>
  res.json(db.prepare("SELECT peer_id FROM connections WHERE user_id = ?").all(req.user.id).map(r => r.peer_id)));

app.post("/api/connections", auth, (req, res) => {
  const { peer_id } = req.body || {};
  if (!peer_id || peer_id === req.user.id) return res.status(400).json({ error: "bad peer" });
  db.prepare("INSERT OR IGNORE INTO connections (user_id,peer_id) VALUES (?,?)").run(req.user.id, peer_id);
  res.json({ ok: true });
});

app.delete("/api/connections", auth, (req, res) => {
  const { peer_id } = req.body || {};
  db.prepare("DELETE FROM connections WHERE user_id=? AND peer_id=?").run(req.user.id, peer_id);
  res.json({ ok: true });
});

/* ---------------- social ---------------- */
app.get("/api/posts", (_req, res) =>
  res.json(db.prepare(`
    SELECT p.id,p.body,p.likes,p.created_at,u.name AS author,u.avatar_color
    FROM posts p JOIN users u ON u.id = p.author_id ORDER BY p.id DESC LIMIT 50`).all()));

app.post("/api/posts", auth, (req, res) => {
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: "empty post" });
  const r = db.prepare("INSERT INTO posts (author_id,body) VALUES (?,?)").run(req.user.id, body);
  res.json({ id: r.lastInsertRowid });
});

app.post("/api/posts/:id/like", auth, (req, res) => {
  db.prepare("UPDATE posts SET likes = likes + 1 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- health ---------------- */
app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

/* ================================================================
   ADMIN ENDPOINTS — require is_admin = 1
   ================================================================ */

/* --- users (master admin only for role changes) --- */
app.get("/api/admin/users", adminAuth, (_req, res) =>
  res.json(db.prepare("SELECT id,name,email,field,grad_year,role FROM users ORDER BY name").all()));

app.patch("/api/admin/users/:id", masterAuth, (req, res) => {
  const { role } = req.body || {};
  if (!["user", "admin", "master"].includes(role)) return res.status(400).json({ error: "invalid role" });
  // prevent demoting the last master
  if (role !== "master") {
    const masters = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='master'").get();
    const target = db.prepare("SELECT role FROM users WHERE id=?").get(req.params.id);
    if (target?.role === "master" && masters.c <= 1) return res.status(400).json({ error: "cannot remove the only master admin" });
  }
  db.prepare("UPDATE users SET role=? WHERE id=?").run(role, req.params.id);
  res.json({ ok: true });
});

app.delete("/api/admin/users/:id", masterAuth, (req, res) => {
  const target = db.prepare("SELECT role FROM users WHERE id=?").get(req.params.id);
  if (target?.role === "master") return res.status(400).json({ error: "cannot delete master admin" });
  db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* --- mentors --- */
app.post("/api/admin/mentors", adminAuth, (req, res) => {
  const { name, role, topic, color, photo_url, bio, linkedin, twitter } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  const r = db.prepare(
    "INSERT INTO mentors (name,role,topic,color,photo_url,bio,linkedin,twitter) VALUES (?,?,?,?,?,?,?,?)"
  ).run(name, role||"", topic||"", color||"#3B5BA9", photo_url||"", bio||"", linkedin||"", twitter||"");
  res.json({ id: r.lastInsertRowid });
});

app.put("/api/admin/mentors/:id", adminAuth, (req, res) => {
  const { name, role, topic, color, photo_url, bio, linkedin, twitter } = req.body || {};
  db.prepare(
    "UPDATE mentors SET name=?,role=?,topic=?,color=?,photo_url=?,bio=?,linkedin=?,twitter=? WHERE id=?"
  ).run(name, role||"", topic||"", color||"#3B5BA9", photo_url||"", bio||"", linkedin||"", twitter||"", req.params.id);
  res.json({ ok: true });
});

app.delete("/api/admin/mentors/:id", adminAuth, (req, res) => {
  db.prepare("DELETE FROM mentors WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* --- masterclasses --- */
app.post("/api/admin/masterclasses", adminAuth, (req, res) => {
  const { title, host, detail, tag, color } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });
  const r = db.prepare(
    "INSERT INTO masterclasses (title,host,detail,tag,color) VALUES (?,?,?,?,?)"
  ).run(title, host||"", detail||"", tag||"", color||"#1B2F52");
  res.json({ id: r.lastInsertRowid });
});

app.put("/api/admin/masterclasses/:id", adminAuth, (req, res) => {
  const { title, host, detail, tag, color } = req.body || {};
  db.prepare("UPDATE masterclasses SET title=?,host=?,detail=?,tag=?,color=? WHERE id=?")
    .run(title, host||"", detail||"", tag||"", color||"#1B2F52", req.params.id);
  res.json({ ok: true });
});

app.delete("/api/admin/masterclasses/:id", adminAuth, (req, res) => {
  db.prepare("DELETE FROM masterclasses WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* --- competitions --- */
app.post("/api/admin/competitions", adminAuth, (req, res) => {
  const { title, prize, days_left, color } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });
  const r = db.prepare(
    "INSERT INTO competitions (title,prize,days_left,color) VALUES (?,?,?,?)"
  ).run(title, prize||"", days_left||30, color||"#13294B");
  res.json({ id: r.lastInsertRowid });
});

app.put("/api/admin/competitions/:id", adminAuth, (req, res) => {
  const { title, prize, days_left, color } = req.body || {};
  db.prepare("UPDATE competitions SET title=?,prize=?,days_left=?,color=? WHERE id=?")
    .run(title, prize||"", days_left||30, color||"#13294B", req.params.id);
  res.json({ ok: true });
});

app.delete("/api/admin/competitions/:id", adminAuth, (req, res) => {
  db.prepare("DELETE FROM competitions WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* --- internships --- */
app.post("/api/admin/internships", adminAuth, (req, res) => {
  const { role, company, location, pay } = req.body || {};
  if (!role) return res.status(400).json({ error: "role required" });
  const r = db.prepare(
    "INSERT INTO internships (role,company,location,pay) VALUES (?,?,?,?)"
  ).run(role, company||"", location||"", pay||"");
  res.json({ id: r.lastInsertRowid });
});

app.put("/api/admin/internships/:id", adminAuth, (req, res) => {
  const { role, company, location, pay } = req.body || {};
  db.prepare("UPDATE internships SET role=?,company=?,location=?,pay=? WHERE id=?")
    .run(role, company||"", location||"", pay||"", req.params.id);
  res.json({ ok: true });
});

app.delete("/api/admin/internships/:id", adminAuth, (req, res) => {
  db.prepare("DELETE FROM internships WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* --- honors --- */
app.post("/api/admin/honors", adminAuth, (req, res) => {
  const { title, stream, winner, year } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });
  const r = db.prepare(
    "INSERT INTO honors (title,stream,winner,year) VALUES (?,?,?,?)"
  ).run(title, stream||"", winner||"", year||new Date().getFullYear());
  res.json({ id: r.lastInsertRowid });
});

app.put("/api/admin/honors/:id", adminAuth, (req, res) => {
  const { title, stream, winner, year } = req.body || {};
  db.prepare("UPDATE honors SET title=?,stream=?,winner=?,year=? WHERE id=?")
    .run(title, stream||"", winner||"", year||new Date().getFullYear(), req.params.id);
  res.json({ ok: true });
});

app.delete("/api/admin/honors/:id", adminAuth, (req, res) => {
  db.prepare("DELETE FROM honors WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------------- auto-seed on first start ---------------- */
function autoSeed() {
  if (db.prepare("SELECT 1 FROM mentors LIMIT 1").get()) return; // already seeded
  console.log("Empty database — running first-time seed…");
  const mentors = [
    [1, "Dr. Priya Nair", "AI Research Lead · DeepMind", "AI / ML", "#3B5BA9"],
    [2, "James Okoro", "VP Engineering · Stripe", "Systems", "#2F7D5B"],
    [3, "Lena Brandt", "Design Director · Figma", "Product Design", "#B05B7A"],
  ];
  mentors.forEach(m => db.prepare("INSERT OR IGNORE INTO mentors VALUES (?,?,?,?,?)").run(...m));
  const classes = [
    [1, "AI & The Future of Tech", "Innovate Corp", "6 sessions · Live", "Industry", "#1B2F52"],
    [2, "Creative Writing Studio", "Faculty of Arts", "4 sessions · On-demand", "Faculty", "#B05B7A"],
    [3, "Quant Finance Bootcamp", "Subject Experts", "8 sessions · Live", "Expert", "#2F7D5B"],
    [4, "Product Management 101", "Industry Panel", "5 sessions · Hybrid", "Industry", "#C79A3F"],
  ];
  classes.forEach(c => db.prepare("INSERT OR IGNORE INTO masterclasses VALUES (?,?,?,?,?,?)").run(...c));
  const comps = [
    [1, "Scholarship Challenge 2026", "Win 100% Tuition Fee", 12, "#13294B"],
    [2, "Data Science Arena 2026", "Full Scholarship + Internship", 21, "#214A7B"],
  ];
  comps.forEach(c => db.prepare("INSERT OR IGNORE INTO competitions VALUES (?,?,?,?,?)").run(...c));
  const interns = [
    [1, "SDE Intern", "Stripe", "Remote", "₹80k/mo"],
    [2, "Research Intern", "DeepMind", "London", "Funded"],
    [3, "Design Intern", "Figma", "Hybrid", "₹65k/mo"],
  ];
  interns.forEach(i => db.prepare("INSERT OR IGNORE INTO internships VALUES (?,?,?,?,?)").run(...i));
  const honors = [
    [1, "National Innovator of the Year", "All Streams", "Aisha K.", 2026],
    [2, "Rising Researcher Award", "Sciences", "Kabir J.", 2026],
    [3, "Creative Excellence", "Arts & Design", "Aditi S.", 2026],
  ];
  honors.forEach(h => db.prepare("INSERT OR IGNORE INTO honors VALUES (?,?,?,?,?)").run(...h));
  const peers = [
    ["Rohan M.", "Data Science", "#3B5BA9", 2023, 14, '["Python","ML"]', 1],
    ["Aditi S.", "Design", "#B05B7A", 2024, 9, '["UX","Figma"]', 0],
    ["Kabir J.", "Robotics", "#2F7D5B", 2022, 21, '["ROS","C++"]', 1],
    ["Mei L.", "Finance", "#C79A3F", 2024, 6, '["Quant","Risk"]', 0],
    ["Sara V.", "Biotech", "#7A5BB0", 2023, 11, '["Genomics"]', 1],
    ["Omar R.", "Product", "#4A6A8A", 2024, 8, '["Strategy","Growth"]', 0],
  ];
  peers.forEach(([n, f, c, y, mu, tg, on]) => {
    const id = crypto.randomUUID();
    db.prepare(`INSERT OR IGNORE INTO users (id,name,email,pass_hash,field,grad_year,avatar_color,tags,mutual,online,role)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, n, n.replace(/\W/g,"").toLowerCase()+"@alumnus.io",
           crypto.createHash("sha256").update("demo1234").digest("hex"), f, y, c, tg, mu, on, "user");
  });
  console.log("Seed complete.");
}
autoSeed();

/* ---------------- master admin bootstrap ----------------
   POST /api/auth/make-master  { secret, email }
   One-time use: promotes an existing account to master.
   Requires MASTER_SECRET env variable to be set on Render.
   -------------------------------------------------------- */
app.post("/api/auth/make-master", (req, res) => {
  const { secret, email } = req.body || {};
  const expected = process.env.MASTER_SECRET;
  if (!expected || secret !== expected) return res.status(403).json({ error: "invalid secret" });
  const u = db.prepare("SELECT id FROM users WHERE email=?").get(email);
  if (!u) return res.status(404).json({ error: "user not found" });
  db.prepare("UPDATE users SET role='master' WHERE id=?").run(u.id);
  console.log("Master admin set:", email);
  res.json({ ok: true, message: email + " is now master admin" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => console.log(`ALUMNUS API on port ${PORT}`));
