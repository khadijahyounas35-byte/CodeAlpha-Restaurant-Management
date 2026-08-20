// CodeAlpha - Task 3: Restaurant Management System
// Pure Node.js (http) + built-in node:sqlite — no external dependencies needed.

const http = require('http');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3002;
const DB_FILE = path.join(__dirname, 'restaurant.db');

// ---------- Database setup ----------
const db = new DatabaseSync(DB_FILE);
db.exec(`
  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    price REAL NOT NULL,
    available INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient TEXT UNIQUE NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT DEFAULT 'units',
    low_stock_threshold REAL DEFAULT 5
  );

  CREATE TABLE IF NOT EXISTS menu_item_ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_item_id INTEGER NOT NULL,
    inventory_id INTEGER NOT NULL,
    qty_used REAL NOT NULL,
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
    FOREIGN KEY (inventory_id) REFERENCES inventory(id)
  );

  CREATE TABLE IF NOT EXISTS tables_ (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number INTEGER UNIQUE NOT NULL,
    seats INTEGER NOT NULL,
    status TEXT DEFAULT 'available'
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    party_size INTEGER NOT NULL,
    reservation_time TEXT NOT NULL,
    status TEXT DEFAULT 'booked',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (table_id) REFERENCES tables_(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER,
    status TEXT DEFAULT 'pending',
    total REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (table_id) REFERENCES tables_(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price_at_order REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
  );
`);

// ---------- Seed demo data ----------
const menuCount = db.prepare('SELECT COUNT(*) c FROM menu_items').get();
if (menuCount.c === 0) {
  const insMenu = db.prepare('INSERT INTO menu_items (name, category, price) VALUES (?, ?, ?)');
  const m1 = insMenu.run('Chicken Biryani', 'Main Course', 450);
  const m2 = insMenu.run('Beef Burger', 'Fast Food', 550);
  const m3 = insMenu.run('Caesar Salad', 'Starter', 350);
  insMenu.run('Soft Drink', 'Beverage', 120);

  const insInv = db.prepare('INSERT INTO inventory (ingredient, quantity, unit, low_stock_threshold) VALUES (?, ?, ?, ?)');
  const rice = insInv.run('Rice', 50, 'kg', 10);
  const chicken = insInv.run('Chicken', 30, 'kg', 5);
  const bun = insInv.run('Burger Bun', 40, 'pcs', 10);
  const patty = insInv.run('Beef Patty', 40, 'pcs', 10);
  const lettuce = insInv.run('Lettuce', 15, 'kg', 3);

  const insLink = db.prepare('INSERT INTO menu_item_ingredients (menu_item_id, inventory_id, qty_used) VALUES (?, ?, ?)');
  insLink.run(Number(m1.lastInsertRowid), Number(rice.lastInsertRowid), 0.3);
  insLink.run(Number(m1.lastInsertRowid), Number(chicken.lastInsertRowid), 0.25);
  insLink.run(Number(m2.lastInsertRowid), Number(bun.lastInsertRowid), 1);
  insLink.run(Number(m2.lastInsertRowid), Number(patty.lastInsertRowid), 1);
  insLink.run(Number(m3.lastInsertRowid), Number(lettuce.lastInsertRowid), 0.2);

  const insTable = db.prepare('INSERT INTO tables_ (table_number, seats) VALUES (?, ?)');
  for (let i = 1; i <= 8; i++) insTable.run(i, i % 2 === 0 ? 4 : 2);
}

// ---------- Prepared statements ----------
const menuAllStmt = db.prepare('SELECT * FROM menu_items ORDER BY category, name');
const menuByIdStmt = db.prepare('SELECT * FROM menu_items WHERE id = ?');
const invAllStmt = db.prepare('SELECT * FROM inventory ORDER BY ingredient');
const invByIdStmt = db.prepare('SELECT * FROM inventory WHERE id = ?');
const invUpdateStmt = db.prepare('UPDATE inventory SET quantity = ? WHERE id = ?');
const ingredientsForItemStmt = db.prepare('SELECT * FROM menu_item_ingredients WHERE menu_item_id = ?');

const tablesAllStmt = db.prepare('SELECT * FROM tables_ ORDER BY table_number');
const tableByIdStmt = db.prepare('SELECT * FROM tables_ WHERE id = ?');
const tableSetStatusStmt = db.prepare('UPDATE tables_ SET status = ? WHERE id = ?');

const createReservationStmt = db.prepare(
  'INSERT INTO reservations (table_id, customer_name, party_size, reservation_time) VALUES (?, ?, ?, ?)'
);
const reservationsAllStmt = db.prepare(`
  SELECT r.*, t.table_number FROM reservations r JOIN tables_ t ON r.table_id = t.id
  WHERE r.status = 'booked' ORDER BY r.reservation_time
`);
const cancelReservationStmt = db.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ?");
const reservationByIdStmt = db.prepare('SELECT * FROM reservations WHERE id = ?');

const createOrderStmt = db.prepare('INSERT INTO orders (table_id) VALUES (?)');
const orderByIdStmt = db.prepare('SELECT * FROM orders WHERE id = ?');
const addOrderItemStmt = db.prepare(
  'INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order) VALUES (?, ?, ?, ?)'
);
const updateOrderTotalStmt = db.prepare('UPDATE orders SET total = ? WHERE id = ?');
const orderItemsStmt = db.prepare(`
  SELECT oi.*, m.name FROM order_items oi JOIN menu_items m ON oi.menu_item_id = m.id WHERE oi.order_id = ?
`);
const ordersAllStmt = db.prepare('SELECT * FROM orders ORDER BY created_at DESC');
const updateOrderStatusStmt = db.prepare('UPDATE orders SET status = ? WHERE id = ?');

// ---------- Helpers ----------
function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function getOrderWithItems(orderId) {
  const order = orderByIdStmt.get(orderId);
  if (!order) return null;
  const items = orderItemsStmt.all(orderId);
  return { ...order, items };
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && pathname === '/') {
    return serveFile(res, path.join(__dirname, 'public', 'index.html'), 'text/html');
  }

  // ---- MENU ----
  if (req.method === 'GET' && pathname === '/api/menu') {
    return sendJSON(res, 200, menuAllStmt.all());
  }

  // ---- INVENTORY ----
  if (req.method === 'GET' && pathname === '/api/inventory') {
    const rows = invAllStmt.all().map((r) => ({ ...r, low_stock: r.quantity <= r.low_stock_threshold }));
    return sendJSON(res, 200, rows);
  }

  const invUpdateMatch = pathname.match(/^\/api\/inventory\/(\d+)$/);
  if (req.method === 'PATCH' && invUpdateMatch) {
    try {
      const id = Number(invUpdateMatch[1]);
      const raw = await readBody(req);
      const { quantity } = JSON.parse(raw || '{}');
      const inv = invByIdStmt.get(id);
      if (!inv) return sendJSON(res, 404, { error: 'Inventory item not found' });
      if (typeof quantity !== 'number' || quantity < 0) {
        return sendJSON(res, 400, { error: 'quantity must be a non-negative number' });
      }
      invUpdateStmt.run(quantity, id);
      return sendJSON(res, 200, invByIdStmt.get(id));
    } catch (err) {
      return sendJSON(res, 500, { error: 'Server error', details: err.message });
    }
  }

  // ---- TABLES ----
  if (req.method === 'GET' && pathname === '/api/tables') {
    return sendJSON(res, 200, tablesAllStmt.all());
  }

  // ---- RESERVATIONS ----
  if (req.method === 'GET' && pathname === '/api/reservations') {
    return sendJSON(res, 200, reservationsAllStmt.all());
  }

  if (req.method === 'POST' && pathname === '/api/reservations') {
    try {
      const raw = await readBody(req);
      const { table_id, customer_name, party_size, reservation_time } = JSON.parse(raw || '{}');
      if (!table_id || !customer_name || !party_size || !reservation_time) {
        return sendJSON(res, 400, { error: 'table_id, customer_name, party_size, reservation_time are required.' });
      }
      const table = tableByIdStmt.get(table_id);
      if (!table) return sendJSON(res, 404, { error: 'Table not found' });
      if (table.status !== 'available') return sendJSON(res, 400, { error: 'Table is not available.' });
      if (party_size > table.seats) return sendJSON(res, 400, { error: `Table only seats ${table.seats}.` });

      createReservationStmt.run(table_id, customer_name, party_size, reservation_time);
      tableSetStatusStmt.run('reserved', table_id);
      return sendJSON(res, 201, { message: 'Table reserved successfully.' });
    } catch (err) {
      return sendJSON(res, 500, { error: 'Server error', details: err.message });
    }
  }

  const cancelResMatch = pathname.match(/^\/api\/reservations\/(\d+)\/cancel$/);
  if (req.method === 'POST' && cancelResMatch) {
    const id = Number(cancelResMatch[1]);
    const reservation = reservationByIdStmt.get(id);
    if (!reservation) return sendJSON(res, 404, { error: 'Reservation not found' });
    cancelReservationStmt.run(id);
    tableSetStatusStmt.run('available', reservation.table_id);
    return sendJSON(res, 200, { message: 'Reservation cancelled, table freed up.' });
  }

  // ---- ORDERS ----
  // POST /api/orders  { table_id, items: [{menu_item_id, quantity}] }
  if (req.method === 'POST' && pathname === '/api/orders') {
    try {
      const raw = await readBody(req);
      const { table_id, items } = JSON.parse(raw || '{}');
      if (!Array.isArray(items) || items.length === 0) {
        return sendJSON(res, 400, { error: 'items array is required.' });
      }

      // Validate menu items + check inventory availability first
      let total = 0;
      const resolvedItems = [];
      for (const it of items) {
        const menuItem = menuByIdStmt.get(it.menu_item_id);
        if (!menuItem || !menuItem.available) {
          return sendJSON(res, 400, { error: `Menu item ${it.menu_item_id} unavailable.` });
        }
        const qty = Number(it.quantity) || 0;
        if (qty <= 0) return sendJSON(res, 400, { error: 'Quantity must be greater than 0.' });

        // check ingredient stock
        const ingredients = ingredientsForItemStmt.all(menuItem.id);
        for (const ing of ingredients) {
          const inv = invByIdStmt.get(ing.inventory_id);
          const needed = ing.qty_used * qty;
          if (inv.quantity < needed) {
            return sendJSON(res, 400, {
              error: `Not enough ${inv.ingredient} in stock for ${menuItem.name}.`,
            });
          }
        }
        resolvedItems.push({ menuItem, qty, ingredients });
        total += menuItem.price * qty;
      }

      // Create order
      const orderResult = createOrderStmt.run(table_id || null);
      const orderId = Number(orderResult.lastInsertRowid);

      // Deduct inventory + insert order_items
      for (const { menuItem, qty, ingredients } of resolvedItems) {
        addOrderItemStmt.run(orderId, menuItem.id, qty, menuItem.price);
        for (const ing of ingredients) {
          const inv = invByIdStmt.get(ing.inventory_id);
          const newQty = inv.quantity - ing.qty_used * qty;
          invUpdateStmt.run(newQty, inv.id);
        }
      }

      updateOrderTotalStmt.run(total, orderId);
      if (table_id) tableSetStatusStmt.run('occupied', table_id);

      return sendJSON(res, 201, getOrderWithItems(orderId));
    } catch (err) {
      return sendJSON(res, 500, { error: 'Server error', details: err.message });
    }
  }

  if (req.method === 'GET' && pathname === '/api/orders') {
    return sendJSON(res, 200, ordersAllStmt.all());
  }

  const orderDetailMatch = pathname.match(/^\/api\/orders\/(\d+)$/);
  if (req.method === 'GET' && orderDetailMatch) {
    const order = getOrderWithItems(Number(orderDetailMatch[1]));
    if (!order) return sendJSON(res, 404, { error: 'Order not found' });
    return sendJSON(res, 200, order);
  }

  // PATCH /api/orders/:id  { status: 'preparing' | 'served' | 'paid' | 'cancelled' }
  const orderStatusMatch = pathname.match(/^\/api\/orders\/(\d+)$/);
  if (req.method === 'PATCH' && orderStatusMatch) {
    try {
      const id = Number(orderStatusMatch[1]);
      const order = orderByIdStmt.get(id);
      if (!order) return sendJSON(res, 404, { error: 'Order not found' });
      const raw = await readBody(req);
      const { status } = JSON.parse(raw || '{}');
      const allowed = ['pending', 'preparing', 'served', 'paid', 'cancelled'];
      if (!allowed.includes(status)) return sendJSON(res, 400, { error: 'Invalid status.' });
      updateOrderStatusStmt.run(status, id);
      if (status === 'paid' && order.table_id) tableSetStatusStmt.run('available', order.table_id);
      return sendJSON(res, 200, getOrderWithItems(id));
    } catch (err) {
      return sendJSON(res, 500, { error: 'Server error', details: err.message });
    }
  }

  // ---- REPORTS ----
  if (req.method === 'GET' && pathname === '/api/reports/sales') {
    const rows = db.prepare("SELECT COUNT(*) as orders, COALESCE(SUM(total),0) as revenue FROM orders WHERE status = 'paid'").get();
    return sendJSON(res, 200, rows);
  }
  if (req.method === 'GET' && pathname === '/api/reports/low-stock') {
    const rows = invAllStmt.all().filter((r) => r.quantity <= r.low_stock_threshold);
    return sendJSON(res, 200, rows);
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`🚀 Restaurant Management System running at http://localhost:${PORT}`);
});
