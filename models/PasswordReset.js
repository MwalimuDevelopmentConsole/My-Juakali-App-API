const mongoose = require("mongoose");

const passwordResetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  userType: {
    type: String,
    enum: ["buyer", "client", "seller", "marketer", "agent", "admin"],
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  resetString: {
    type: String,
    required: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours
  },
  isUsed: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400, // Auto-delete document after 24 hours
  },
});

module.exports = mongoose.model("PasswordReset", passwordResetSchema);
