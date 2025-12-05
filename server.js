const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// --- 1. CONFIGURATION FOR LIVE SERVER ---

// Allows your frontend to talk to this backend
app.use(cors({
    origin: ['https://northsupermart.pk', 'http://northsupermart.pk'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json());

// Define your domain for image links (Assuming backend is on 'api' subdomain)
const LIVE_DOMAIN = "https://api.northsupermart.pk"; 

// --- 2. UPLOAD FOLDER SETUP ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// --- 3. DATABASE CONNECTION (FILL THIS IN) ---
const db = mysql.createConnection({
  host: 'localhost',                // Keep this as 'localhost' for Hostinger
  user: 'u123456789_admin',         // PASTE YOUR HOSTINGER DB USERNAME HERE
  password: 'YourStrongPassword123',// PASTE YOUR HOSTINGER DB PASSWORD HERE
  database: 'u123456789_mart'       // PASTE YOUR HOSTINGER DB NAME HERE
});

db.connect((err) => {
  if (err) console.error('DB Error:', err);
  else console.log('Connected to MySQL');
});

// --- PUBLIC ROUTES ---

// 1. GET STORE SETTINGS
app.get('/api/settings', (req, res) => {
  db.query('SELECT * FROM store_settings', (err, data) => {
    if (err) return res.status(500).json(err);
    const settings = {};
    data.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    return res.json(settings);
  });
});

app.get('/api/products', (req, res) => {
  db.query('SELECT * FROM products ORDER BY id DESC', (err, data) => res.json(err ? [] : data));
});

app.get('/api/products/:id', (req, res) => {
  db.query('SELECT * FROM products WHERE id = ?', [req.params.id], (err, data) => res.json(err ? {} : data[0]));
});

app.post('/api/signup', (req, res) => {
  const sql = "INSERT INTO users (`name`, `email`, `password`) VALUES (?)";
  db.query(sql, [[req.body.name, req.body.email, req.body.password]], (err) => {
    if (err) return res.status(500).json({ error: "Error" });
    return res.json({ message: "Registered" });
  });
});

app.post('/api/login', (req, res) => {
  const sql = "SELECT * FROM users WHERE email = ? AND password = ?";
  db.query(sql, [req.body.email, req.body.password], (err, data) => {
    if (err || data.length === 0) return res.status(401).json({ message: "Invalid" });
    return res.json(data[0]);
  });
});

app.post('/api/contact', (req, res) => {
  const sql = "INSERT INTO messages (`name`, `email`, `subject`, `message`) VALUES (?)";
  const values = [req.body.name, req.body.email, req.body.subject, req.body.message];
  db.query(sql, [values], (err) => {
    if (err) return res.status(500).json(err);
    return res.json({ message: "Sent" });
  });
});

app.post('/api/orders', (req, res) => {
  const sql = "INSERT INTO orders (`user_id`, `customer_name`, `phone`, `address`, `city`, `postal_code`, `total_amount`, `payment_method`, `cart_items`) VALUES (?)";
  const cartJson = JSON.stringify(req.body.cartItems);
  const values = [req.body.userId, req.body.customerName, req.body.phone, req.body.address, req.body.city, req.body.postalCode, req.body.totalAmount, req.body.paymentMethod, cartJson];
  db.query(sql, [values], (err, data) => {
    if (err) return res.status(500).json(err);
    return res.json({ message: "Order placed", orderId: data.insertId });
  });
});

// --- ADMIN ROUTES ---

// 2. UPDATE SETTINGS
app.post('/api/admin/settings', (req, res) => {
  const settings = req.body;
  const queries = [];
  
  for (const key in settings) {
    queries.push(new Promise((resolve, reject) => {
      const sql = "INSERT INTO store_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?";
      db.query(sql, [key, settings[key], settings[key]], (err) => {
        if (err) reject(err);
        else resolve();
      });
    }));
  }

  Promise.all(queries)
    .then(() => res.json({ message: "Settings updated" }))
    .catch((err) => res.status(500).json(err));
});

app.get('/api/admin/messages', (req, res) => {
  db.query('SELECT * FROM messages ORDER BY created_at DESC', (err, data) => {
    if (err) return res.status(500).json(err);
    return res.json(data);
  });
});

app.post('/api/admin/login', (req, res) => {
  const sql = "SELECT * FROM admins WHERE username = ? AND password = ?";
  db.query(sql, [req.body.username, req.body.password], (err, data) => {
    if (data.length > 0) return res.json({ message: "Success" });
    else return res.status(401).json({ message: "Invalid" });
  });
});

app.get('/api/admin/stats', (req, res) => {
    const stats = {};
    db.query('SELECT SUM(total_amount) as total_sales FROM orders', (err, sales) => {
      stats.sales = sales[0].total_sales || 0;
      db.query('SELECT COUNT(*) as total_orders FROM orders', (err, orders) => {
        stats.orders = orders[0].total_orders || 0;
        db.query('SELECT COUNT(*) as total_products FROM products', (err, products) => {
          stats.products = products[0].total_products || 0;
          db.query('SELECT COUNT(*) as total_users FROM users', (err, users) => {
            stats.users = users[0].total_users || 0;
            res.json(stats);
          });
        });
      });
    });
});

app.get('/api/admin/orders', (req, res) => {
  db.query('SELECT * FROM orders ORDER BY created_at DESC', (err, data) => res.json(err ? [] : data));
});

app.put('/api/admin/orders/:id', (req, res) => {
  db.query("UPDATE orders SET status = ? WHERE id = ?", [req.body.status, req.params.id], (err) => res.json({ message: "Updated" }));
});

// POST PRODUCT - UPDATED FOR LIVE URL
app.post('/api/admin/products', upload.single('image'), (req, res) => {
  // Use LIVE_DOMAIN instead of localhost
  const imageUrl = req.file ? `${LIVE_DOMAIN}/uploads/${req.file.filename}` : req.body.imageUrl;
  const sql = "INSERT INTO products (`name`, `category`, `price`, `image`, `description`) VALUES (?)";
  db.query(sql, [[req.body.name, req.body.category, req.body.price, imageUrl, req.body.description]], (err) => res.json({ message: "Added" }));
});

// PUT PRODUCT - UPDATED FOR LIVE URL
app.put('/api/admin/products/:id', upload.single('image'), (req, res) => {
  let sql = "UPDATE products SET `name`=?, `category`=?, `price`=?, `description`=? WHERE id=?";
  let values = [req.body.name, req.body.category, req.body.price, req.body.description, req.params.id];
  if (req.file) {
    sql = "UPDATE products SET `name`=?, `category`=?, `price`=?, `description`=?, `image`=? WHERE id=?";
    // Use LIVE_DOMAIN instead of localhost
    values = [req.body.name, req.body.category, req.body.price, req.body.description, `${LIVE_DOMAIN}/uploads/${req.file.filename}`, req.params.id];
  }
  db.query(sql, values, (err) => res.json({ message: "Updated" }));
});

app.delete('/api/admin/products/:id', (req, res) => {
  db.query("DELETE FROM products WHERE id = ?", [req.params.id], (err) => res.json({ message: "Deleted" }));
});

// --- SERVER STARTUP ---
// Hostinger provides the port automatically via process.env.PORT
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});