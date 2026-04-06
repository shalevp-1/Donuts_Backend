import express from "express";
import dotenv from 'dotenv';
import mysql from 'mysql2';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';

// import mysql from "mysql2";
const saltRounds = 10;

dotenv.config();
const jwtSecret = process.env.JWT_SECRET || "jwt-secret-key";
const isProduction = process.env.NODE_ENV === 'production';
const requiredTableNames = ['donuts', 'login', 'purchase_orders', 'purchase_items'];
const app = express();
const dbConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT || 3306)
};
let isSchemaReady = false;
let lastDatabaseIssue = '';

export const db = mysql.createConnection(dbConfig);

const runDbQuery = (query, values = []) =>
    new Promise((resolve, reject) => {
        db.query(query, values, (err, result) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(result);
        });
    });

const initializeDatabase = async () => {
    const schemaStatements = [
        `
            CREATE TABLE IF NOT EXISTS donuts (
                id INT NOT NULL AUTO_INCREMENT,
                name VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                price DECIMAL(10, 2) NOT NULL,
                ingredients TEXT NOT NULL,
                calories INT NOT NULL,
                image TEXT NOT NULL,
                PRIMARY KEY (id)
            )
        `,
        `
            CREATE TABLE IF NOT EXISTS login (
                id INT NOT NULL AUTO_INCREMENT,
                username VARCHAR(100) NOT NULL,
                email VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'user',
                points INT NOT NULL DEFAULT 0,
                purchase_count INT NOT NULL DEFAULT 0,
                total_spent DECIMAL(10, 2) NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY unique_username (username),
                UNIQUE KEY unique_email (email)
            )
        `,
        `
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id INT NOT NULL AUTO_INCREMENT,
                user_id INT NOT NULL,
                item_count INT NOT NULL,
                subtotal DECIMAL(10, 2) NOT NULL,
                service_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
                total DECIMAL(10, 2) NOT NULL,
                points_earned INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_purchase_orders_user_id (user_id)
            )
        `,
        `
            CREATE TABLE IF NOT EXISTS purchase_items (
                id INT NOT NULL AUTO_INCREMENT,
                purchase_id INT NOT NULL,
                donut_id INT NOT NULL,
                quantity INT NOT NULL,
                price_each DECIMAL(10, 2) NOT NULL,
                line_total DECIMAL(10, 2) NOT NULL,
                PRIMARY KEY (id),
                KEY idx_purchase_items_purchase_id (purchase_id),
                KEY idx_purchase_items_donut_id (donut_id)
            )
        `
    ];

    for (const statement of schemaStatements) {
        await runDbQuery(statement);
    }

    isSchemaReady = true;
    lastDatabaseIssue = '';
};

const getAuthCookieOptions = () => ({
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction
});



app.use(express.json());
app.use(cors({
    origin: true,
    methods: ["POST", "PUT", "DELETE", "GET"],
    credentials: true
}
));
app.use(cookieParser());

const createMailTransporter = async () => {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        return null;
    }

    try {
        const nodemailer = await import('nodemailer');

        return nodemailer.default.createTransport({
            host: process.env.EMAIL_HOST,
            port: Number(process.env.EMAIL_PORT) || 587,
            secure: process.env.EMAIL_SECURE === 'true',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });
    } catch (error) {
        console.error('Email transporter setup error:', error);
        return null;
    }
};

const sendSignupConfirmationEmail = async (username, email) => {
    const transporter = await createMailTransporter();

    if (!transporter) {
        return false;
    }

    const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    await transporter.sendMail({
        from: fromAddress,
        to: email,
        subject: 'Welcome to Donuts for you',
        html: `
            <div style="font-family: Arial, sans-serif; color: #2f241e; line-height: 1.6;">
                <h1 style="margin-bottom: 0.4rem;">Welcome, ${username}.</h1>
                <p>Your Donuts for you account has been created successfully.</p>
                <p>You can now sign in, save your favorites, collect points, and manage your purchases.</p>
                <p style="margin-top: 1.2rem;">See you soon,<br />Donuts for you</p>
            </div>
        `
    });

    return true;
};

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const verifyAdmin = (req, res, next) => {
    if (req.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required." });
    }

    next();
};

const verifyUser = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "You are not authenticated." });
    else {

        jwt.verify(token, jwtSecret, (err, decoded) => {
            if (err) return res.status(401).json({ error: "Your session is no longer valid." });
            else{
                req.userId = decoded.id;
                req.name = decoded.name;
                req.role = decoded.role;
            }
            
            next();
        })
    }
}

// const db = mysql.createConnection({
//     host: process.env.MYSQL_HOST,
//     user: process.env.MYSQL_USER,
//     password: process.env.MYSQL_PASSWORD,
//     database: process.env.MYSQL_DATABASE
// });



app.get('/', (req, res) => {
    res.json("hello backend")
});

app.get('/health/db', async (req, res) => {
    try {
        await runDbQuery('SELECT 1 AS dbOk');

        const placeholders = requiredTableNames.map(() => '?').join(', ');
        const tableRows = await runDbQuery(
            `
                SELECT table_name AS tableName
                FROM information_schema.tables
                WHERE table_schema = ?
                AND table_name IN (${placeholders})
            `,
            [dbConfig.database, ...requiredTableNames]
        );

        const foundTables = tableRows.map((row) => row.tableName);
        const missingTables = requiredTableNames.filter((tableName) => !foundTables.includes(tableName));

        return res.status(missingTables.length === 0 ? 200 : 503).json({
            status: missingTables.length === 0 ? 'ok' : 'degraded',
            schemaReady: isSchemaReady,
            missingTables,
            lastDatabaseIssue
        });
    } catch (error) {
        return res.status(503).json({
            status: 'error',
            schemaReady: isSchemaReady,
            missingTables: requiredTableNames,
            lastDatabaseIssue: error.code || error.message || 'Database health check failed.'
        });
    }
});

app.get("/donuts", (req, res) => {
    const q = "SELECT * FROM donuts"
    db.query(q, (err, result) => {
        if (err) return res.json(err);
        return res.json(result);
    })
});


app.get("/donut/:id", (req, res) => {
    const donutId = req.params.id;
    const q = "SELECT * FROM donuts WHERE id =?"
    db.query(q, [donutId], (err, result) => {
        if (err) return res.json(err);
        return res.json(result);
    })
});


app.get("/login", (req, res) => {
    const q = "SELECT * FROM login"
    db.query(q, (err, result) => {
        if (err) return res.json(err);
        return res.json(result);
    })
});



app.post("/donuts", verifyUser, verifyAdmin, (req, res) => {
    const name = req.body.name?.trim();
    const price = Number(req.body.price);
    const description = req.body.description?.trim();
    const image = req.body.image?.trim();
    const ingredients = Array.isArray(req.body.ingredients)
        ? req.body.ingredients.join(", ")
        : req.body.ingredients?.toString().trim();
    const calories = Number(req.body.calories);

    if (!name || !description || !image || !ingredients || Number.isNaN(price) || Number.isNaN(calories)) {
        return res.status(400).json({ error: "Please fill in name, price, description, ingredients, calories, and image." });
    }

    const nextIdQuery = "SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM donuts";

    db.query(nextIdQuery, (idErr, idResult) => {
        if (idErr) {
            return res.status(500).json({ error: "We could not prepare a new donut entry right now." });
        }

        const nextId = idResult[0].nextId;
        const q = "INSERT INTO donuts (id, name, description, price, ingredients, calories, image) VALUES (?)";
        const values = [
            nextId,
            name,
            description,
            price,
            ingredients,
            calories,
            image
        ];

        db.query(q, [values], (err, data) => {
            if (err) return res.status(500).json({ error: "We could not create the donut right now." });
            return res.status(201).json({ message: "Donut has been created successfully.", id: nextId });
        });
    });

});

app.delete("/donuts/:id", verifyUser, verifyAdmin, (req, res) => {
    const donutId = req.params.id;
    const q = "DELETE FROM donuts WHERE id =?"
    db.query(q, [donutId], (err, result) => {
        if (err) return res.json(err);
        return res.json("Donut has been deleted succesfully");
    })
})



app.put("/donuts/:id", verifyUser, verifyAdmin, (req, res) => {
    const donutId = req.params.id;
    const name = req.body.name?.trim();
    const price = Number(req.body.price);
    const description = req.body.description?.trim();
    const image = req.body.image?.trim();
    const ingredients = Array.isArray(req.body.ingredients)
        ? req.body.ingredients.join(", ")
        : req.body.ingredients?.toString().trim();
    const calories = Number(req.body.calories);

    if (!name || !description || !image || !ingredients || Number.isNaN(price) || Number.isNaN(calories)) {
        return res.status(400).json({ error: "Please fill in name, price, description, ingredients, calories, and image." });
    }

    const q = "UPDATE donuts SET `name` = ?, `description` = ?, `price` = ?, `ingredients` = ?, `calories` = ?, `image` = ? WHERE id = ?";

    const values = [
        name,
        description,
        price,
        ingredients,
        calories,
        image
    ]

    db.query(q, [...values, donutId], (err, result) => {
        if (err) return res.status(500).json({ error: "We could not update the donut right now." });
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "That donut could not be found." });
        }
        return res.json({ message: "Donut has been updated successfully." });
    })
})
app.get('/me', verifyUser, (req, res) => {
    const q = "SELECT id, username, role, COALESCE(points, 0) AS points, COALESCE(purchase_count, 0) AS purchaseCount, COALESCE(total_spent, 0) AS totalSpent FROM login WHERE id = ? LIMIT 1";

    db.query(q, [req.userId], (err, result) => {
        if (err) {
            return res.status(500).json({ error: "We could not load your account right now." });
        }

        if (result.length === 0) {
            return res.status(404).json({ error: "That account could not be found." });
        }

        const user = result[0];

        return res.json({
            status: "Success",
            id: user.id,
            name: user.username || req.name,
            role: user.role || req.role || 'user',
            points: Number(user.points) || 0,
            purchaseCount: Number(user.purchaseCount) || 0,
            totalSpent: Number(user.totalSpent) || 0
        });
    });
})

app.get('/donutsv', verifyUser, verifyAdmin, (req, res) => {
    return res.json({ status: "Success", name: req.name, role: req.role })
})

app.get('/users', verifyUser, verifyAdmin, (req, res) => {
    const q = "SELECT id, username, email, role, COALESCE(points, 0) AS points, COALESCE(purchase_count, 0) AS purchaseCount, COALESCE(total_spent, 0) AS totalSpent FROM login ORDER BY id DESC";

    db.query(q, (err, result) => {
        if (err) {
            return res.status(500).json({ error: "We could not load users right now." });
        }

        return res.json({ status: "Success", users: result });
    });
})

app.put('/users/:id/role', verifyUser, verifyAdmin, (req, res) => {
    const userId = Number(req.params.id);
    const nextRole = req.body.role?.toString().trim().toLowerCase();

    if (Number.isNaN(userId)) {
        return res.status(400).json({ error: "That user id is not valid." });
    }

    if (!['admin', 'user'].includes(nextRole)) {
        return res.status(400).json({ error: "Role must be either admin or user." });
    }

    if (userId === req.userId && nextRole !== 'admin') {
        return res.status(400).json({ error: "You cannot remove your own admin access here." });
    }

    const q = "UPDATE login SET role = ? WHERE id = ?";

    db.query(q, [nextRole, userId], (err, result) => {
        if (err) {
            return res.status(500).json({ error: "We could not update that user's role right now." });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "That user could not be found." });
        }

        return res.json({
            status: "Success",
            message: `Role updated to ${nextRole}.`,
            role: nextRole
        });
    });
});

app.get('/my-purchases', verifyUser, (req, res) => {
    const purchasesQuery = `
        SELECT 
            po.id,
            po.item_count AS itemCount,
            po.subtotal,
            po.service_fee AS serviceFee,
            po.total,
            po.points_earned AS pointsEarned,
            po.created_at AS createdAt
        FROM purchase_orders po
        WHERE po.user_id = ?
        ORDER BY po.created_at DESC, po.id DESC
    `;

    const itemsQuery = `
        SELECT 
            pi.purchase_id AS purchaseId,
            pi.donut_id AS donutId,
            pi.quantity,
            pi.price_each AS priceEach,
            pi.line_total AS lineTotal,
            d.name,
            d.image
        FROM purchase_items pi
        JOIN donuts d ON d.id = pi.donut_id
        WHERE pi.purchase_id IN (
            SELECT id FROM purchase_orders WHERE user_id = ?
        )
        ORDER BY pi.purchase_id DESC, pi.id ASC
    `;

    db.query(purchasesQuery, [req.userId], (purchaseErr, purchaseRows) => {
        if (purchaseErr) {
            return res.status(500).json({ error: "We could not load your purchases right now." });
        }

        db.query(itemsQuery, [req.userId], (itemErr, itemRows) => {
            if (itemErr) {
                return res.status(500).json({ error: "We could not load your purchase items right now." });
            }

            const purchases = purchaseRows.map((purchase) => ({
                ...purchase,
                subtotal: Number(purchase.subtotal) || 0,
                serviceFee: Number(purchase.serviceFee) || 0,
                total: Number(purchase.total) || 0,
                pointsEarned: Number(purchase.pointsEarned) || 0,
                items: itemRows
                    .filter((item) => item.purchaseId === purchase.id)
                    .map((item) => ({
                        donutId: item.donutId,
                        name: item.name,
                        image: item.image,
                        quantity: Number(item.quantity) || 0,
                        priceEach: Number(item.priceEach) || 0,
                        lineTotal: Number(item.lineTotal) || 0
                    }))
            }));

            return res.json({ status: "Success", purchases });
        });
    });
});

app.post('/checkout', verifyUser, (req, res) => {
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    const normalizedItems = rawItems
        .map((item) => ({
            donutId: Number(item.donutId),
            quantity: Number(item.quantity)
        }))
        .filter((item) => Number.isInteger(item.donutId) && item.quantity > 0);

    if (normalizedItems.length === 0) {
        return res.status(400).json({ error: "Your cart is empty." });
    }

    const donutIds = [...new Set(normalizedItems.map((item) => item.donutId))];
    const placeholders = donutIds.map(() => '?').join(', ');
    const serviceFee = normalizedItems.length > 0 ? 3.5 : 0;

    const donutsQuery = `SELECT id, name, image, price FROM donuts WHERE id IN (${placeholders})`;

    db.query(donutsQuery, donutIds, (donutsErr, donutRows) => {
        if (donutsErr) {
            return res.status(500).json({ error: "We could not prepare your checkout right now." });
        }

        if (donutRows.length !== donutIds.length) {
            return res.status(400).json({ error: "One or more donuts in your cart could not be found." });
        }

        const enrichedItems = normalizedItems.map((item) => {
            const donut = donutRows.find((row) => row.id === item.donutId);

            return {
                donutId: item.donutId,
                quantity: item.quantity,
                name: donut.name,
                image: donut.image,
                priceEach: Number(donut.price) || 0,
                lineTotal: (Number(donut.price) || 0) * item.quantity
            };
        });

        const itemCount = enrichedItems.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = enrichedItems.reduce((sum, item) => sum + item.lineTotal, 0);
        const total = subtotal + serviceFee;
        const pointsEarned = Math.max(1, Math.floor(total));

        db.beginTransaction((txErr) => {
            if (txErr) {
                return res.status(500).json({ error: "We could not start your checkout right now." });
            }

            const orderQuery = `
                INSERT INTO purchase_orders
                (user_id, item_count, subtotal, service_fee, total, points_earned)
                VALUES (?, ?, ?, ?, ?, ?)
            `;

            db.query(orderQuery, [req.userId, itemCount, subtotal, serviceFee, total, pointsEarned], (orderErr, orderResult) => {
                if (orderErr) {
                    return db.rollback(() => {
                        return res.status(500).json({ error: "We could not create your purchase right now." });
                    });
                }

                const purchaseId = orderResult.insertId;
                const itemValues = enrichedItems.map((item) => [
                    purchaseId,
                    item.donutId,
                    item.quantity,
                    item.priceEach,
                    item.lineTotal
                ]);

                const itemsInsertQuery = `
                    INSERT INTO purchase_items
                    (purchase_id, donut_id, quantity, price_each, line_total)
                    VALUES ?
                `;

                db.query(itemsInsertQuery, [itemValues], (itemsErr) => {
                    if (itemsErr) {
                        return db.rollback(() => {
                            return res.status(500).json({ error: "We could not save your purchase items right now." });
                        });
                    }

                    const userUpdateQuery = `
                        UPDATE login
                        SET
                            points = COALESCE(points, 0) + ?,
                            purchase_count = COALESCE(purchase_count, 0) + 1,
                            total_spent = COALESCE(total_spent, 0) + ?
                        WHERE id = ?
                    `;

                    db.query(userUpdateQuery, [pointsEarned, total, req.userId], (userErr) => {
                        if (userErr) {
                            return db.rollback(() => {
                                return res.status(500).json({ error: "We could not update your account rewards right now." });
                            });
                        }

                        db.commit((commitErr) => {
                            if (commitErr) {
                                return db.rollback(() => {
                                    return res.status(500).json({ error: "We could not complete your purchase right now." });
                                });
                            }

                            return res.status(201).json({
                                status: "Success",
                                orderId: purchaseId,
                                itemCount,
                                subtotal,
                                serviceFee,
                                total,
                                pointsEarned
                            });
                        });
                    });
                });
            });
        });
    });
});

app.delete('/users/:id', verifyUser, verifyAdmin, (req, res) => {
    const userId = Number(req.params.id);

    if (Number.isNaN(userId)) {
        return res.status(400).json({ error: "That user id is not valid." });
    }

    const q = "DELETE FROM login WHERE id = ?";

    db.query(q, [userId], (err, result) => {
        if (err) {
            return res.status(500).json({ error: "We could not delete that user right now." });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "That user could not be found." });
        }

        return res.json({ status: "Success", message: "User deleted successfully." });
    });
})

app.post("/register", (req, res) => {
    const username = req.body.username?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password?.toString();

    if (!username || !email || !password) {
        return res.status(400).json({ error: "Username, email, and password are required." });
    }

    if (!validateEmail(email)) {
        return res.status(400).json({ error: "Please enter a valid email address." });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    const duplicateCheckQuery = "SELECT id FROM login WHERE username = ? OR email = ? LIMIT 1";

    db.query(duplicateCheckQuery, [username, email], (duplicateErr, duplicateResult) => {
        if (duplicateErr) {
            return res.status(500).json({ error: "We could not validate your account details right now." });
        }

        if (duplicateResult.length > 0) {
            return res.status(409).json({ error: "That username or email is already in use." });
        }

    bcrypt.hash(req.body.password.toString(), saltRounds, (err, hash) => {
        if (err) return res.status(500).json({ error: "We could not secure your password right now." });

        const q = "INSERT INTO login (username, email, password, role) VALUES (?)";
        const values = [
            username,
            email,
            hash,
            'user'
        ];

        db.query(q, [values], (err, data) => {
            if (err) return res.status(500).json({ error: "We could not create your account right now." });

            sendSignupConfirmationEmail(username, email)
                .then((emailSent) => {
                    return res.status(201).json({
                        status: "Success",
                        message: emailSent
                            ? "Your account has been created and a confirmation email has been sent."
                            : "Your account has been created."
                    });
                })
                .catch((mailErr) => {
                    console.error('Signup confirmation email error:', mailErr);
                    return res.status(201).json({
                        status: "Success",
                        message: "Your account has been created."
                    });
                });
        });
    });
    });
});

app.post('/login', (req, res) => {
    const username = req.body.username?.trim();
    const password = req.body.password?.toString();

    if (!username || !password) {
        return res.status(400).json({ error: "Please enter both username and password." });
    }

    const q = "SELECT * FROM login WHERE username =?"


    db.query(q, [username], (err, result) => {
        if (err) return res.status(500).json({ error: "We could not check your login details right now." });
        if (result.length > 0) {
            bcrypt.compare(password, result[0].password, (err, isMatch) => {
                if (err) return res.status(500).json({ error: "We could not verify your password right now." });
                if (isMatch) {
                    const name = result[0].username || result[0].name;
                    const role = result[0].role || 'user';
                    const id = result[0].id;
                    const token = jwt.sign({ id, name, role }, jwtSecret, { expiresIn: '1h' });
                    res.cookie('token', token, {
                        ...getAuthCookieOptions(),
                        maxAge: 60 * 60 * 1000
                    });
                    return res.json({ status: 'Logged in successfully' });
                } else {
                    return res.status(401).json({ error: 'The username or password is incorrect.' });
                }
            });
        }
        else {
            return res.status(404).json({ error: "We couldn't find an account with that username." })
        }
    })
});


app.get('/logout',(req, res) => {
    res.clearCookie('token', getAuthCookieOptions());
    return res.json({ status: 'Logged out successfully' });

})


// app.listen(8800, () => {
//     console.log("Connected to server");

// });
const PORT = process.env.PORT || 8800;
let hasStartedServer = false;
const startServer = () => {
    if (hasStartedServer) {
        return;
    }

    hasStartedServer = true;
    app.listen(PORT, () => {
        console.log(`Server on port ${PORT}`);
    });
};

db.connect(async (err) => {
    if (err) {
        lastDatabaseIssue = err.code || err.message || 'Initial database connection failed.';
        console.error('MySQL connection error:', err);
        startServer();
        return;
    }

    console.log('MySQL connected successfully!');

    try {
        await initializeDatabase();
        console.log('MySQL schema ready.');
    } catch (schemaError) {
        lastDatabaseIssue = schemaError.code || schemaError.message || 'Schema initialization failed.';
        console.error('MySQL schema initialization error:', schemaError);
    }

    startServer();
});
