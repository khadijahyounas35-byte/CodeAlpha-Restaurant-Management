# CodeAlpha_RestaurantManagement

Restaurant Management System backend — CodeAlpha Internship, Task 3.

## Tech Stack
- Node.js (built-in `http` module — no framework dependency needed)
- Built-in `node:sqlite` (SQLite) for storage
- Vanilla HTML/JS frontend

## Features
- **Menu** — `GET /api/menu` lists all menu items with price & category
- **Inventory** — `GET /api/inventory` shows stock levels, flags low-stock items
- **Tables** — `GET /api/tables`, reserve (`POST /api/reservations`) and free (`PUT /api/tables/:id/free`) tables, with seat-capacity and availability checks
- **Orders** — `POST /api/orders` places an order for a table; automatically:
  - checks each ingredient has enough stock
  - deducts the required ingredients from inventory
  - calculates the order total
- **Order status** — `PUT /api/orders/:id/status` moves an order through `pending → preparing → served → paid/cancelled`
- **Reports** — `GET /api/reports/sales` (total paid sales), `GET /api/reports/low-stock` (stock alerts)
- Simple web UI at `/` to view menu/inventory/tables and place orders

Demo data (4 menu items, 6 inventory ingredients linked to recipes, 4 tables) is seeded automatically on first run.

## Run it
```bash
node server.js
```
Then open **http://localhost:3002** in your browser.
(Requires Node.js 22+ for built-in SQLite support.)

## API Examples
```bash
# View menu
curl http://localhost:3002/api/menu

# Reserve table 1
curl -X POST http://localhost:3002/api/reservations \
  -H "Content-Type: application/json" \
  -d '{"table_id":1,"customer_name":"Sara","party_size":2,"reservation_time":"2026-08-20 20:00"}'

# Place an order (2x Chicken Biryani for table 2) — auto-deducts inventory
curl -X POST http://localhost:3002/api/orders \
  -H "Content-Type: application/json" \
  -d '{"table_id":2,"items":[{"menu_item_id":1,"quantity":2}]}'

# Mark order as paid
curl -X PUT http://localhost:3002/api/orders/1/status \
  -H "Content-Type: application/json" -d '{"status":"paid"}'

# Sales report
curl http://localhost:3002/api/reports/sales

# Low stock report
curl http://localhost:3002/api/reports/low-stock
```

## Project Structure
```
CodeAlpha_RestaurantManagement/
├── server.js        # Backend server + API + inventory/order logic
├── public/
│   └── index.html   # Frontend UI
├── restaurant.db     # SQLite database (auto-created on first run)
└── README.md
```

---
Submitted as part of the **CodeAlpha Backend Development Internship**.
