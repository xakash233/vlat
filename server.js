import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import mysql from 'mysql2';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// CORS Configuration
// CORS Configuration
const allowedOrigins = [
  'https://vlatakash1.netlify.app',  // Your frontend
  'http://localhost:3000',            // Local development
  'http://localhost:5173'             // Vite dev server
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      const msg = `CORS blocked: ${origin}. Allowed: ${allowedOrigins.join(', ')}`;
      console.log(msg);
      return callback(new Error(msg), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Configuration using Railway variables
const dbConfig = {
  host: process.env.MYSQLHOST || 'mysql.railway.internal',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || 'XLAYtkltrKoEGfwCEtTshOgYOyTYlRyO',
  database: process.env.MYSQLDATABASE || 'railway',
  port: process.env.MYSQLPORT || 3306,
  // For Railway internal networking
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Enable SSL for production
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
};

console.log('Database Configuration:', {
  host: dbConfig.host,
  database: dbConfig.database,
  port: dbConfig.port,
  user: dbConfig.user
});

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Test database connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Database Connection Failed:', {
      message: err.message,
      code: err.code,
      sqlState: err.sqlState
    });

    // Log all available environment variables (excluding passwords)
    console.log('Available ENV variables:', {
      MYSQLHOST: process.env.MYSQLHOST,
      MYSQLUSER: process.env.MYSQLUSER,
      MYSQLDATABASE: process.env.MYSQLDATABASE,
      MYSQLPORT: process.env.MYSQLPORT,
      NODE_ENV: process.env.NODE_ENV
    });
  } else {
    console.log('✅ Successfully connected to Railway MySQL!');
    console.log(`📊 Database: ${dbConfig.database}`);
    console.log(`🌐 Host: ${dbConfig.host}:${dbConfig.port}`);

    // Test query
    connection.query('SELECT 1 + 1 AS result', (err, results) => {
      if (err) {
        console.error('Test query failed:', err);
      } else {
        console.log('✅ Test query successful:', results[0]);
      }
    });

    connection.release();

    // Create tables if they don't exist
    createTables();
  }
});

// Function to create required tables
function createTables() {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      login_id VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      full_name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      phone VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  pool.query(createUsersTable, (err) => {
    if (err) {
      console.error('Error creating users table:', err);
    } else {
      console.log('✅ Users table is ready');

      // Check if table has data
      pool.query('SELECT COUNT(*) as count FROM users', (err, results) => {
        if (!err) {
          console.log(`📈 Total users in database: ${results[0].count}`);
        }
      });
    }
  });
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'VLAT Exam Backend API',
    status: 'running',
    database: 'connected',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  pool.query('SELECT 1', (err) => {
    if (err) {
      return res.status(500).json({
        status: 'unhealthy',
        database: 'disconnected',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    });
  });
});

// Database info endpoint (for debugging)
app.get('/api/db-info', (req, res) => {
  const dbInfo = {
    host: process.env.MYSQLHOST || 'not set',
    database: process.env.MYSQLDATABASE || 'not set',
    port: process.env.MYSQLPORT || 'not set',
    user: process.env.MYSQLUSER || 'not set',
    nodeEnv: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  };

  res.json(dbInfo);
});

// Register API
app.post('/api/register', (req, res) => {
  console.log('Register request:', { body: req.body });

  const { fullName, email, contactNumber, password } = req.body;

  if (!fullName || !email || !contactNumber || !password) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required'
    });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid email format'
    });
  }

  // Check if email exists
  pool.query(
    'SELECT id FROM users WHERE email = ?',
    [email],
    (err, result) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({
          success: false,
          message: 'Database error'
        });
      }

      if (result.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Email already registered'
        });
      }

      // Generate new login ID
      pool.query(
        'SELECT id FROM users ORDER BY id DESC LIMIT 1',
        (err, result) => {
          if (err) {
            console.error('Error getting last ID:', err);
            return res.status(500).json({
              success: false,
              message: 'Database error'
            });
          }

          let newId = 1;
          if (result.length > 0) {
            newId = parseInt(result[0].id) + 1;
          }

          const loginId = 'VLAT' + String(newId).padStart(3, '0');

          // Insert new user
          pool.query(
            'INSERT INTO users (login_id, password, full_name, email, phone) VALUES (?, ?, ?, ?, ?)',
            [loginId, password, fullName, email, contactNumber],
            (err, insertResult) => {
              if (err) {
                console.error('Insert error:', err);
                return res.status(500).json({
                  success: false,
                  message: 'Registration failed',
                  error: err.sqlMessage
                });
              }

              console.log('User registered successfully:', { loginId, email });

              res.status(201).json({
                success: true,
                message: 'Registration successful',
                loginId: loginId,
                userId: insertResult.insertId
              });
            }
          );
        }
      );
    }
  );
});

// Login API
app.post('/api/login', (req, res) => {
  console.log('Login attempt:', { loginId: req.body.loginId });

  const { loginId, password } = req.body;

  if (!loginId || !password) {
    return res.status(400).json({
      success: false,
      message: 'Login ID and password are required'
    });
  }

  pool.query(
    'SELECT * FROM users WHERE login_id = ?',
    [loginId],
    (err, result) => {
      if (err) {
        console.error('Login query error:', err);
        return res.status(500).json({
          success: false,
          message: 'Database error'
        });
      }

      if (result.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      const user = result[0];

      // Compare password (plain text for now - in production use bcrypt)
      if (user.password !== password) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Create JWT token
      const token = jwt.sign(
        {
          id: user.id,
          loginId: user.login_id,
          email: user.email
        },
        process.env.JWT_SECRET || 'vlat_exam_secret_key_2024',
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        message: 'Login successful',
        token: token,
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

// Get all users (for testing only)
app.get('/api/users', (req, res) => {
  pool.query(
    'SELECT id, login_id, email, full_name, phone, created_at FROM users ORDER BY id DESC',
    (err, results) => {
      if (err) {
        console.error('Error fetching users:', err);
        return res.status(500).json({
          success: false,
          message: 'Database error'
        });
      }

      res.json({
        success: true,
        count: results.length,
        users: results
      });
    }
  );
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Server started successfully!
📡 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
🔗 Local: http://localhost:${PORT}
🔗 Health check: /api/health
🔗 DB Info: /api/db-info
📊 Database: ${process.env.MYSQLDATABASE || 'railway'}
🕐 Time: ${new Date().toISOString()}
  `);

  // Log environment summary (without passwords)
  console.log('Environment Summary:', {
    MYSQLHOST: process.env.MYSQLHOST,
    MYSQLUSER: process.env.MYSQLUSER,
    MYSQLDATABASE: process.env.MYSQLDATABASE,
    MYSQLPORT: process.env.MYSQLPORT,
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT
  });
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ Server error:', error);
});