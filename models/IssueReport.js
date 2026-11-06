const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const issueReportSchema = new Schema(
  {
    reportNumber: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    reporter: {
      userId: {
        type: Schema.Types.ObjectId,
        required: true,
        index: true,
      },
      userType: {
        type: String,
        enum: ["Buyer", "Seller"],
        required: true,
      },
      name: {
        type: String,
        required: true,
        trim: true,
      },
      email: {
        type: String,
        trim: true,
      },
      phone: {
        type: String,
        trim: true,
      },
    },
    category: {
      type: String,
      enum: [
        "product_quality",
        "misleading_listing",
        "seller_unresponsive",
        "delivery_delay",
        "payment_dispute",
        "account_verification",
        "harassment_abuse",
        "platform_glitch",
        "other",
      ],
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    targetProduct: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      default: null,
      index: true,
    },
    targetSeller: {
      type: Schema.Types.ObjectId,
      ref: "Seller",
      default: null,
      index: true,
    },
    evidenceImages: [
      {
        url: { type: String, required: true },
        name: { type: String, default: "Evidence" },
      },
    ],
    status: {
      type: String,
      enum: [
        "pending",
        "investigating",
        "in_progress",
        "resolved",
        "rejected",
        "closed",
      ],
      default: "pending",
      index: true,
    },
    resolution: {
      resolvedBy: {
        type: Schema.Types.ObjectId,
        ref: "Admin",
      },
      adminName: {
        type: String,
      },
      resolutionNotes: {
        type: String,
        trim: true,
      },
      resolvedAt: {
        type: Date,
      },
    },
    timeline: [
      {
        status: { type: String, required: true },
        note: { type: String },
        updatedBy: { type: String, required: true },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
issueReportSchema.index({ status: 1, createdAt: -1 });
issueReportSchema.index({ category: 1, priority: 1 });
issueReportSchema.index({ targetSeller: 1, status: 1 });
issueReportSchema.index({ targetProduct: 1, status: 1 });

module.exports = mongoose.model("IssueReport", issueReportSchema);

