const express = require("express");
const router = express.Router();

// Import controllers
const buyerController = require("../controllers/buyerController");

// Import middleware
const { authenticateToken, isClient, isAdmin } = require("../middleware/auth");

// Buyer routes
router
  .post("/register", buyerController.registerBuyer)
  .get("/profile", authenticateToken, buyerController.getBuyerProfile)
  .patch(
    "/update-profile",
    authenticateToken,
    isClient,
    buyerController.updateBuyerProfile
  )
  .post("/verify-email/:token", buyerController.verifyEmail)
  .post("/forgot-password", buyerController.forgotPassword)
  .post("/reset-password/:token", buyerController.resetPassword);

// Admin Routes for Buyer Management
router.get("/", authenticateToken, isAdmin, buyerController.getAllBuyers);
router.get("/:id", authenticateToken, isAdmin, buyerController.getBuyerById);
router.patch(
  "/:id/status",
  authenticateToken,
  isAdmin,
  buyerController.updateBuyerStatus
);

module.exports = router;
