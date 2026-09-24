const express = require("express");
const router = express.Router();
const passwordResetController = require("../controllers/passwordResetController");

// Request password reset link (POST /api/reset-password)
router.post("/", passwordResetController.requestPasswordReset);

// Verify reset token status by user ID (GET /api/reset-password/:userId)
router.get("/:userId", passwordResetController.getPasswordResetStatus);

// Perform password reset (PATCH /api/reset-password or POST /api/reset-password/confirm)
router.patch("/", passwordResetController.resetPassword);
router.post("/confirm", passwordResetController.resetPassword);

module.exports = router;
