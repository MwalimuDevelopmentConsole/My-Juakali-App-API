const express = require('express');
const router = express.Router();

// Import controllers
const buyerController = require('../controllers/buyerController');

// Import middleware
const { authenticateToken, isClient } = require('../middleware/auth');

// Buyer routes
router.post('/register', buyerController.registerBuyer)
       .get('/profile', authenticateToken, buyerController.getBuyerProfile)
       .patch('/update-profile', authenticateToken, isClient, buyerController.updateBuyerProfile)
       .post('/verify-email/:token', buyerController.verifyEmail)
       .post('/forgot-password', buyerController.forgotPassword)
       .post('/reset-password/:token', buyerController.resetPassword);



module.exports = router;