const express = require("express");
const router = express.Router();

// Import controllers
const categoriesController = require("../controllers/categoriesController");

// Import middleware
const { authenticateToken, isAdmin } = require("../middleware/auth");
const {
  upload,
  handleMulterError,
  processUploadedImages,
} = require("../config/multer");

// Category routes
router
  .post(
    "/create",
    authenticateToken,
    upload.single("file"),
    processUploadedImages,
    handleMulterError,
    categoriesController.createCategory
  )
  .patch(
    "/update/:id",
    authenticateToken,
    isAdmin,
    upload.single("file"),
    processUploadedImages,
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
