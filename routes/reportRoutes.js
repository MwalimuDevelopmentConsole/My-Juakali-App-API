const express = require("express");
const router = express.Router();

// Import controllers
const reportController = require("../controllers/reportController");

// Import middleware
const { authenticateToken, isAdmin } = require("../middleware/auth");

// All report routes require authentication and admin privileges
router.use(authenticateToken);
router.use(isAdmin);

// Report routes

// Revenue report
router.get("/revenue", reportController.getRevenueReport);

// User growth report
router.get("/user-growth", reportController.getUserGrowthReport);

// Product performance report
router.get("/product-performance", reportController.getProductPerformanceReport);

// Subscription report
router.get("/subscriptions", reportController.getSubscriptionReport);

// Marketer performance report
router.get("/marketer-performance", reportController.getMarketerPerformanceReport);

// Search analytics report
router.get("/search-analytics", reportController.getSearchAnalyticsReport);

// Financial summary report
router.get("/financial-summary", reportController.getFinancialSummaryReport);

module.exports = router;
