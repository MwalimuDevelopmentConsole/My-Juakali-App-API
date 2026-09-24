const express = require("express");
const router = express.Router();
const agentIssueController = require("../controllers/agentIssueController");
const { authenticateToken, isAdmin } = require("../middleware/auth");

// Agent routes
router.post("/", authenticateToken, agentIssueController.createIssue);
router.get("/my-issues", authenticateToken, agentIssueController.getMyIssues);
router.get("/public", authenticateToken, agentIssueController.getPublicIssues);

// Admin routes
router.get("/admin/all", authenticateToken, isAdmin, agentIssueController.getAllIssuesAdmin);
router.patch("/admin/:id/status", authenticateToken, isAdmin, agentIssueController.updateIssueStatusAdmin);

// Shared route
router.get("/:id", authenticateToken, agentIssueController.getIssueById);

module.exports = router;
