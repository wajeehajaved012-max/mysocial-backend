const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

let db;

async function connectDB() {
  db = await mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });

  await db.execute(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    avatar TEXT,
    bio VARCHAR(255) DEFAULT '',
    is_admin TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    image TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    UNIQUE KEY unique_like (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL,
    receiver_id INT NOT NULL,
    content TEXT NOT NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  console.log('✅ Database connected & tables ready');
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

function adminAuth(req, res, next) {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

app.get('/', (req, res) => res.json({ message: 'My Social API 🚀' }));

// AUTH
app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password min 8 characters' });
  try {
    const [ex] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (ex.length > 0) return res.status(409).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 12);
    const [r] = await db.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashed]);
    const token = jwt.sign({ id: r.insertId, name, email, is_admin: 0 }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: r.insertId, name, email, is_admin: 0, avatar: null, bio: '' } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (!users.length) return res.status(401).json({ error: 'Invalid email or password' });
    const u = users[0];
    if (!await bcrypt.compare(password, u.password)) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ id: u.id, name: u.name, email: u.email, is_admin: u.is_admin }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: u.id, name: u.name, email: u.email, avatar: u.avatar, bio: u.bio, is_admin: u.is_admin } });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// PROFILE
app.get('/api/profile', auth, async (req, res) => {
  const [u] = await db.execute('SELECT id,name,email,avatar,bio,is_admin,created_at FROM users WHERE id=?', [req.user.id]);
  res.json({ user: u[0] });
});

app.put('/api/profile', auth, async (req, res) => {
  const { name, bio, avatar } = req.body;
  await db.execute('UPDATE users SET name=?,bio=?,avatar=? WHERE id=?', [name, bio, avatar, req.user.id]);
  res.json({ message: 'Updated' });
});

app.get('/api/users', auth, async (req, res) => {
  const [users] = await db.execute('SELECT id,name,email,avatar,bio FROM users WHERE id!=?', [req.user.id]);
  res.json({ users });
});

// POSTS
app.get('/api/posts', auth, async (req, res) => {
  const [posts] = await db.execute(`
    SELECT p.*, u.name as user_name, u.avatar as user_avatar,
      (SELECT COUNT(*) FROM likes WHERE post_id=p.id) as likes_count,
      (SELECT COUNT(*) FROM likes WHERE post_id=p.id AND user_id=?) as user_liked,
      (SELECT COUNT(*) FROM comments WHERE post_id=p.id) as comments_count
    FROM posts p JOIN users u ON p.user_id=u.id ORDER BY p.created_at DESC LIMIT 50
  `, [req.user.id]);
  res.json({ posts });
});

app.post('/api/posts', auth, async (req, res) => {
  const { content, image } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  const [r] = await db.execute('INSERT INTO posts (user_id,content,image) VALUES (?,?,?)', [req.user.id, content, image || null]);
  res.status(201).json({ id: r.insertId });
});

app.delete('/api/posts/:id', auth, async (req, res) => {
  await db.execute('DELETE FROM posts WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
  res.json({ message: 'Deleted' });
});

// LIKES
app.post('/api/posts/:id/like', auth, async (req, res) => {
  try {
    await db.execute('INSERT INTO likes (post_id,user_id) VALUES (?,?)', [req.params.id, req.user.id]);
    res.json({ liked: true });
  } catch {
    await db.execute('DELETE FROM likes WHERE post_id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ liked: false });
  }
});

// COMMENTS
app.get('/api/posts/:id/comments', auth, async (req, res) => {
  const [c] = await db.execute(`
    SELECT c.*,u.name as user_name,u.avatar as user_avatar
    FROM comments c JOIN users u ON c.user_id=u.id WHERE c.post_id=? ORDER BY c.created_at ASC
  `, [req.params.id]);
  res.json({ comments: c });
});

app.post('/api/posts/:id/comments', auth, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required' });
  await db.execute('INSERT INTO comments (post_id,user_id,content) VALUES (?,?,?)', [req.params.id, req.user.id, content]);
  res.status(201).json({ message: 'Added' });
});

// MESSAGES
app.get('/api/messages/:userId', auth, async (req, res) => {
  const [msgs] = await db.execute(`
    SELECT m.*,u.name as sender_name,u.avatar as sender_avatar
    FROM messages m JOIN users u ON m.sender_id=u.id
    WHERE (m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?)
    ORDER BY m.created_at ASC
  `, [req.user.id, req.params.userId, req.params.userId, req.user.id]);
  await db.execute('UPDATE messages SET is_read=1 WHERE receiver_id=? AND sender_id=?', [req.user.id, req.params.userId]);
  res.json({ messages: msgs });
});

app.post('/api/messages/:userId', auth, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Required' });
  await db.execute('INSERT INTO messages (sender_id,receiver_id,content) VALUES (?,?,?)', [req.user.id, req.params.userId, content]);
  res.status(201).json({ message: 'Sent' });
});

app.get('/api/messages/unread/count', auth, async (req, res) => {
  const [r] = await db.execute('SELECT COUNT(*) as count FROM messages WHERE receiver_id=? AND is_read=0', [req.user.id]);
  res.json({ count: r[0].count });
});

// ADMIN
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  const [users] = await db.execute('SELECT id,name,email,bio,is_admin,created_at FROM users ORDER BY created_at DESC');
  res.json({ users });
});

app.delete('/api/admin/users/:id', auth, adminAuth, async (req, res) => {
  await db.execute('DELETE FROM users WHERE id=?', [req.params.id]);
  res.json({ message: 'Deleted' });
});

app.put('/api/admin/users/:id/password', auth, adminAuth, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Min 8 chars' });
  const hashed = await bcrypt.hash(password, 12);
  await db.execute('UPDATE users SET password=? WHERE id=?', [hashed, req.params.id]);
  res.json({ message: 'Password reset' });
});

app.delete('/api/admin/posts/:id', auth, adminAuth, async (req, res) => {
  await db.execute('DELETE FROM posts WHERE id=?', [req.params.id]);
  res.json({ message: 'Post deleted' });
});

app.post('/api/admin/make-admin/:id', auth, adminAuth, async (req, res) => {
  await db.execute('UPDATE users SET is_admin=1 WHERE id=?', [req.params.id]);
  res.json({ message: 'Promoted to admin' });
});

// First time admin setup
app.post('/api/setup-admin', async (req, res) => {
  const { email, secret } = req.body;
  if (secret !== process.env.JWT_SECRET) return res.status(403).json({ error: 'Wrong secret' });
  await db.execute('UPDATE users SET is_admin=1 WHERE email=?', [email]);
  res.json({ message: 'Admin granted!' });
});

const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
}).catch(err => { console.error(err); process.exit(1); });
