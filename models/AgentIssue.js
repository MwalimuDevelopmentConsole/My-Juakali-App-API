const mongoose = require("mongoose");

const agentIssueSchema = new mongoose.Schema(
  {
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Marketer",
      required: true,
      index: true,
    },
    agentName: {
      type: String,
      required: true,
      trim: true,
    },
    agentPhone: {
      type: String,
      trim: true,
    },
    agentEmail: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ["suggestion", "issue", "feature_request", "inquiry"],
      default: "suggestion",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: [
        "seller_onboarding",
        "app_glitch",
        "payments",
        "catalog",
        "marketing",
        "system_speed",
        "other",
      ],
      default: "seller_onboarding",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    isPublic: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "in_review", "in_progress", "resolved", "closed", "rejected"],
      default: "open",
      index: true,
    },
    resolutionExplanation: {
      type: String,
      trim: true,
    },
    resolvedBy: {
      id: mongoose.Schema.Types.ObjectId,
      name: String,
      role: String,
    },
    resolvedAt: {
      type: Date,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
    statusHistory: [
      {
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: {
          id: mongoose.Schema.Types.ObjectId,
          name: String,
          role: String,
        },
        note: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AgentIssue", agentIssueSchema);
