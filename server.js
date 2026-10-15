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
    ssl: { rejectUnauthorized: false },
    family: 4
});

// Khởi tạo toàn bộ Database và bảng dữ liệu đầy đủ
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

        // Thiết lập tên khởi tạo mặc định là "Quán ăn Demo"
        const resSet = await pool.query(`SELECT * FROM settings LIMIT 1`);
        if (resSet.rows.length === 0) {
            await pool.query(`INSERT INTO settings (name, address, phone) VALUES ('Quán ăn Demo', 'Cà Mau', '0123456789')`);
        } else {
            await pool.query(`UPDATE settings SET name = 'Quán ăn Demo' WHERE name IS NULL OR name = ''`);
        }

        // Tạo tài khoản admin và nhân viên mặc định nếu chưa có
        const resUser = await pool.query(`SELECT * FROM users WHERE username = 'admin'`);
        if (resUser.rows.length === 0) {
            await pool.query(`INSERT INTO users (username, password, role) VALUES ('admin', '123456', 'admin')`);
            await pool.query(`INSERT INTO users (username, password, role) VALUES ('nhanvien', '123456', 'staff')`);
        }

        // Tạo sẵn một số bàn mẫu nếu chưa có
        const resRoom = await pool.query(`SELECT * FROM rooms`);
        if (resRoom.rows.length === 0) {
            for (let i = 1; i <= 8; i++) {
                await pool.query(`INSERT INTO rooms (room_name, status) VALUES ($1, 'Trống')`, [`Bàn 0${i}`]);
            }
        }

        console.log('Khởi tạo Database thành công!');
    } catch (err) {
        console.error('Lỗi khởi tạo DB:', err);
    }
}
initDB();

io.on('connection', (socket) => {
    console.log('Một thiết bị đã kết nối Realtime WebSocket');
});

// API Lấy cài đặt
app.get('/api/settings', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM settings LIMIT 1`);
        res.json(result.rows[0] || { name: 'Quán ăn Demo' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Cập nhật cài đặt
app.post('/api/settings', async (req, res) => {
    const { name, address, phone, qr_code, banners } = req.body;
    try {
        await pool.query(`UPDATE settings SET name = $1, address = $2, phone = $3, qr_code = $4, banners = $5`, 
            [name || 'Quán ăn Demo', address, phone, qr_code, banners]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Lấy danh sách thực đơn / món ăn
app.get('/api/menu', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM menu ORDER BY id DESC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Thêm / Sửa món ăn (Dành cho Admin hoặc Nhân viên)
app.post('/api/menu/save', async (req, res) => {
    const { id, item_name, category, image_url, description, unit, price } = req.body;
    try {
        if (id) {
            await pool.query(
                `UPDATE menu SET item_name = $1, category = $2, image_url = $3, description = $4, unit = $5, price = $6 WHERE id = $7`,
                [item_name, category || 'Đồ ăn', image_url, description, unit || 'phần', price, id]
            );
        } else {
            await pool.query(
                `INSERT INTO menu (item_name, category, image_url, description, unit, price) VALUES ($1, $2, $3, $4, $5, $6)`,
                [item_name, category || 'Đồ ăn', image_url, description, unit || 'phần', price]
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Xóa món ăn
app.delete('/api/menu/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM menu WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Lấy danh sách bàn
app.get('/api/rooms', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM rooms ORDER BY id ASC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Lấy danh sách tài khoản
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, username, role FROM users`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

server.listen(PORT, () => {
    console.log(`Server Quán ăn Demo đang chạy tại cổng ${PORT}`);
});
