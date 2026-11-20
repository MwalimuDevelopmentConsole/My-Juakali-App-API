const express = require("express");
const router = express.Router();
const { authenticateToken, isAdmin } = require("../middleware/auth");
const aiController = require("../controllers/aiController");

// Helper to authorize any role that can edit/create products
const canUseAi = (req, res, next) => {
  const role = (req.user?.role || req.user?.userType || "").toLowerCase();
  if (["admin", "super_admin", "seller", "marketer"].includes(role)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: "Access denied. Only sellers, agents, and administrators can access AI generation.",
  });
};

// Public status for sellers, agents, and admins (checks if AI is configured and enabled)
router.get("/status", authenticateToken, canUseAi, aiController.getStatus);

// Product Content Generation for sellers, agents, and admins
router.post(
  "/generate-product-content",
  authenticateToken,
  canUseAi,
  aiController.generateProductContent
);

// Admin-Only Routes (Credentials, Settings & Knowledge Base)
router.get("/settings", authenticateToken, isAdmin, aiController.getSettings);
router.patch("/settings", authenticateToken, isAdmin, aiController.updateSettings);
router.post("/test-connection", authenticateToken, isAdmin, aiController.testConnection);
router.get("/knowledge-base", authenticateToken, isAdmin, aiController.getKnowledgeBase);
router.put("/knowledge-base", authenticateToken, isAdmin, aiController.updateKnowledgeBase);
router.post("/knowledge-base/reset", authenticateToken, isAdmin, aiController.resetKnowledgeBase);

module.exports = router;
