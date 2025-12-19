const Buyer = require("../models/Buyer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { generateTokens } = require("./authController");
const Seller = require("../models/Seller");
const Marketer = require("../models/Marketer");

// @desc    Register new buyer
// @route   POST /api/buyers/register
// @access  Public
const registerBuyer = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, source } = req.body;

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

    const formattedEmail = email.toLowerCase().trim();

    // Check if email already exists in the database
    const checkDuplicate = async (models, field, value) => {
      const results = await Promise.all(
        models.map((model) => model.findOne({ [field]: value }).lean())
      );

      return results.find((item) => item !== null) || null;
    };

    const models = [Buyer, Seller, Marketer];

    const [emailExists, phoneExists] = await Promise.all([
      checkDuplicate(models, "email", formattedEmail),
      checkDuplicate(models, "phone", phone),
    ]);

    if (emailExists) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // if (phoneExists) {
    //   return res
    //     .status(409)
    //     .json({ message: "Phone number already registered" });
    // }

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
      source,
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
    console.log(error);
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

// @desc    Get all buyers (Admin)
// @route   GET /api/buyers
// @access  Admin only
const getAllBuyers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    const query = {};

    // Search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by status
    if (status) {
      if (status === "active") query.isActive = true;
      if (status === "inactive") query.isActive = false;
    }

    const buyers = await Buyer.find(query)
      .select("-password -emailVerificationToken -passwordResetToken")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const count = await Buyer.countDocuments(query);

    res.status(200).json({
      success: true,
      data: buyers, // Fixed typo
      buyers,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalBuyers: count,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Get single buyer by ID (Admin)
// @route   GET /api/buyers/:id
// @access  Admin only
const getBuyerById = async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.params.id)
      .select("-password")
      .lean();

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    // TODO: Add order history or other related data fetching here if needed

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

// @desc    Update buyer status (Admin)
// @route   PATCH /api/buyers/:id/status
// @access  Admin only
const updateBuyerStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    const buyer = await Buyer.findById(req.params.id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    buyer.isActive = isActive;
    await buyer.save();

    res.status(200).json({
      success: true,
      message: `Buyer account ${isActive ? "activated" : "deactivated"}`,
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

module.exports = {
  registerBuyer,
  getBuyerProfile,
  updateBuyerProfile,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getAllBuyers,
  getBuyerById,
  updateBuyerStatus,
};
