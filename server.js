require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { logger } = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');
const corsOptions = require('./config/corsOptions');
const connectDB = require('./config/dbConn');
const allowedOrigins = require('./config/allowedOrigins');
const { initializeSocketServer, attachSocketIO, gracefulShutdown } = require('./socketSetup');



const app = express();
const server = http.createServer(app); // ✅ Create HTTP server for Socket.IO
const PORT = process.env.PORT || 3500;

process.env.TZ = 'Africa/Nairobi';

// Custom logger
app.use(logger);

// MongoDB strict query
mongoose.set('strictQuery', true);

// Connect DB
connectDB();

// CORS setup
app.use(cors(corsOptions));
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['POST', 'PUT', 'GET', 'PATCH', 'OPTIONS', 'HEAD', 'DELETE'],
  })
);



// Middleware
app.use(express.json());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/', require('./routes/root'));


// 404 handler
app.all('*', (req, res) => {
  res.status(404);
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'views', '404.html'));
  } else if (req.accepts('json')) {
    res.json({ message: '404 Not Found' });
  } else {
    res.type('txt').send('404 Not Found');
  }
});

app.use(errorHandler);

// ✅ Initialize Socket.IO with CORS
const io = initializeSocketServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// ✅ Attach io to every request (so routes can emit events)
app.use(attachSocketIO(io));

// ✅ Start server after DB connection
mongoose.connection.once('open', () => {
  console.log(process.env.NODE_ENV);
  console.log('Connected to MongoDB');

  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});

// ✅ Graceful shutdown for Socket.IO + Mongo
const shutdown = gracefulShutdown(io);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle DB error
mongoose.connection.on('error', (err) => {
  console.log(err);
});
