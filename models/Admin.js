const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// ADMINS MODEL (System administrators)
const adminSchema = new Schema(
  {
    // Essential Information
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
    },

    // Personal Information
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },

    // Profile
    avatar: {
      url: String,
      publicId: String,
      alt: String,
    },

    // Role & Permissions
    role: {
      type: String,
      enum: ["super_admin", "admin",],
      required: true,
      index: true,
    },
    permissions: [],

    // Account Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },

    // Security
    security: {
      lastLogin: Date,
      lastPasswordChange: Date,
      loginAttempts: {
        type: Number,
        default: 0,
      },
      lockUntil: Date,
      twoFactorEnabled: {
        type: Boolean,
        default: false,
      },
      twoFactorSecret: {
        type: String,
        select: false,
      },
      backupCodes: {
        type: [String],
        select: false,
      },
      ipWhitelist: [String],
      sessionTokens: [String],
    },

    // Activity Tracking
    activity: {
      loginCount: {
        type: Number,
        default: 0,
      },
      lastActive: Date,
      actionsPerformed: {
        type: Number,
        default: 0,
      },
      lastAction: {
        type: String,
      },
      lastActionAt: Date,
    },

    // Department & Contact
    department: {
      type: String,
      enum: [
        "tech",
        "customer_support",
        "content_moderation",
        "business_development",
        "finance",
      ],
      required: true,
    },
    workingHours: {
      start: String, // "09:00"
      end: String, // "17:00"
      timezone: {
        type: String,
        default: "Africa/Nairobi",
      },
    },

    // Manager & Hierarchy
    reportsTo: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },

    // Contact Preferences
    preferences: {
      notifications: {
        email: {
          urgent: { type: Boolean, default: true },
          daily_summary: { type: Boolean, default: true },
          system_alerts: { type: Boolean, default: true },
        },
        sms: {
          urgent: { type: Boolean, default: true },
          system_down: { type: Boolean, default: true },
        },
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: { virtuals: true },
  }
);

// Indexes
adminSchema.index({ email: 1 });
adminSchema.index({ role: 1, isActive: 1 });
adminSchema.index({ department: 1 });
adminSchema.index({ createdAt: -1 });

// Virtual fields
adminSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

adminSchema.virtual("isLocked").get(function () {
  return !!(this.security.lockUntil && this.security.lockUntil > Date.now());
});

module.exports = mongoose.model("Admin", adminSchema);
