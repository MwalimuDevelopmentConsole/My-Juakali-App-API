const express = require("express");
const router = express.Router();

// Import controllers
const categoriesController = require("../controllers/categoriesController");

// Import middleware
const { authenticateToken, isClient, isAdmin } = require("../middleware/auth");
const { upload, handleMulterError } = require("../config/multer");

// Category routes
router
  .post(
    "/create",
    authenticateToken,
    isAdmin,
    upload.single("file"),
    handleMulterError,
    categoriesController.createCategory
  )
  .patch(
    "/update/:id",
    authenticateToken,
    isAdmin,
    upload.single("file"),
    handleMulterError,
    categoriesController.updateCategory
  )
  .get("/", categoriesController.getCategories)
  .get("/one/:id", categoriesController.getCategory)
  .delete(
    "/:id",
    authenticateToken,
    isAdmin,
    categoriesController.deleteCategory
  );

module.exports = router;
