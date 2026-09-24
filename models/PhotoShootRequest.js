const mongoose = require("mongoose");

const photoShootRequestSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    contactPhone: {
      type: String,
      required: true,
      trim: true,
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    location: {
      address: { type: String, trim: true },
      city: { type: String, trim: true },
      county: { type: String, trim: true },
      landmark: { type: String, trim: true },
    },
    preferredDate: {
      type: Date,
      required: true,
    },
    alternativeDate: {
      type: Date,
    },
    preferredTimeSlot: {
      type: String,
      enum: ["morning", "afternoon", "full_day", "flexible"],
      default: "flexible",
    },
    estimatedProductCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    productCategories: [
      {
        type: String,
        trim: true,
      },
    ],
    notes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "rescheduled",
      ],
      default: "pending",
      index: true,
    },
    scheduledDate: {
      type: Date,
    },
    assignedTeamMember: {
      type: String,
      trim: true,
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

module.exports = mongoose.model("PhotoShootRequest", photoShootRequestSchema);
