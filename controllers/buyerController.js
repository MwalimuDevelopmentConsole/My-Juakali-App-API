const Buyer = require("../models/Buyer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { generateTokens } = require("./authController");

// @desc    Register new buyer
// @route   POST /api/buyers/register
// @access  Public
const registerBuyer = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // Check if buyer already exists
    const existingBuyer = await Buyer.findOne({ email });
    if (existingBuyer) {
      return res.status(400).json({
        success: false,
        message: "Buyer with this email already exists",
      });
    }

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const hashPassword = await bcrypt.hash(password, 10);

    const buyerData = {
      email,
      password: hashPassword,
      firstName,
      lastName,
      phone,
      emailVerificationToken,
      emailVerificationExpires,
    };

    const buyer = await Buyer.create(buyerData);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(buyer, "buter");

    // Set refresh token in httpOnly cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true, // Use secure cookies in production
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // TODO: Send verification email
    // await sendVerificationEmail(buyer.email, emailVerificationToken);

    res.status(201).json({
      success: true,
      message:
        "Buyer registered successfully. Please check your email to verify your account.",
      accessToken,
      buyer: {
        id: buyer._id,
        email: buyer.email,
        firstName: buyer.firstName,
        lastName: buyer.lastName,
        fullName: buyer.fullName,
        isEmailVerified: buyer.isEmailVerified,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Get buyer profile
// @route   GET /api/buyers/profile
// @access  Buyer only
const getBuyerProfile = async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.user.id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    res.status(200).json({
      success: true,
      buyer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Update buyer profile
// @route   PUT /api/buyers/profile
// @access  Buyer only
const updateBuyerProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, preferences } = req.body;

    const buyer = await Buyer.findById(req.user.id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    // Update fields
    if (firstName) buyer.firstName = firstName;
    if (lastName) buyer.lastName = lastName;
    if (phone) buyer.phone = phone;
    if (preferences) {
      buyer.preferences = { ...buyer.preferences, ...preferences };
    }

    await buyer.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      buyer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Verify email
// @route   GET /api/buyers/verify-email/:token
// @access  Public
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const buyer = await Buyer.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!buyer) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired verification token",
      });
    }

    buyer.isEmailVerified = true;
    buyer.emailVerificationToken = undefined;
    buyer.emailVerificationExpires = undefined;

    await buyer.save();

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Request password reset
// @route   POST /api/buyers/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const buyer = await Buyer.findOne({ email });

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "No buyer found with this email",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    buyer.passwordResetToken = resetToken;
    buyer.passwordResetExpires = passwordResetExpires;

    await buyer.save();

    // TODO: Send password reset email
    // await sendPasswordResetEmail(buyer.email, resetToken);

    res.status(200).json({
      success: true,
      message: "Password reset link sent to your email",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Reset password
// @route   POST /api/buyers/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const buyer = await Buyer.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!buyer) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    buyer.password = password;
    buyer.passwordResetToken = undefined;
    buyer.passwordResetExpires = undefined;

    await buyer.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  registerBuyer,
  getBuyerProfile,
  updateBuyerProfile,
  verifyEmail,
  forgotPassword,
  resetPassword,
};
