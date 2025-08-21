const express = require("express");
const router = express.Router();

// Import controllers
const sellerController = require("../controllers/sellerController");

// Import middleware
const { authenticateToken, isClient } = require("../middleware/auth");

// Seller routes
router
  .post("/register", sellerController.registerSeller)
  .get(
    "/profile",
    authenticateToken,
    isClient,
    sellerController.getSellerProfile
  )
  .get("/seller-details/:sellerId", sellerController.getSellerOverview)
  .patch(
    "/update-profile",
    authenticateToken,
    isClient,
    sellerController.updateSellerProfile
  )
  .post("/upload/documents", sellerController.uploadVerificationDocuments)
  .post("/dashboard", sellerController.getSellerDashboard);

module.exports = router;
