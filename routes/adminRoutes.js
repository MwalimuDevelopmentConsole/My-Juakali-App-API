const express = require("express");
const router = express.Router();
const { authenticateToken, isClient, isAdmin } = require("../middleware/auth");

const adminController = require("../controllers/adminController");

router
  .post("/", authenticateToken, isAdmin, adminController.registerAdmin)
  .get("/dashboard", authenticateToken, isAdmin, adminController.getAdminDashboard)
  .patch("/product-status", authenticateToken, isAdmin, adminController.updateProductStatus)
  .post("/update-reviews", authenticateToken, isAdmin, adminController.updateReviewStatus)

module.exports = router;