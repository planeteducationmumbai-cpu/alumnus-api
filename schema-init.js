/* Shared table definitions, used by seed.js (server.js inlines its own copy too). */
module.exports = function init(db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, pass_hash TEXT,
    field TEXT, grad_year INTEGER, avatar_color TEXT, token TEXT,
    tags TEXT DEFAULT '[]', mutual INTEGER DEFAULT 0, online INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS mentors (
    id INTEGER PRIMARY KEY, name TEXT, role TEXT, topic TEXT, color TEXT);
  CREATE TABLE IF NOT EXISTS masterclasses (
    id INTEGER PRIMARY KEY, title TEXT, host TEXT, detail TEXT, tag TEXT, color TEXT);
  CREATE TABLE IF NOT EXISTS competitions (
    id INTEGER PRIMARY KEY, title TEXT, prize TEXT, days_left INTEGER, color TEXT);
  CREATE TABLE IF NOT EXISTS internships (
    id INTEGER PRIMARY KEY, role TEXT, company TEXT, location TEXT, pay TEXT);
  CREATE TABLE IF NOT EXISTS honors (
    id INTEGER PRIMARY KEY, title TEXT, stream TEXT, winner TEXT, year INTEGER);
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, author_id TEXT, body TEXT,
    likes INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, item_type TEXT, item_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, item_type, item_id));
  CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, peer_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, peer_id));
  `);
};
