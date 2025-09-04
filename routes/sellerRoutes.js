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
  .get("/profile", authenticateToken, sellerController.getSellerProfile)
  .get("/by-agent", sellerController.getSellersByAgentId)
  .get("/seller-details/:sellerId", sellerController.getSellerOverview)
  .patch(
    "/update-profile",
    authenticateToken,
    // isClient,
    upload.single("file"),
    sellerController.updateSellerProfile
  )
  .post(
    "/upload/documents",
    authenticateToken,
    upload.array("images", 5),
    handleMulterError,
    sellerController.uploadVerificationDocuments
  )
  .patch(
    "/upload/dp",
    authenticateToken,
    upload.single("file"),
    handleMulterError,
    sellerController.uploadProfileAvatar
  )
  .get("/dashboard", authenticateToken, sellerController.getSellerDashboard)
  .patch(
    "/remove/docs",
    authenticateToken,
    sellerController.removeVerificationDocument
  )
  .patch(
    "/update-status",
    authenticateToken,
    sellerController.updateSellerStatus
  )
  .post(
    "/docs/update-status",
    authenticateToken,
    sellerController.updateDocumentStatus
  )
  .patch(
    "/manage-capabilities",
    authenticateToken,
    sellerController.manageSellerCapabilities
  );

module.exports = router;
