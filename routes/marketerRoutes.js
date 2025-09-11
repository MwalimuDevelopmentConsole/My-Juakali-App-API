const express = require("express");
const router = express.Router();
const marketerController = require("../controllers/marketerController");

// Import middleware
const { authenticateToken, authorize } = require("../middleware/auth");
// @access  Public
router
  .post("/login", marketerController.loginMarketer)
  .post("/register", authenticateToken, marketerController.registerMarketer)
  .get("/profile", authenticateToken, marketerController.getMarketerProfile)
  .patch(
    "/update-profile",
    authenticateToken,
    marketerController.updateMarketerProfile
  )
  .patch(
    "/:marketerId/update-status",
    authenticateToken,
    marketerController.updateMarketerStatus
  )
  .get("/commission-history", marketerController.getCommissionHistory)
  .get("/all-marketers", authenticateToken, marketerController.getAllMarketers)
  .get("/overview", authenticateToken, marketerController.getMarketerDashboard)
  .get(
    "/:marketerId/profile",
    authenticateToken,
    marketerController.getMarketerById
  );

module.exports = router;
