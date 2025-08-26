const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// BUYERS MODEL (Minimal - Just for purchasing)
const buyerSchema = new Schema(
  {
    // Essential Information Only
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    // Basic Profile (Optional)
    firstName: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    phone: {
      type: String,
      trim: true,
      sparse: true, // Allow multiple null values but unique non-null values
    },

    role: {
      type: String,
      enum: ["buyer", "client"], // Only buyers and clients can register
      default: "buyer",
    },

    // Account Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    // Email Verification
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },

    // Password Reset
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },

    // Basic Activity Tracking
    lastLogin: Date,
    loginCount: {
      type: Number,
      default: 0,
    },

    // Profile
    avatar: {
      url: String,
      publicId: String,
      alt: String,
    },

    // Security
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: Date,

    // Basic Preferences
    preferences: {
      emailNotifications: {
        type: Boolean,
        default: true,
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

// Indexes for performance
buyerSchema.index({ email: 1 });
buyerSchema.index({ isActive: 1 });
buyerSchema.index({ createdAt: -1 });

// Virtual for full name
buyerSchema.virtual("fullName").get(function () {
  return this.firstName && this.lastName
    ? `${this.firstName} ${this.lastName}`
    : this.firstName || (this.email ? this.email.split("@")[0] : "");
});

module.exports = mongoose.model("Buyer", buyerSchema);
