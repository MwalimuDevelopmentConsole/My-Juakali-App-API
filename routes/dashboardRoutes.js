const express = require("express");
const router = express.Router();

// Import controllers
const dashboardController = require("../controllers/dashboardController");

// Import middleware
const { authenticateToken, isAdmin, } = require("../middleware/auth");

// Dashboard routes

// Admin dashboard
router.get(
  "/admin",
  authenticateToken,
  dashboardController.getAdminDashboard
);

// Seller dashboard
router.get(
  "/seller",
  authenticateToken,
  dashboardController.getSellerDashboard
);

// Marketer dashboard
router.get(
  "/marketer",
  authenticateToken,
  dashboardController.getMarketerDashboard
);

// Public platform statistics
router.get("/stats", dashboardController.getPlatformStats);

module.exports = router;
