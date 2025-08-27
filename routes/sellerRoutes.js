const express = require("express");
const router = express.Router();
const { handleMulterError, upload } = require("../config/multer");

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
    sellerController.getSellerProfile
  )
  .get("/seller-details/:sellerId", sellerController.getSellerOverview)
  .patch(
    "/update-profile",
    authenticateToken,
    isClient,
    sellerController.updateSellerProfile
  )
  .post(
    "/upload/documents",
    authenticateToken,
    upload.array("images", 5),
    handleMulterError,
    sellerController.uploadVerificationDocuments
  )
  .get("/dashboard", authenticateToken, sellerController.getSellerDashboard)
  .patch("/remove/docs", authenticateToken, sellerController.removeVerificationDocument)
  .post("/update-status", authenticateToken, sellerController.updateDocumentStatus);

module.exports = router;
