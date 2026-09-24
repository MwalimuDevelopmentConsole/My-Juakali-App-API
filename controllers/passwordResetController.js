const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Buyer = require("../models/Buyer");
const Seller = require("../models/Seller");
const Marketer = require("../models/Marketer");
const Admin = require("../models/Admin");
const PasswordReset = require("../models/PasswordReset");

const userModels = {
  buyer: Buyer,
  client: Buyer,
  seller: Seller,
  marketer: Marketer,
  agent: Marketer,
  admin: Admin,
};

// @desc    Request password reset link
// @route   POST /api/reset-password
const requestPasswordReset = async (req, res) => {
  try {
    const { email, userType } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required",
      });
    }

    const trimmedEmail = email.trim().toLowerCase();
    let foundUser = null;
    let resolvedUserType = userType ? userType.toLowerCase() : null;

    // If specific userType was provided, search that model first
    if (resolvedUserType && userModels[resolvedUserType]) {
      foundUser = await userModels[resolvedUserType].findOne({
        email: trimmedEmail,
      });
    }

    // If not found yet, search across all user models
    if (!foundUser) {
      const candidates = [
        { type: "seller", model: Seller },
        { type: "client", model: Buyer },
        { type: "agent", model: Marketer },
        { type: "admin", model: Admin },
      ];

      for (const candidate of candidates) {
        const user = await candidate.model.findOne({ email: trimmedEmail });
        if (user) {
          foundUser = user;
          resolvedUserType = candidate.type;
          break;
        }
      }
    }

    if (!foundUser) {
      // Return 404 or friendly error message
      return res.status(404).json({
        success: false,
        message: "No account found associated with this email address.",
      });
    }

    // Invalidate existing unused tokens for this user
    await PasswordReset.updateMany(
      { userId: foundUser._id, isUsed: false },
      { $set: { isUsed: true } }
    );

    // Generate secure reset token (64 hex characters)
    const resetString = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours validity

    await PasswordReset.create({
      userId: foundUser._id,
      userType: resolvedUserType || "client",
      email: trimmedEmail,
      resetString,
      expiresAt,
      isUsed: false,
    });

    // Also update model fields if present
    if ("passwordResetToken" in foundUser.schema.paths) {
      foundUser.passwordResetToken = resetString;
      foundUser.passwordResetExpires = expiresAt;
      await foundUser.save({ validateBeforeSave: false });
    }

    return res.status(200).json({
      success: true,
      message: "Password reset link has been created and sent to your email.",
      data: {
        userId: foundUser._id,
        userType: resolvedUserType,
        expiresAt,
      },
    });
  } catch (error) {
    console.error("Password reset request error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error occurred while requesting password reset",
    });
  }
};

// @desc    Get password reset token status by userId
// @route   GET /api/reset-password/:userId
const getPasswordResetStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const resetRecord = await PasswordReset.findOne({ userId }).sort({
      createdAt: -1,
    });

    if (!resetRecord) {
      return res.status(200).json({
        success: false,
        message: "No active password reset link found",
        data: {
          isUsed: true,
          expiresAt: new Date(0),
        },
      });
    }

    const isExpired = new Date(resetRecord.expiresAt) < new Date();

    return res.status(200).json({
      success: true,
      data: {
        userId: resetRecord.userId,
        userType: resetRecord.userType,
        expiresAt: resetRecord.expiresAt,
        isUsed: resetRecord.isUsed || isExpired,
      },
    });
  } catch (error) {
    console.error("Get password reset status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify reset token status",
    });
  }
};

// @desc    Perform password reset
// @route   PATCH /api/reset-password
const resetPassword = async (req, res) => {
  try {
    const { userId, userType, resetString, password, newPassword } = req.body;
    const targetPassword = password || newPassword;

    if (!userId || !resetString || !targetPassword) {
      return res.status(400).json({
        success: false,
        message: "User ID, reset token, and new password are required",
      });
    }

    if (targetPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    // Find valid active reset record
    const resetRecord = await PasswordReset.findOne({
      userId,
      resetString,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: "This password reset link is invalid, already used, or expired.",
      });
    }

    // Resolve user model
    const resolvedType = (userType || resetRecord.userType || "client").toLowerCase();
    let Model = userModels[resolvedType];
    let user = null;

    if (Model) {
      user = await Model.findById(userId);
    }

    // Fallback: search other models if not found with resolvedType
    if (!user) {
      for (const m of [Seller, Buyer, Marketer, Admin]) {
        user = await m.findById(userId);
        if (user) break;
      }
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found",
      });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(targetPassword, 12);
    user.password = hashedPassword;

    if ("passwordResetToken" in user.schema.paths) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
    }

    await user.save({ validateBeforeSave: false });

    // Mark reset record as used
    resetRecord.isUsed = true;
    await resetRecord.save();

    return res.status(200).json({
      success: true,
      message: "Password has been reset successfully! You can now log in.",
    });
  } catch (error) {
    console.error("Reset password execution error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset password. Please try again later.",
    });
  }
};

module.exports = {
  requestPasswordReset,
  getPasswordResetStatus,
  resetPassword,
};
