const express = require("express");
const router = express.Router();
const reviewsController = require("../controllers/reviewsController");
const { authenticateToken, authorize } = require("../middleware/auth");

// Public endpoints
router.get("/product/:productId", reviewsController.getProductReviews);
router.get("/seller/:sellerId", reviewsController.getSellerReviews);

// Authenticated user endpoints
router.get("/my-review", authenticateToken, reviewsController.getMyReview);
router.post("/", authenticateToken, reviewsController.createReview);
router.patch("/:id", authenticateToken, reviewsController.updateReview);
router.post("/:id/vote", authenticateToken, reviewsController.voteReviewHelpful);
router.post("/:id/response", authenticateToken, reviewsController.respondToReview);

// Admin endpoints (Only admin/super_admin can view all or delete)
router.get(
  "/admin/all",
  authenticateToken,
  authorize(["admin", "super_admin"]),
  reviewsController.getAllReviewsAdmin
);

router.delete(
  "/:id",
  authenticateToken,
  authorize(["admin", "super_admin"]),
  reviewsController.deleteReview
);

module.exports = router;

