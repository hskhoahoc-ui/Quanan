const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const ExcelJS = require('exceljs');

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
                import_price NUMERIC,
                price NUMERIC DEFAULT 0
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
            CREATE TABLE IF NOT EXISTS ingredients (
                id SERIAL PRIMARY KEY,
                ingredient_name TEXT,
                quantity NUMERIC,
                unit TEXT,
                import_price NUMERIC
            );
        `);

        await pool.query(`ALTER TABLE inventory ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;`);

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
            for (let i = 1; i <= 6; i++) {
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
    console.log('Thiết bị kết nối WebSocket');
});

// Đăng nhập
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
    res.json(result.rows[0] || { name: 'Quán ăn Demo', qr_code: '' });
});

app.post('/api/settings', async (req, res) => {
    const { name, address, phone, qr_code, banners } = req.body;
    await pool.query(`UPDATE settings SET name = $1, address = $2, phone = $3, qr_code = $4, banners = $5`, 
        [name || 'Quán ăn Demo', address, phone, qr_code, banners]);
    res.json({ success: true });
});

// Khuyến mãi
app.get('/api/promotions', async (req, res) => {
    const result = await pool.query(`SELECT * FROM promotions LIMIT 1`);
    res.json(result.rows[0] || { content: '', discount_percent: 0, active: 0 });
});

app.post('/api/admin/promotions', async (req, res) => {
    const { content, discount_percent, active } = req.body;
    const check = await pool.query(`SELECT * FROM promotions LIMIT 1`);
    if(check.rows.length === 0) {
        await pool.query(`INSERT INTO promotions (content, discount_percent, active) VALUES ($1, $2, $3)`, [content, discount_percent, active]);
    } else {
        await pool.query(`UPDATE promotions SET content = $1, discount_percent = $2, active = $3`, [content, discount_percent, active]);
    }
    res.json({ success: true, message: 'Cập nhật khuyến mãi thành công!' });
});

// Menu / Món ăn & Đồ uống
app.get('/api/menu', async (req, res) => {
    const result = await pool.query(`SELECT * FROM menu ORDER BY id DESC`);
    res.json(result.rows);
});

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

app.delete('/api/menu/:id', async (req, res) => {
    await pool.query(`DELETE FROM menu WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
});

// Quản lý Bàn
app.get('/api/rooms', async (req, res) => {
    const result = await pool.query(`SELECT * FROM rooms ORDER BY id ASC`);
    res.json(result.rows);
});

app.post('/api/rooms/open', async (req, res) => {
    const { room_id, customer_name } = req.body;
    await pool.query(`UPDATE rooms SET status = 'Đang phục vụ', customer_name = $1 WHERE id = $2`, [customer_name || 'Khách lẻ', room_id]);
    res.json({ success: true });
});

app.get('/api/admin/rooms', async (req, res) => {
    const result = await pool.query(`SELECT * FROM rooms ORDER BY id ASC`);
    res.json(result.rows);
});

app.post('/api/admin/rooms/save', async (req, res) => {
    const { id, room_name } = req.body;
    if(id) {
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

// Đặt món tại bàn
const handleAddOrder = (req, res) => {
    const { room_id, item_id, quantity } = req.body;
    pool.query(`SELECT price, item_name FROM menu WHERE id = $1`, [item_id], (err, result) => {
        if (err || !result.rows[0]) return res.status(400).json({ error: 'Món không tồn tại' });
        const item = result.rows[0];
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

// Thanh toán & Chốt bàn
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
    const discountAmount = goodsTotal * discountPercent / 100;
    const grandTotal = goodsTotal - discountAmount;
    const totalImportCost = items.reduce((sum, item) => sum + (item.import_price * item.quantity), 0);
    const currentDate = new Date().toISOString().split('T')[0];

    try {
        await pool.query(`INSERT INTO bills (room_name, goods_total, discount_percent, discount_amount, grand_total, total_import_cost, items_detail, created_date, shipping_fee, order_type, payment_method) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 'Tại bàn', $9)`,
            [room.room_name, goodsTotal, discountPercent, discountAmount, grandTotal, totalImportCost, JSON.stringify(items), currentDate, method]);
        
        for (const item of items) {
            await pool.query(`UPDATE inventory SET quantity = GREATEST(0, quantity - $1) WHERE item_name = $2`, [item.quantity, item.item_name]);
        }

        await pool.query(`UPDATE rooms SET status = 'Trống', customer_name = NULL WHERE id = $1`, [room_id]);
        await pool.query(`DELETE FROM orders WHERE room_id = $1`, [room_id]);

        io.emit('room_paid', { roomName: room.room_name });
        res.json({ success: true, roomName: room.room_name });
    } catch (errDb) {
        res.status(500).json({ error: errDb.message });
    }
});

// Đặt hàng online
app.post('/api/online-orders/submit', (req, res) => {
    const { customer_name, customer_phone, delivery_address, items } = req.body;
    const goods_total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const currentDate = new Date().toISOString().split('T')[0];

    pool.query(`INSERT INTO online_orders (customer_name, customer_phone, delivery_address, items_detail, goods_total, shipping_fee, grand_total, status, created_date) VALUES ($1, $2, $3, $4, $5, 0, $6, 'Chờ xác nhận', $7) RETURNING id`,
        [customer_name, customer_phone, delivery_address, JSON.stringify(items), goods_total, goods_total, currentDate], (err, result) => {
            if (err) return res.status(500).json({ error: 'Lỗi lưu đơn hàng' });
            io.emit('online_order_new');
            res.json({ success: true, orderId: result.rows[0].id });
        });
});

app.get('/api/admin/online-orders', async (req, res) => {
    const result = await pool.query(`SELECT * FROM online_orders ORDER BY id DESC`);
    res.json(result.rows);
});

app.post('/api/admin/online-orders/checkout', async (req, res) => {
    const { order_id, shipping_fee, payment_method } = req.body;
    const orderRes = await pool.query(`SELECT * FROM online_orders WHERE id = $1`, [order_id]);
    const order = orderRes.rows[0];
    if(!order) return res.status(400).json({ error: 'Đơn hàng không tồn tại' });

    const items = JSON.parse(order.items_detail);
    const goodsTotal = order.goods_total;
    const ship = parseFloat(shipping_fee) || 0;
    const grandTotal = goodsTotal + ship;
    const currentDate = new Date().toISOString().split('T')[0];
    const totalImportCost = 0;

    await pool.query(`UPDATE online_orders SET shipping_fee = $1, grand_total = $2, status = 'Đã hoàn thành' WHERE id = $3`, [ship, grandTotal, order_id]);
    await pool.query(`INSERT INTO bills (room_name, goods_total, discount_percent, discount_amount, grand_total, total_import_cost, items_detail, created_date, shipping_fee, order_type, payment_method) VALUES ($1, $2, 0, 0, $3, $4, $5, $6, $7, 'Online', $8)`,
        [`Online: ${order.customer_name}`, goodsTotal, grandTotal, totalImportCost, order.items_detail, currentDate, ship, payment_method || 'Chuyển khoản']);

    for(const item of items) {
        await pool.query(`UPDATE inventory SET quantity = GREATEST(0, quantity - $1) WHERE item_name = $2`, [item.quantity, item.item_name]);
    }

    const setRes = await pool.query(`SELECT * FROM settings LIMIT 1`);
    res.json({ success: true, setting: setRes.rows[0], report: { room_name: `Online - ${order.customer_name}`, items, goodsTotal, shippingFee: ship, grandTotal } });
});

// Kho hàng hóa & Tự động đồng bộ chuẩn danh mục sang Menu
app.get('/api/inventory', async (req, res) => {
    const result = await pool.query(`SELECT * FROM inventory ORDER BY id DESC`);
    res.json(result.rows);
});

app.post('/api/inventory', async (req, res) => {
    const { item_name, category, quantity, unit, import_price, price } = req.body;
    try {
        const sellingPrice = price || (Number(import_price) * 1.5);
        const unitLower = (unit || '').toLowerCase();
        const menuCategory = (unitLower === 'chai' || unitLower === 'lon') ? 'Nước đóng chai' : (category || 'Đồ uống');

        await pool.query(`INSERT INTO inventory (item_name, category, quantity, unit, import_price, price) VALUES ($1, $2, $3, $4, $5, $6)`,
            [item_name, category || 'Đồ uống', quantity, unit || 'chai', import_price, sellingPrice]);

        const checkMenu = await pool.query(`SELECT * FROM menu WHERE item_name = $1`, [item_name]);
        if (checkMenu.rows.length === 0) {
            await pool.query(`INSERT INTO menu (item_name, category, description, unit, price, import_price) VALUES ($1, $2, $3, $4, $5, $6)`,
                [item_name, menuCategory, 'Hàng đóng chai/lon', unit || 'chai', sellingPrice, import_price]);
        } else {
            await pool.query(`UPDATE menu SET price = $1, unit = $2, category = $3 WHERE item_name = $4`,
                [sellingPrice, unit, menuCategory, item_name]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/update', async (req, res) => {
    const { id, item_name, category, quantity, unit, import_price, price } = req.body;
    try {
        const unitLower = (unit || '').toLowerCase();
        const menuCategory = (unitLower === 'chai' || unitLower === 'lon') ? 'Nước đóng chai' : (category || 'Đồ uống');

        await pool.query(`UPDATE inventory SET item_name = $1, category = $2, quantity = $3, unit = $4, import_price = $5, price = $6 WHERE id = $7`,
            [item_name, category, quantity, unit, import_price, price, id]);
        
        await pool.query(`UPDATE menu SET price = $1, unit = $2, category = $3 WHERE item_name = $4`, 
            [price, unit, menuCategory, item_name]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM inventory WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Nguyên liệu đầu vào
app.get('/api/ingredients', async (req, res) => {
    const result = await pool.query(`SELECT * FROM ingredients ORDER BY id DESC`);
    res.json(result.rows);
});

app.post('/api/ingredients', async (req, res) => {
    const { ingredient_name, quantity, unit, import_price } = req.body;
    await pool.query(`INSERT INTO ingredients (ingredient_name, quantity, unit, import_price) VALUES ($1, $2, $3, $4)`,
        [ingredient_name, quantity, unit, import_price]);
    res.json({ success: true });
});

app.delete('/api/ingredients/:id', async (req, res) => {
    await pool.query(`DELETE FROM ingredients WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
});

// Chi phí
app.get('/api/expenses', async (req, res) => {
    const result = await pool.query(`SELECT * FROM expenses ORDER BY id DESC`);
    res.json(result.rows);
});

app.post('/api/expenses', async (req, res) => {
    const { category, amount, date, note } = req.body;
    await pool.query(`INSERT INTO expenses (category, amount, date, note) VALUES ($1, $2, $3, $4)`, [category, amount, date, note]);
    res.json({ success: true });
});

app.delete('/api/expenses/:id', async (req, res) => {
    await pool.query(`DELETE FROM expenses WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
});

// Hóa đơn & Báo cáo
app.get('/api/bills', async (req, res) => {
    const result = await pool.query(`SELECT * FROM bills ORDER BY id DESC`);
    res.json(result.rows);
});

app.get('/api/reports/revenue', async (req, res) => {
    const { start_date, end_date } = req.query;
    let queryBills = `SELECT SUM(grand_total) as total_rev, SUM(total_import_cost) as total_cost FROM bills`;
    let queryExp = `SELECT SUM(amount) as total_exp FROM expenses`;
    let queryIng = `SELECT SUM(quantity * import_price) as total_ing FROM ingredients`;

    if(start_date && end_date) {
        queryBills += ` WHERE created_date BETWEEN '${start_date}' AND '${end_date}'`;
        queryExp += ` WHERE date BETWEEN '${start_date}' AND '${end_date}'`;
    }

    const bRes = await pool.query(queryBills);
    const eRes = await pool.query(queryExp);
    const iRes = await pool.query(queryIng);

    const totalRevenue = Number(bRes.rows[0].total_rev || 0);
    const goodsCost = Number(bRes.rows[0].total_cost || 0);
    const totalExp = Number(eRes.rows[0].total_exp || 0);
    const totalIng = Number(iRes.rows[0].total_ing || 0);

    const totalExpense = totalExp + totalIng + goodsCost;
    const netProfit = totalRevenue - totalExpense;

    res.json({ totalRevenue, totalExpense, netProfit });
});

// Xuất file Excel (.xlsx) với 4 Sheet
app.get('/api/reports/export-excel', async (req, res) => {
    const workbook = new ExcelJS.Workbook();
    
    const sheetProfit = workbook.addWorksheet('Tổng lợi nhuận');
    sheetProfit.columns = [
        { header: 'Chỉ số', key: 'metric', width: 30 },
        { header: 'Số tiền (VNĐ)', key: 'amount', width: 25 }
    ];
    const bRes = await pool.query(`SELECT SUM(grand_total) as total_rev FROM bills`);
    const iRes = await pool.query(`SELECT SUM(quantity * import_price) as total_ing FROM ingredients`);
    const eRes = await pool.query(`SELECT SUM(amount) as total_exp FROM expenses`);
    const rev = Number(bRes.rows[0].total_rev || 0);
    const ing = Number(iRes.rows[0].total_ing || 0);
    const exp = Number(eRes.rows[0].total_exp || 0);
    sheetProfit.addRow({ metric: 'Tổng doanh thu', amount: rev });
    sheetProfit.addRow({ metric: 'Tổng chi phí & nguyên liệu', amount: ing + exp });
    sheetProfit.addRow({ metric: 'Lợi nhuận ròng', amount: rev - (ing + exp) });

    const sheetSales = workbook.addWorksheet('Chi tiết bán');
    sheetSales.columns = [
        { header: 'Mã Bill', key: 'id', width: 10 },
        { header: 'Bàn / Khách', key: 'room_name', width: 20 },
        { header: 'Tổng tiền', key: 'grand_total', width: 15 },
        { header: 'Hình thức', key: 'payment_method', width: 15 },
        { header: 'Ngày tạo', key: 'created_date', width: 15 }
    ];
    const billsRes = await pool.query(`SELECT * FROM bills ORDER BY id DESC`);
    billsRes.rows.forEach(b => sheetSales.addRow(b));

    const sheetInv = workbook.addWorksheet('Báo cáo tồn kho');
    sheetInv.columns = [
        { header: 'Tên hàng', key: 'item_name', width: 25 },
        { header: 'Danh mục', key: 'category', width: 15 },
        { header: 'Tồn kho', key: 'quantity', width: 10 },
        { header: 'Đơn vị', key: 'unit', width: 10 }
    ];
    const invRes = await pool.query(`SELECT * FROM inventory`);
    invRes.rows.forEach(i => sheetInv.addRow(i));

    const sheetIng = workbook.addWorksheet('Tổng Nhập kho');
    sheetIng.columns = [
        { header: 'Tên nguyên liệu', key: 'ingredient_name', width: 25 },
        { header: 'Số lượng', key: 'quantity', width: 15 },
        { header: 'Đơn vị', key: 'unit', width: 10 },
        { header: 'Giá nhập', key: 'import_price', width: 15 }
    ];
    const ingRes = await pool.query(`SELECT * FROM ingredients`);
    ingRes.rows.forEach(ig => sheetIng.addRow(ig));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Bao_Cao_Quan_An_Demo.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

// Quản lý tài khoản
app.get('/api/users', async (req, res) => {
    const result = await pool.query(`SELECT id, username, role FROM users`);
    res.json(result.rows);
});

app.post('/api/users/save', async (req, res) => {
    const { id, username, password, role } = req.body;
    if(id) {
        if(password) {
            await pool.query(`UPDATE users SET username = $1, password = $2, role = $3 WHERE id = $4`, [username, password, role || 'staff', id]);
        } else {
            await pool.query(`UPDATE users SET username = $1, role = $2 WHERE id = $3`, [username, role || 'staff', id]);
        }
    } else {
        await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, $3)`, [username, password || '123456', role || 'staff']);
    }
    res.json({ success: true });
});

app.delete('/api/users/:id', async (req, res) => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
});

server.listen(PORT, () => {
    console.log(`Server Quán ăn Demo đang chạy tại cổng ${PORT}`);
});
