const express = require('express');
const router = express.Router();

// Import controllers
const categoriesController = require('../controllers/categoriesController');

// Import middleware
const { authenticateToken, isClient, isAdmin } = require('../middleware/auth');

// Category routes
router.post('/create', authenticateToken, isAdmin, categoriesController.createCategory)
       .patch('/update/:id', authenticateToken, isAdmin, categoriesController.updateCategory)
       .get('/', categoriesController.getCategories)
       .get('/one/:id', categoriesController.getCategory)
       .delete('/:id', authenticateToken, isAdmin, categoriesController.deleteCategory)



module.exports = router;