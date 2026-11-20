const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// REVIEWS MODEL - Supports Product Reviews & Artisan/Seller Reviews
const reviewSchema = new Schema(
  {
    reviewer: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: "reviewerModel",
      index: true,
    },
    reviewerModel: {
      type: String,
      required: true,
      enum: ["Buyer", "Seller"],
      default: "Buyer",
    },
    reviewerName: {
      type: String,
      required: true,
      trim: true,
    },
    reviewerAvatar: {
      type: String,
      default: null,
    },
    reviewee: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      index: true,
      default: null, // Null if reviewing the artisan directly
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    // Rating (1 to 5)
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      index: true,
    },

    // Optional breakdown for backward compatibility
    ratings: {
      overall: { type: Number, min: 1, max: 5 },
      communication: { type: Number, min: 1, max: 5 },
      quality: { type: Number, min: 1, max: 5 },
      timeliness: { type: Number, min: 1, max: 5 },
      professionalism: { type: Number, min: 1, max: 5 },
    },

    title: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    // Media attachments
    images: [
      {
        url: { type: String, required: true },
        alt: { type: String, default: "Review image" },
      },
    ],

    // Moderation Status
    status: {
      type: String,
      enum: ["approved", "flagged", "hidden", "pending"],
      default: "approved", // Published immediately, moderated retroactively
      index: true,
    },

    // Administrative modification flag
    isEditedByAdmin: {
      type: Boolean,
      default: false,
    },
    adminEditNote: {
      type: String,
      trim: true,
    },

    // Helpful votes
    helpfulVotes: {
      type: Number,
      default: 0,
    },
    votedBy: [
      {
        type: Schema.Types.ObjectId,
      },
    ],

    // Response from seller
    sellerResponse: {
      comment: { type: String, trim: true, maxlength: 1000 },
      respondedAt: { type: Date },
    },

    // Verification
    isVerifiedPurchase: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
reviewSchema.index({ reviewee: 1, status: 1, createdAt: -1 });
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ rating: -1 });
reviewSchema.index({ reviewer: 1, product: 1 });
reviewSchema.index({ reviewer: 1, reviewee: 1 });

module.exports = mongoose.model("Review", reviewSchema);
