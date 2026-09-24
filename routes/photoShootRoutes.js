const express = require("express");
const router = express.Router();
const photoShootController = require("../controllers/photoShootController");
const { authenticateToken, isAdmin } = require("../middleware/auth");

// Seller endpoints
router.post("/", authenticateToken, photoShootController.createRequest);
router.get("/my-requests", authenticateToken, photoShootController.getMyRequests);
router.patch("/:id/cancel", authenticateToken, photoShootController.cancelRequest);

// Admin endpoints
router.get("/admin/all", authenticateToken, isAdmin, photoShootController.getAllRequests);
router.patch("/admin/:id/status", authenticateToken, isAdmin, photoShootController.updateRequestStatus);

// Shared endpoint (seller owns or admin)
router.get("/:id", authenticateToken, photoShootController.getRequestById);

module.exports = router;
