const express = require("express");
const router = express.Router();
const issueController = require("../controllers/issueController");
const { authenticateToken, authorize } = require("../middleware/auth");

// Authenticated user endpoints
router.post("/", authenticateToken, issueController.createIssue);
router.get("/my-issues", authenticateToken, issueController.getMyIssues);

// Single issue detail (reporter or admin)
router.get("/:id", authenticateToken, issueController.getIssueDetails);

// Admin-only endpoints
router.get(
  "/admin/all",
  authenticateToken,
  authorize(["admin", "super_admin"]),
  issueController.getAllIssuesAdmin
);

router.patch(
  "/:id/resolve",
  authenticateToken,
  authorize(["admin", "super_admin"]),
  issueController.resolveIssue
);

module.exports = router;

