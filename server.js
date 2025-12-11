import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// DB Connection
// const db = mysql.createConnection({
//   host: 'localhost',
//   user: 'root',
//   password: 'root1234',   
//   database: 'vlat_exam_db'
// });

const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT
});

db.connect((err) => {
  if (err) {
    console.log("MySQL Connection Error:", err);
  } else {
    console.log("Connected to Railway MySQL!");
  }
});


// Login API
app.post('/api/login', (req, res) => {
  const { loginId, password } = req.body;

  if (!loginId || !password) {
    return res.status(400).json({ error: "Login ID and Password are required" });
  }

  db.query(
    'SELECT * FROM users WHERE login_id = ?',
    [loginId],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Database Error" });

      if (result.length === 0)
        return res.status(401).json({ error: "Invalid Login ID or Password" });

      const user = result[0];

      // Compare password
      if (user.password !== password)
        return res.status(401).json({ error: "Invalid Login ID or Password" });

      // Create token
      const token = jwt.sign(
        { id: user.id, loginId: user.login_id, email: user.email },
        "VLAT_SECRET",
        { expiresIn: "2h" }
      );

      // Send user data to frontend
      res.json({
        message: "Login Successful",
        token,
        user: {
          id: user.id,
          login_id: user.login_id,
          email: user.email,
          full_name: user.full_name,
          phone: user.phone,
          created_at: user.created_at
        }
      });
    }
  );
});


// Register API with auto-generated login ID
app.post('/api/register', (req, res) => {
  const { fullName, email, contactNumber, password } = req.body;

  if (!fullName || !email || !contactNumber || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  // Generate new login ID → latest id + 1
  db.query("SELECT id FROM users ORDER BY id DESC LIMIT 1", (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });

    let newId = 1;

    if (result.length > 0) {
      newId = result[0].id + 1;
    }

    const loginId = "VLAT" + String(newId).padStart(3, '0');  // VLAT001, VLAT002…

    // Insert into DB
    db.query(
      "INSERT INTO users (login_id, password, full_name, email, phone) VALUES (?, ?, ?, ?, ?)",
      [loginId, password, fullName, email, contactNumber],
      (err, insertResult) => {
        if (err) return res.status(500).json({ error: "Failed to register user" });

        return res.json({
          message: "Registration Successful",
          loginId: loginId
        });
      }
    );
  });
});


// Server Start
app.listen(process.env.PORT, () =>
  console.log(`Backend running on port ${process.env.PORT}`)
);

