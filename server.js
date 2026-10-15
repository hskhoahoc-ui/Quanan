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
    connectionString: process.env.DATABASE_URL || '2026-10-15T11:03:44.212754715Z 
2026-10-15T11:03:44.212758696Z 3 vulnerabilities (2 moderate, 1 high)
2026-10-15T11:03:44.212760077Z 
2026-10-15T11:03:44.212761765Z To address all issues possible (including breaking changes), run:
2026-10-15T11:03:44.212763551Z   npm audit fix --force
2026-10-15T11:03:44.212765169Z 
2026-10-15T11:03:44.212769571Z Some issues need review, and may require choosing
2026-10-15T11:03:44.212770924Z a different dependency.
2026-10-15T11:03:44.212772097Z 
2026-10-15T11:03:44.212773456Z Run `npm audit` for details.
2026-10-15T11:03:45.015609353Z ==> Uploading build...
2026-10-15T11:03:47.388194473Z ==> Uploaded in 1.9s. Compression took 0.4s
2026-10-15T11:03:47.388948594Z ==> Build successful 🎉
2026-10-15T11:03:48.42082425Z ==> Deploying...
2026-10-15T11:03:48.521949783Z ==> Setting WEB_CONCURRENCY=1 by default, based on available CPUs in the instance
2026-10-15T11:04:02.624364771Z ==> Running 'npm start'
2026-10-15T11:04:03.82321847Z 
2026-10-15T11:04:03.823255411Z > coffee-shop-management@1.0.0 start
2026-10-15T11:04:03.823263081Z > node server.js
2026-10-15T11:04:03.823265751Z 
2026-10-15T11:04:05.525231218Z Server Quán ăn Demo đang chạy tại cổng 10000
2026-10-15T11:04:06.890510606Z Lỗi khởi tạo DB: error: password authentication failed for user "postgres"
2026-10-15T11:04:06.890542977Z     at /opt/render/project/src/node_modules/pg-pool/index.js:45:11
2026-10-15T11:04:06.890548347Z     at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
2026-10-15T11:04:06.890553068Z     at async initDB (/opt/render/project/src/server.js:26:9) {
2026-10-15T11:04:06.890555708Z   length: 71,
2026-10-15T11:04:06.890559168Z   severity: 'FATAL',
2026-10-15T11:04:06.890561848Z   code: '28P01',
2026-10-15T11:04:06.890564288Z   detail: undefined,
2026-10-15T11:04:06.890566808Z   hint: undefined,
2026-10-15T11:04:06.890569238Z   position: undefined,
2026-10-15T11:04:06.890573418Z   internalPosition: undefined,
2026-10-15T11:04:06.890575828Z   internalQuery: undefined,
2026-10-15T11:04:06.890578128Z   where: undefined,
2026-10-15T11:04:06.890580348Z   schema: undefined,
2026-10-15T11:04:06.890582599Z   table: undefined,
2026-10-15T11:04:06.890585128Z   column: undefined,
2026-10-15T11:04:06.890587428Z   dataType: undefined,
2026-10-15T11:04:06.890589899Z   constraint: undefined,
2026-10-15T11:04:06.890592349Z   file: undefined,
2026-10-15T11:04:06.890594799Z   line: undefined,
2026-10-15T11:04:06.890597619Z   routine: undefined
2026-10-15T11:04:06.890600209Z }
2026-10-15T11:04:09.701951912Z ==> Your service is live 🎉
2026-10-15T11:04:09.784118223Z ==> 
2026-10-15T11:04:09.790832968Z ==> ///////////////////////////////////////////////////////////
2026-10-15T11:04:09.797764212Z ==> 
2026-10-15T11:04:09.80604481Z ==> Available at your primary URL https://quanan-oszr.onrender.com
2026-10-15T11:04:09.81031158Z ==> 
2026-10-15T11:04:09.81457455Z ==> ///////////////////////////////////////////////////////////',
    ssl: { rejectUnauthorized: false },
    family: 4
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
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE,
                password TEXT,
                role TEXT
            );
        `);

        // Thiết lập tên khởi tạo mặc định là "Quán ăn Demo" nếu chưa có
        const resSet = await pool.query(`SELECT * FROM settings LIMIT 1`);
        if (resSet.rows.length === 0) {
            await pool.query(`INSERT INTO settings (name, address, phone) VALUES ('Quán ăn Demo', 'Cà Mau', '0123456789')`);
        } else {
            await pool.query(`UPDATE settings SET name = 'Quán ăn Demo' WHERE name IS NULL OR name = ''`);
        }
    } catch (err) {
        console.error('Lỗi khởi tạo DB:', err);
    }
}
initDB();

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
