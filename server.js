const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public/public')));

app.use(session({
  secret: 'my-super-secret-key-123',
  resave: false,
  saveUninitialized: true
}));

app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products WHERE is_active = 1').all();
  res.json(rows);
});

app.post('/api/apply', (req, res) => {
  const { name, country, paypal, amazon_profile, product_id } = req.body;
  if (!name || !country || !paypal || !amazon_profile || !product_id) return res.status(400).json({ error: 'Missing fields' });
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(product_id);
  if (!product || product.stock_status !== 'open') return res.status(400).json({ error: 'Unavailable' });
  const allowed = product.allowed_countries === 'ALL' || product.allowed_countries.split(',').map(s => s.trim()).includes(country);
  if (!allowed) return res.status(400).json({ error: 'Region not supported' });
  const info = db.prepare('INSERT INTO applications (name, country, paypal, amazon_profile, product_id) VALUES (?,?,?,?,?)').run(name, country, paypal, amazon_profile, product_id);
  res.json({ applicationId: info.lastInsertRowid });
});

app.get('/api/application/:id', (req, res) => {
  const appRow = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!appRow) return res.status(404).json({ error: 'not found' });
  const msgs = db.prepare('SELECT * FROM messages WHERE application_id = ? ORDER BY id').all(req.params.id);
  res.json({ application: appRow, messages: msgs });
});

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123'; 

app.post('/api/admin/login', (req, res) => {
  if (req.body.username === ADMIN_USER && req.body.password === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/api/admin/applications', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT a.*, p.name as product_name FROM applications a LEFT JOIN products p ON a.product_id = p.id ORDER BY a.id DESC').all());
});

app.post('/api/admin/review/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE applications SET status = ? WHERE id = ?').run(status, req.params.id);
  const text = status === 'approved' ? 'Approved! Please proceed with purchase.' : 'Application rejected.';
  db.prepare('INSERT INTO messages (application_id, sender, content) VALUES (?,?,?)').run(req.params.id, 'admin', text);
  io.to(`app_${req.params.id}`).emit('message', { application_id: Number(req.params.id), sender: 'admin', content: text });
  io.to(`app_${req.params.id}`).emit('notification', { type: status, text });
  res.json({ ok: true });
});

app.get('/api/admin/messages/:id', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM messages WHERE application_id = ? ORDER BY id').all(req.params.id));
});

app.get('/api/admin/products', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY id').all());
});

app.post('/api/admin/products/:id', requireAdmin, (req, res) => {
  const { stock_status, allowed_countries, is_active } = req.body;
  db.prepare('UPDATE products SET stock_status = ?, allowed_countries = ?, is_active = ? WHERE id = ?').run(stock_status, allowed_countries, is_active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  socket.on('join', (applicationId) => socket.join(`app_${applicationId}`));
  socket.on('message', (data) => {
    if (!data.applicationId || !data.content) return;
    db.prepare('INSERT INTO messages (application_id, sender, content) VALUES (?,?,?)').run(data.applicationId, data.sender, data.content);
    io.to(`app_${data.applicationId}`).emit('message', { application_id: Number(data.applicationId), sender: data.sender, content: data.content });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
