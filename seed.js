/* Seeds alumnus.db with demo data matching the app UI. Run: npm run seed */
const Database = require("better-sqlite3");
const crypto = require("crypto");
const db = new Database(process.env.DB_FILE || "alumnus.db");
const hash = (p) => crypto.createHash("sha256").update(p).digest("hex");

require("./schema-init")(db); // ensures tables exist if run before server

const wipe = ["connections", "enrollments", "posts", "honors", "internships", "competitions", "masterclasses", "mentors", "users"];
wipe.forEach((t) => { try { db.exec(`DELETE FROM ${t}`); } catch {} });

// demo user (login: aisha@alumnus.io / demo1234)
const uid = crypto.randomUUID();
db.prepare(`INSERT INTO users (id,name,email,pass_hash,field,grad_year,avatar_color,token)
            VALUES (?,?,?,?,?,?,?,?)`)
  .run(uid, "Aisha K.", "aisha@alumnus.io", hash("demo1234"), "Computer Science", 2024, "#C79A3F", null);

const peers = [
  ["Rohan M.", "Data Science", "#3B5BA9", 2023, 14, '["Python","ML"]', 1],
  ["Aditi S.", "Design", "#B05B7A", 2024, 9, '["UX","Figma"]', 0],
  ["Kabir J.", "Robotics", "#2F7D5B", 2022, 21, '["ROS","C++"]', 1],
  ["Mei L.", "Finance", "#C79A3F", 2024, 6, '["Quant","Risk"]', 0],
  ["Sara V.", "Biotech", "#7A5BB0", 2023, 11, '["Genomics"]', 1],
  ["Omar R.", "Product", "#4A6A8A", 2024, 8, '["Strategy","Growth"]', 0],
];
peers.forEach(([n, f, c, y, mu, tg, on]) =>
  db.prepare(`INSERT INTO users (id,name,email,pass_hash,field,grad_year,avatar_color,tags,mutual,online)
              VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(crypto.randomUUID(), n, n.replace(/\W/g, "").toLowerCase() + "@a.io", hash("demo1234"), f, y, c, tg, mu, on));

const mentors = [
  [1, "Dr. Priya Nair", "AI Research Lead · DeepMind", "AI / ML", "#3B5BA9"],
  [2, "James Okoro", "VP Engineering · Stripe", "Systems", "#2F7D5B"],
  [3, "Lena Brandt", "Design Director · Figma", "Product Design", "#B05B7A"],
];
mentors.forEach((m) => db.prepare("INSERT INTO mentors VALUES (?,?,?,?,?)").run(...m));

const classes = [
  [1, "AI & The Future of Tech", "Innovate Corp", "6 sessions · Live", "Industry", "#1B2F52"],
  [2, "Creative Writing Studio", "Faculty of Arts", "4 sessions · On-demand", "Faculty", "#B05B7A"],
  [3, "Quant Finance Bootcamp", "Subject Experts", "8 sessions · Live", "Expert", "#2F7D5B"],
  [4, "Product Management 101", "Industry Panel", "5 sessions · Hybrid", "Industry", "#C79A3F"],
];
classes.forEach((c) => db.prepare("INSERT INTO masterclasses VALUES (?,?,?,?,?,?)").run(...c));

const comps = [
  [1, "Scholarship Challenge 2026", "Win 100% Tuition Fee", 12, "#13294B"],
  [2, "Data Science Arena 2026", "Full Scholarship + Internship", 21, "#214A7B"],
];
comps.forEach((c) => db.prepare("INSERT INTO competitions VALUES (?,?,?,?,?)").run(...c));

const interns = [
  [1, "SDE Intern", "Stripe", "Remote", "₹80k/mo"],
  [2, "Research Intern", "DeepMind", "London", "Funded"],
  [3, "Design Intern", "Figma", "Hybrid", "₹65k/mo"],
];
interns.forEach((i) => db.prepare("INSERT INTO internships VALUES (?,?,?,?,?)").run(...i));

const honors = [
  [1, "National Innovator of the Year", "All Streams", "Aisha K.", 2026],
  [2, "Rising Researcher Award", "Sciences", "Kabir J.", 2026],
  [3, "Creative Excellence", "Arts & Design", "Aditi S.", 2026],
];
honors.forEach((h) => db.prepare("INSERT INTO honors VALUES (?,?,?,?,?)").run(...h));

db.prepare("INSERT INTO posts (author_id,body,likes) VALUES (?,?,?)")
  .run(uid, "Grateful to my mentor Dr. Nair — offer accepted! 🎓", 76);

console.log("Seeded alumnus.db ✓  (demo login: aisha@alumnus.io / demo1234)");
