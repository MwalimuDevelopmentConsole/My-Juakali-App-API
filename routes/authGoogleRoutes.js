// routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Import controllers
const authGoogleController = require('../controllers/authGoogleController');

// Import middleware
const { 
  authenticateToken, 
  isAuthenticated,
  createRateLimit 
} = require('../middleware/auth');

// Rate limiting for authentication routes
const authRateLimit = createRateLimit(15 * 60 * 1000, 5, 'Too many authentication attempts, please try again later');

// Login
router.post('/', authRateLimit, authGoogleController.initiateGoogleAuth);

router.get('/callback', authGoogleController.handleGoogleCallback);

router.post('/verify', authGoogleController.verifyGoogleToken);

router.get('/user', authGoogleController.getCurrentUser);


module.exports = router;