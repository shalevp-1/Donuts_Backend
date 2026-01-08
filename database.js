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
const app = express();

export const db = mysql.createConnection({
    host: process.env.NODE_ENV === 'production'
        ? process.env.MYSQL_HOST   // Railway host on Render
        : 'localhost',             // Local dev
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: Number(process.env.MYSQL_PORT)
});

db.connect(err => {
    if (err) console.error('MySQL connection error:', err);
    else console.log('MySQL connected successfully!');
});



app.use(express.json());
app.use(cors({
    origin: ['http://localhost:3000'],
    methods: ["POST", "PUT", "DELETE", "GET"],
    credentials: true
}
));
app.use(cookieParser());

// const db = mysql.createConnection({
//     host: process.env.MYSQL_HOST,
//     user: process.env.MYSQL_USER,
//     password: process.env.MYSQL_PASSWORD,
//     database: process.env.MYSQL_DATABASE
// });



app.get('/', (req, res) => {
    res.json("hello backend")
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



app.post("/donuts", (req, res) => {

    const q = "INSERT INTO donuts (name, flavor, price, description, image) VALUES (?)"
    const values = [
        req.body.name,
        req.body.flavor,
        req.body.price,
        req.body.description,
        req.body.image
    ];



    db.query(q, [values], (err, data) => {
        if (err) return res.json(err);
        return res.json("Donut has been created succesfully");
    })

});

app.delete("/donuts/:id", (req, res) => {
    const donutId = req.params.id;
    const q = "DELETE FROM donuts WHERE id =?"
    db.query(q, [donutId], (err, result) => {
        if (err) return res.json(err);
        return res.json("Donut has been deleted succesfully");
    })
})



app.put("/donuts/:id", (req, res) => {
    const donutId = req.params.id;
    const q = "UPDATE donuts SET `name` = ?, `flavor` = ?, `price` = ?, `description` = ?, `image` = ? WHERE id =?";

    const values = [
        req.body.name,
        req.body.flavor,
        req.body.price,
        req.body.description,
        req.body.image
    ]

    db.query(q, [...values, donutId], (err, result) => {
        if (err) return res.json(err);
        return res.json("Donut has been updated succesfully");
    })
})


const verifyUser = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) return res.json({ Error: "You are not authenticated" });
    else {

        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) return res.json({ Error: "Token is not okay" });
            else{
                req.name = decoded.name;
            }
            
            next();
        })
    }
}


app.get('/donutsv', verifyUser, (req, res) => {
    return res.json({ status: "Success", name: req.name })
})

app.post("/register", (req, res) => {
    bcrypt.hash(req.body.password.toString(), saltRounds, (err, hash) => {
        if (err) return res.json({ Error: "Error hashing password" });

        const q = "INSERT INTO login (username, email, password) VALUES (?)";
        const values = [
            req.body.username,
            req.body.email,
            hash
        ];

        db.query(q, [values], (err, data) => {
            if (err) return res.json(err);
            return res.json({ Status: "Success" });
        });
    });
});

app.post('/login', (req, res) => {
    const q = "SELECT * FROM login WHERE username =?"


    db.query(q, [req.body.username], (err, result) => {
        if (err) return res.json({ error: "Error querying database" });
        if (result.length > 0) {
            bcrypt.compare(req.body.password.toString(), result[0].password, (err, isMatch) => {
                if (err) return res.json({ error: "Error comparing passwords" });
                if (isMatch) {
                    const name = result[0].name;
                    const token = jwt.sign({ name }, process.env.JWT_SECRET, { expiresIn: '1h' });
                    res.cookie('token', token);
                    // const token = jwt.sign({ username: result[0].username }, process.env.SECRET_KEY, { expiresIn: '1h' });
                    // res.cookie('token', token, { httpOnly: true }).json({ status: 'Logged in successfully' });
                    return res.json({ status: 'Logged in successfully' });
                } else {
                    return res.json({ error: 'Invalid password' });
                }
            });
        }
        else {
            return res.json({ error: "user not found" })
        }
    })
});


app.get('/logout',(req, res) => {
    res.clearCookie('token');
    return res.json({ status: 'Logged out successfully' });

})


app.listen(8800, () => {
    console.log("Connected to server");

});