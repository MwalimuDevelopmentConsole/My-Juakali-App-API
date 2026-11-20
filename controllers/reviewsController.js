const mongoose = require("mongoose");
const Review = require("../models/Review");
const Product = require("../models/Product");
const Seller = require("../models/Seller");

/**
 * Helper to recalculate and persist average ratings for a Product and Seller
 */
const recalculateRatings = async (productId, sellerId) => {
  try {
    // 1. Recalculate Product rating
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      const prodStats = await Review.aggregate([
        {
          $match: {
            product: new mongoose.Types.ObjectId(productId),
            status: "approved",
          },
        },
        {
          $group: {
            _id: "$product",
            average: { $avg: "$rating" },
            count: { $sum: 1 },
          },
        },
      ]);

      const avgProd = prodStats.length > 0 ? Math.round(prodStats[0].average * 10) / 10 : 0;
      const countProd = prodStats.length > 0 ? prodStats[0].count : 0;

      await Product.findByIdAndUpdate(productId, {
        "ratings.average": avgProd,
        "ratings.count": countProd,
      });
    }

    // 2. Recalculate Seller rating
    if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
      const sellerStats = await Review.aggregate([
        {
          $match: {
            reviewee: new mongoose.Types.ObjectId(sellerId),
            status: "approved",
          },
        },
        {
          $group: {
            _id: "$reviewee",
            average: { $avg: "$rating" },
            count: { $sum: 1 },
          },
        },
      ]);

      const avgSeller = sellerStats.length > 0 ? Math.round(sellerStats[0].average * 10) / 10 : 0;
      const countSeller = sellerStats.length > 0 ? sellerStats[0].count : 0;

      await Seller.findByIdAndUpdate(sellerId, {
        "ratings.average": avgSeller,
        "ratings.count": countSeller,
      });
    }
  } catch (err) {
    console.error("Error recalculating ratings:", err);
  }
};

// @desc    Get reviews for a product with rating statistics
// @route   GET /api/reviews/product/:productId
// @access  Public
const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, rating } = req.query;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const filter = {
      product: new mongoose.Types.ObjectId(productId),
      status: "approved",
    };

    if (rating && !isNaN(parseInt(rating, 10))) {
      filter.rating = parseInt(rating, 10);
    }

    const [reviews, totalReviews, ratingStats] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Review.countDocuments(filter),
      Review.aggregate([
        {
          $match: {
            product: new mongoose.Types.ObjectId(productId),
            status: "approved",
          },
        },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Build distribution { 5: count, 4: count, ... }
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalScore = 0;
    let totalApproved = 0;

    ratingStats.forEach((r) => {
      if (distribution[r._id] !== undefined) {
        distribution[r._id] = r.count;
      }
      totalScore += r._id * r.count;
      totalApproved += r.count;
    });

    const averageRating = totalApproved > 0 ? Math.round((totalScore / totalApproved) * 10) / 10 : 0;

    res.status(200).json({
      success: true,
      data: {
        reviews,
        pagination: {
          total: totalReviews,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalReviews / limitNum) || 1,
        },
        stats: {
          averageRating,
          totalCount: totalApproved,
          distribution,
        },
      },
    });
  } catch (error) {
    console.error("Error getting product reviews:", error);
    res.status(500).json({ success: false, message: "Failed to fetch product reviews" });
  }
};

// @desc    Get reviews for a seller/artisan
// @route   GET /api/reviews/seller/:sellerId
// @access  Public
const getSellerReviews = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { page = 1, limit = 10, rating } = req.query;

    if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ success: false, message: "Invalid seller ID" });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const filter = {
      reviewee: new mongoose.Types.ObjectId(sellerId),
      status: "approved",
    };

    if (rating && !isNaN(parseInt(rating, 10))) {
      filter.rating = parseInt(rating, 10);
    }

    const [reviews, totalReviews, ratingStats] = await Promise.all([
      Review.find(filter)
        .populate("product", "title media slug")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Review.countDocuments(filter),
      Review.aggregate([
        {
          $match: {
            reviewee: new mongoose.Types.ObjectId(sellerId),
            status: "approved",
          },
        },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalScore = 0;
    let totalApproved = 0;

    ratingStats.forEach((r) => {
      if (distribution[r._id] !== undefined) {
        distribution[r._id] = r.count;
      }
      totalScore += r._id * r.count;
      totalApproved += r.count;
    });

    const averageRating = totalApproved > 0 ? Math.round((totalScore / totalApproved) * 10) / 10 : 0;

    res.status(200).json({
      success: true,
      data: {
        reviews,
        pagination: {
          total: totalReviews,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalReviews / limitNum) || 1,
        },
        stats: {
          averageRating,
          totalCount: totalApproved,
          distribution,
        },
      },
    });
  } catch (error) {
    console.error("Error getting seller reviews:", error);
    res.status(500).json({ success: false, message: "Failed to fetch seller reviews" });
  }
};

// @desc    Get user's existing review for product or seller
// @route   GET /api/reviews/my-review
// @access  Authenticated user
const getMyReview = async (req, res) => {
  try {
    const { productId, sellerId } = req.query;
    const reviewerId = req.user?.id || req.user?._id;

    if (!reviewerId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const query = { reviewer: reviewerId };
    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      query.product = productId;
    } else if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
      query.reviewee = sellerId;
      query.product = null;
    } else {
      return res.status(400).json({ success: false, message: "productId or sellerId is required" });
    }

    const review = await Review.findOne(query).lean();

    res.status(200).json({
      success: true,
      hasReviewed: !!review,
      review: review || null,
    });
  } catch (error) {
    console.error("Error getting user review:", error);
    res.status(500).json({ success: false, message: "Failed to check review status" });
  }
};

// @desc    Create a review
// @route   POST /api/reviews
// @access  Authenticated users only
const createReview = async (req, res) => {
  try {
    const {
      reviewee,
      product,
      rating,
      title,
      comment,
      images,
    } = req.body;

    const reviewerId = req.user?.id || req.user?._id;
    const rawUserType = req.user?.userType || req.user?.role || "Buyer";
    const reviewerModel = ["Seller", "seller"].includes(rawUserType) ? "Seller" : "Buyer";

    const numRating = parseInt(rating, 10);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be an integer between 1 and 5" });
    }

    if (!comment || !comment.trim()) {
      return res.status(400).json({ success: false, message: "Review comment is required" });
    }

    let targetSellerId = reviewee;
    let targetProductId = product || null;

    // If product is provided, verify product and derive seller
    if (targetProductId) {
      const prodDoc = await Product.findById(targetProductId);
      if (!prodDoc) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }
      targetSellerId = prodDoc.seller;
    }

    if (!targetSellerId) {
      return res.status(400).json({ success: false, message: "Artisan/seller ID is required" });
    }

    // Prevent user from reviewing their own product/seller account
    if (targetSellerId.toString() === reviewerId.toString()) {
      return res.status(400).json({ success: false, message: "You cannot review your own listing or business" });
    }

    // Check for existing review
    const duplicateQuery = { reviewer: reviewerId };
    if (targetProductId) {
      duplicateQuery.product = targetProductId;
    } else {
      duplicateQuery.reviewee = targetSellerId;
      duplicateQuery.product = null;
    }

    const existingReview = await Review.findOne(duplicateQuery);
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this. You can edit your existing review instead.",
        reviewId: existingReview._id,
      });
    }

    const reviewerName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.phone || "Verified Customer";

    const newReview = await Review.create({
      reviewer: reviewerId,
      reviewerModel,
      reviewerName,
      reviewerAvatar: req.user.avatar || null,
      reviewee: targetSellerId,
      product: targetProductId,
      rating: numRating,
      ratings: { overall: numRating },
      title: title?.trim() || "",
      comment: comment.trim(),
      images: Array.isArray(images) ? images : [],
      status: "approved", // Published immediately
    });

    // Recalculate rating aggregates
    await recalculateRatings(targetProductId, targetSellerId);

    res.status(201).json({
      success: true,
      message: "Thank you for your feedback! Your review has been published.",
      review: newReview,
    });
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to submit review" });
  }
};

// @desc    Update a review (User updates own review OR Admin updates any review)
// @route   PATCH /api/reviews/:id
// @access  Authenticated user (Owner or Admin)
const updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, title, comment, images, status, adminEditNote } = req.body;
    const userId = req.user?.id || req.user?._id;
    const rawRole = (req.user?.userType || req.user?.role || "").toLowerCase();
    const isAdmin = ["admin", "super_admin"].includes(rawRole);

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    const isOwner = review.reviewer.toString() === userId.toString();

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "You are not authorized to edit this review" });
    }

    // If regular user, update their content
    if (rating !== undefined) {
      const numRating = parseInt(rating, 10);
      if (numRating >= 1 && numRating <= 5) {
        review.rating = numRating;
        review.ratings = { ...review.ratings, overall: numRating };
      }
    }

    if (title !== undefined) review.title = title.trim();
    if (comment !== undefined && comment.trim()) review.comment = comment.trim();
    if (Array.isArray(images)) review.images = images;

    // Admin-only fields
    if (isAdmin) {
      if (status && ["approved", "flagged", "hidden", "pending"].includes(status)) {
        review.status = status;
      }
      if (!isOwner) {
        review.isEditedByAdmin = true;
        if (adminEditNote) review.adminEditNote = adminEditNote;
      }
    }

    await review.save();

    // Recalculate aggregates
    await recalculateRatings(review.product, review.reviewee);

    res.status(200).json({
      success: true,
      message: "Review updated successfully",
      review,
    });
  } catch (error) {
    console.error("Error updating review:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update review" });
  }
};

// @desc    Delete a review (ADMIN ONLY)
// @route   DELETE /api/reviews/:id
// @access  Admin only
const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const rawRole = (req.user?.userType || req.user?.role || "").toLowerCase();
    const isAdmin = ["admin", "super_admin"].includes(rawRole);

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Permission denied: Only platform administrators are permitted to delete reviews.",
      });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    const productId = review.product;
    const sellerId = review.reviewee;

    await Review.findByIdAndDelete(id);

    // Recalculate ratings
    await recalculateRatings(productId, sellerId);

    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({ success: false, message: "Failed to delete review" });
  }
};

// @desc    Get all reviews for Admin Management
// @route   GET /api/reviews/admin/all
// @access  Admin only
const getAllReviewsAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search = "",
      rating = "",
      status = "",
      productId = "",
      sellerId = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (search && search.trim()) {
      const reg = new RegExp(search.trim(), "i");
      query.$or = [
        { reviewerName: reg },
        { comment: reg },
        { title: reg },
      ];
    }

    if (rating) {
      query.rating = parseInt(rating, 10);
    }

    if (status) {
      query.status = status;
    }

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      query.product = new mongoose.Types.ObjectId(productId);
    }

    if (sellerId && mongoose.Types.ObjectId.isValid(sellerId)) {
      query.reviewee = new mongoose.Types.ObjectId(sellerId);
    }

    const [reviews, totalReviews, ratingStats] = await Promise.all([
      Review.find(query)
        .populate("product", "title slug media")
        .populate("reviewee", "firstName lastName businessInfo phone email")
        .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Review.countDocuments(query),
      Review.aggregate([
        {
          $group: {
            _id: null,
            totalAvg: { $avg: "$rating" },
            totalCount: { $sum: 1 },
            fiveStars: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
            negativeReviews: { $sum: { $cond: [{ $lte: ["$rating", 2] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const stats = ratingStats[0] || {
      totalAvg: 0,
      totalCount: 0,
      fiveStars: 0,
      negativeReviews: 0,
    };

    res.status(200).json({
      success: true,
      data: {
        reviews,
        pagination: {
          total: totalReviews,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalReviews / limitNum) || 1,
        },
        stats: {
          averageRating: Math.round((stats.totalAvg || 0) * 10) / 10,
          totalCount: stats.totalCount || 0,
          fiveStars: stats.fiveStars || 0,
          negativeReviews: stats.negativeReviews || 0,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching admin reviews:", error);
    res.status(500).json({ success: false, message: "Failed to fetch reviews" });
  }
};

// @desc    Seller response to a review
// @route   POST /api/reviews/:id/response
// @access  Seller only
const respondToReview = async (req, res) => {
  try {
    const { comment } = req.body;
    const sellerId = req.user?.id || req.user?._id;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ success: false, message: "Response comment is required" });
    }

    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    if (review.reviewee.toString() !== sellerId.toString()) {
      return res.status(403).json({ success: false, message: "You can only respond to reviews about your own listings" });
    }

    review.sellerResponse = {
      comment: comment.trim(),
      respondedAt: new Date(),
    };

    await review.save();

    res.status(200).json({
      success: true,
      message: "Response submitted successfully",
      sellerResponse: review.sellerResponse,
    });
  } catch (error) {
    console.error("Error responding to review:", error);
    res.status(500).json({ success: false, message: "Failed to respond to review" });
  }
};

// @desc    Vote review helpful
// @route   POST /api/reviews/:id/vote
// @access  Authenticated user
const voteReviewHelpful = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found" });
    }

    const hasVoted = review.votedBy?.some((v) => v.toString() === userId.toString());

    if (hasVoted) {
      // Toggle off
      review.votedBy = review.votedBy.filter((v) => v.toString() !== userId.toString());
      review.helpfulVotes = Math.max(0, review.helpfulVotes - 1);
    } else {
      // Toggle on
      review.votedBy.push(userId);
      review.helpfulVotes += 1;
    }

    await review.save();

    res.status(200).json({
      success: true,
      helpfulVotes: review.helpfulVotes,
      hasVoted: !hasVoted,
    });
  } catch (error) {
    console.error("Error voting on review:", error);
    res.status(500).json({ success: false, message: "Failed to vote on review" });
  }
};

module.exports = {
  getProductReviews,
  getSellerReviews,
  getMyReview,
  createReview,
  updateReview,
  deleteReview,
  getAllReviewsAdmin,
  respondToReview,
  voteReviewHelpful,
};
