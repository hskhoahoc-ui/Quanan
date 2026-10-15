const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                name TEXT,
                address TEXT,
                phone TEXT,
                qr_code TEXT,
                banners TEXT
            );
            CREATE TABLE IF NOT EXISTS menu (
                id SERIAL PRIMARY KEY,
                item_name TEXT,
                category TEXT,
                image_url TEXT,
                description TEXT,
                unit TEXT,
                price NUMERIC,
                import_price NUMERIC DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS rooms (
                id SERIAL PRIMARY KEY,
                room_name TEXT,
                status TEXT DEFAULT 'Trống',
                customer_name TEXT
            );
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                room_id INT,
                item_id INT,
                quantity INT,
                total_price NUMERIC
            );
            CREATE TABLE IF NOT EXISTS online_orders (
                id SERIAL PRIMARY KEY,
                customer_name TEXT,
                customer_phone TEXT,
                delivery_address TEXT,
                items_detail TEXT,
                goods_total NUMERIC,
                shipping_fee NUMERIC,
                grand_total NUMERIC,
                status TEXT,
                created_date TEXT
            );
            CREATE TABLE IF NOT EXISTS bills (
                id SERIAL PRIMARY KEY,
                room_name TEXT,
                goods_total NUMERIC,
                discount_percent NUMERIC,
                discount_amount NUMERIC,
                grand_total NUMERIC,
                total_import_cost NUMERIC,
                items_detail TEXT,
                created_date TEXT,
                shipping_fee NUMERIC,
                order_type TEXT,
                payment_method TEXT
            );
            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                item_name TEXT,
                category TEXT,
                quantity NUMERIC,
                unit TEXT,
                import_price NUMERIC
            );
            CREATE TABLE IF NOT EXISTS raw_materials (
                id SERIAL PRIMARY KEY,
                material_name TEXT,
                quantity NUMERIC,
                unit TEXT,
                import_price NUMERIC,
                total_cost NUMERIC,
                created_date TEXT
            );
            CREATE TABLE IF NOT EXISTS expenses (
                id SERIAL PRIMARY KEY,
                category TEXT,
                amount NUMERIC,
                date TEXT,
                note TEXT
            );
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE,
                password TEXT,
                role TEXT
            );
            CREATE TABLE IF NOT EXISTS promotions (
                id SERIAL PRIMARY KEY,
                content TEXT,
                discount_percent NUMERIC,
                active INT
            );
        `);

        const resSet = await pool.query(`SELECT * FROM settings LIMIT 1`);
        if (resSet.rows.length === 0) {
            await pool.query(`INSERT INTO settings (name, address, phone) VALUES ('Quán ăn Demo', 'Cà Mau', '0123456789')`);
        } else {
            await pool.query(`UPDATE settings SET name = 'Quán ăn Demo' WHERE name IS NULL OR name = ''`);
        }

        const resUser = await pool.query(`SELECT * FROM users WHERE username = 'admin'`);
        if (resUser.rows.length === 0) {
            await pool.query(`INSERT INTO users (username, password, role) VALUES ('admin', '123456', 'admin')`);
            await pool.query(`INSERT INTO users (username, password, role) VALUES ('nhanvien', '123456', 'staff')`);
        }

        const resRoom = await pool.query(`SELECT * FROM rooms`);
        if (resRoom.rows.length === 0) {
            for (let i = 1; i <= 8; i++) {
                await pool.query(`INSERT INTO rooms (room_name, status) VALUES ($1, 'Trống')`, [`Bàn 0${i}`]);
            }
        }
        console.log('Khởi tạo Database Quán ăn Demo thành công!');
    } catch (err) {
        console.error('Lỗi khởi tạo DB:', err);
    }
}
initDB();

io.on('connection', (socket) => {
    console.log('Thiết bị kết nối WebSocket');
});

// API Đăng nhập
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(`SELECT * FROM users WHERE username = $1 AND password = $2`, [username, password]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            res.json({ success: true, user: { id: user.id, username: user.username, role: user.role } });
        } else {
            res.json({ success: false, error: 'Sai tài khoản hoặc mật khẩu!' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Cài đặt
app.get('/api/settings', async (req, res) => {
    const result = await pool.query(`SELECT * FROM settings LIMIT 1`);
    res.json(result.rows[0] || { name: 'Quán ăn Demo' });
});

app.post('/api/settings', async (req, res) => {
    const { name, address, phone, qr_code, banners } = req.body;
    await pool.query(`UPDATE settings SET name = $1, address = $2, phone = $3, qr_code = $4, banners = $5`, 
        [name || 'Quán ăn Demo', address, phone, qr_code, banners]);
    res.json({ success: true });
});

// Khuyến mãi
app.get('/api/promotions', async (req, res) => {
    const resPromo = await pool.query(`SELECT * FROM promotions LIMIT 1`);
    res.json(resPromo.rows[0] || { content: '', discount_percent: 0, active: 0 });
});

app.post('/api/admin/promotions', async (req, res) => {
    const { content, discount_percent, active } = req.body;
    await pool.query(`DELETE FROM promotions`);
    await pool.query(`INSERT INTO promotions (content, discount_percent, active) VALUES ($1, $2, $3)`, [content, discount_percent, active]);
    res.json({ success: true, message: 'Cập nhật khuyến mãi thành công!' });
});

// Menu / Món ăn
app.get('/api/menu', async (req, res) => {
    const result = await pool.query(`SELECT * FROM menu ORDER BY id DESC`);
    res.json(result.rows);
});

app.post('/api/menu/save', async (req, res) => {
    const { id, item_name, category, image_url, description, unit, price } = req.body;
    if (id) {
        await pool.query(`UPDATE menu SET item_name = $1, category = $2, image_url = $3, description = $4, unit = $5, price = $6 WHERE id = $7`,
            [item_name, category || 'Đồ ăn', image_url, description, unit || 'phần', price, id]);
    } else {
        await pool.query(`INSERT INTO menu (item_name, category, image_url, description, unit, price) VALUES ($1, $2, $3, $4, $5, $6)`,
            [item_name, category || 'Đồ ăn', image_url, description, unit || 'phần', price]);
    }
    res.json({ success: true });
});

app.delete('/api/menu/:id', async (req, res) => {
    await pool.query(`DELETE FROM menu WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
});

// Quản lý bàn
app.get('/api/rooms', async (req, res) => {
    const result = await pool.query(`SELECT * FROM rooms ORDER BY id ASC`);
    res.json(result.rows);
});

app.get('/api/admin/rooms', async (req, res) => {
    const result = await pool.query(`SELECT * FROM rooms ORDER BY id ASC`);
    res.json(result.rows);
});

app.post('/api/admin/rooms/save', async (req, res) => {
    const { id, room_name } = req.body;
    if (id) {
        await pool.query(`UPDATE rooms SET room_name = $1 WHERE id = $2`, [room_name, id]);
    } else {
        await pool.query(`INSERT INTO rooms (room_name, status) VALUES ($1, 'Trống')`, [room_name]);
    }
    res.json({ success: true });
});

app.delete('/api/admin/rooms/:id', async (req, res) => {
    await pool.query(`DELETE FROM rooms WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
});

// Gọi món tại bàn
const handleAddOrder = (req, res) => {
    const { room_id, item_id, quantity } = req.body;
    pool.query(`SELECT price FROM menu WHERE id = $1`, [item_id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        const item = result.rows[0];
        if (!item) return res.status(400).json({ error: 'Món không tồn tại' });
        const total_price = item.price * quantity;
        
        pool.query(`INSERT INTO orders (room_id, item_id, quantity, total_price) VALUES ($1, $2, $3, $4)`, [room_id, item_id, quantity, total_price], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            pool.query(`SELECT room_name FROM rooms WHERE id = $1`, [room_id], (err3, roomRes) => {
                if (!err3 && roomRes.rows[0]) {
                    io.emit('order_added', { roomName: roomRes.rows[0].room_name });
                }
            });
            res.json({ success: true });
        });
    });
};
app.post('/api/orders', handleAddOrder);
app.post('/api/orders/add', handleAddOrder);

app.get('/api/orders/:roomId', async (req, res) => {
    const result = await pool.query(`SELECT o.*, m.item_name, m.unit FROM orders o JOIN menu m ON o.item_id = m.id WHERE o.room_id = $1`, [req.params.roomId]);
    res.json(result.rows);
});

// Đặt hàng online
app.post('/api/online-orders/submit', async (req, res) => {
    const { customer_name, customer_phone, delivery_address, items } = req.body;
    const goods_total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const currentDate = new Date().toISOString().split('T')[0];
    const result = await pool.query(`INSERT INTO online_orders (customer_name, customer_phone, delivery_address, items_detail, goods_total, shipping_fee, grand_total, status, created_date) VALUES ($1, $2, $3, $4, $5, 0, $6, 'Chờ xác nhận', $7) RETURNING id`,
        [customer_name, customer_phone, delivery_address, JSON.stringify(items), goods_total, goods_total, currentDate]);
    io.emit('online_order_new');
    res.json({ success: true, orderId: result.rows[0].id });
});

app.get('/api/admin/online-orders', async (req, res) => {
    const result = await pool.query(`SELECT * FROM online_orders ORDER BY id DESC`);
    res.json(result.rows);
});

// Thanh toán & Kho hàng / Nguyên liệu
app.post('/api/rooms/confirm-paid', async (req, res) => {
    const { room_id, payment_method } = req.body;
    const method = payment_method || 'Tiền mặt';
    const promoRes = await pool.query(`SELECT * FROM promotions LIMIT 1`);
    const promo = promoRes.rows[0];
    const discountPercent = (promo && promo.active === 1) ? (promo.discount_percent || 0) : 0;

    const roomRes = await pool.query(`SELECT * FROM rooms WHERE id = $1`, [room_id]);
    const room = roomRes.rows[0];
    if (!room) return res.status(400).json({ error: 'Bàn không tồn tại' });

    const orderItemsRes = await pool.query(`SELECT o.*, m.item_name, m.unit, m.import_price FROM orders o JOIN menu m ON o.item_id = m.id WHERE o.room_id = $1`, [room_id]);
    const items = orderItemsRes.rows || [];
    const goodsTotal = items.reduce((sum, item) => sum + item.total_price, 0);
    const discountAmount = goodsTotal * discountPercent /
