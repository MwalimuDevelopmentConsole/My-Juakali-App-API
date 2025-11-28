const Marketer = require("../models/Marketer");
const Seller = require("../models/Seller");
const Commission = require("../models/Commission");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Buyer = require("../models/Buyer");

// generate refarral code
const generateUniqueReferralCode = async (
  Model,
  length = 10,
  maxRetries = 5
) => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let code = "";
    for (let i = 0; i < length; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    // Check if code already exists in database
    const exists = await Model.findOne({
      "marketerInfo.referralCode": code,
    });

    if (!exists) {
      return code;
    }
  }

  // Fallback: Use timestamp + random if all retries failed
  return generateTimestampBasedCode();
};
const generateTimestampBasedCode = () => {
  const timestamp = Date.now().toString(36).toUpperCase(); // Convert to base36
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${timestamp}${random}`.substring(0, 10);
};

// @desc    Register new marketer
// @route   POST /api/marketers/register
// @access  Public
const registerMarketer = async (req, res) => {
  try {
    const { email, password, phone, firstName, lastName, location, bio } =
      req.body;

    // Validation
    if (
      !email ||
      !password ||
      !phone ||
      !firstName ||
      !lastName ||
      !location?.county
    ) {
      return res.status(400).json({
        success: false,
        message: "Required fields: email, password, phone, name, and county",
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

    if (phoneExists) {
      return res
        .status(409)
        .json({ message: "Phone number already registered" });
    }

    const referralCode = await generateUniqueReferralCode(Marketer, 10);

    const hashedPassword = await bcrypt.hash(password, 10);

    const marketerData = {
      email,
      password: hashedPassword,
      phone,
      firstName,
      lastName,
      location,
      bio,
      marketerInfo: {
        referralCode: referralCode,
        totalReferrals: 0,
        totalCommission: 0,
      },
      verification: {
        email: {
          token: crypto.randomBytes(32).toString("hex"),
          tokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        phone: {
          code: Math.floor(100000 + Math.random() * 900000).toString(),
          codeExpires: new Date(Date.now() + 15 * 60 * 1000),
        },
      },
    };

    const marketer = await Marketer.create(marketerData);

    // TODO: Send verification email and SMS

    res.status(201).json({
      success: true,
      message:
        "Marketer registered successfully. Please verify your email and phone.",
      marketer: {
        id: marketer._id,
        email: marketer.email,
        firstName: marketer.firstName,
        lastName: marketer.lastName,
        referralCode: marketer.marketerInfo.referralCode,
        status: marketer.status,
      },
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Login marketer
// @route   POST /api/marketers/login
// @access  Public
const loginMarketer = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const marketer = await Marketer.findOne({ email }).select("+password");

    if (!marketer) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (
      !marketer.isActive ||
      marketer.status === "banned" ||
      marketer.status === "suspended"
    ) {
      return res.status(403).json({
        success: false,
        message: `Account is ${marketer.status}. Please contact support.`,
      });
    }

    if (marketer.isLocked) {
      return res.status(423).json({
        success: false,
        message: "Account is temporarily locked",
      });
    }

    const isPasswordCorrect = await marketer.comparePassword(password);

    if (!isPasswordCorrect) {
      marketer.security.loginAttempts += 1;
      if (marketer.security.loginAttempts >= 5) {
        marketer.security.lockUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);
      }
      await marketer.save();

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Reset login attempts and update activity
    marketer.security.loginAttempts = 0;
    marketer.security.lockUntil = undefined;
    marketer.activity.loginCount += 1;
    marketer.activity.lastLogin = new Date();
    marketer.activity.lastActive = new Date();

    await marketer.save();

    const token = jwt.sign(
      { id: marketer._id, userType: "marketer" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      marketer: {
        id: marketer._id,
        email: marketer.email,
        firstName: marketer.firstName,
        lastName: marketer.lastName,
        referralCode: marketer.marketerInfo.referralCode,
        status: marketer.status,
        performance: marketer.marketerInfo.performance,
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

// @desc    Get marketer dashboard
// @route   GET /api/marketers/dashboard
// @access  Marketer only
const getMarketerDashboard = async (req, res) => {
  try {
    console.log("inside dashboard");
    const marketerId = req.user.id;

    const marketer = await Marketer.findById(marketerId);
    if (!marketer) {
      return res.status(404).json({
        success: false,
        message: "Marketer not found",
      });
    }

    // Get referral statistics
    const referralStats = await Seller.aggregate([
      { $match: { referredBy: marketer._id } },
      {
        $lookup: {
          from: "usersubscriptions",
          localField: "currentSubscription",
          foreignField: "_id",
          as: "subscription",
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          subscriptions: { $push: "$subscription" },
        },
      },
    ]);

    // Get recent referrals
    const recentReferrals = await Seller.find({ referredBy: marketerId })
      .sort({ referralDate: -1 })
      .limit(10)
      .select(
        "firstName lastName businessInfo.businessName status referralDate"
      );

    // Get commission statistics
    const commissionStats = await Commission.aggregate([
      { $match: { marketer: marketer._id } },
      {
        $group: {
          _id: "$status",
          totalAmount: { $sum: "$commissionAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get recent commissions
    const recentCommissions = await Commission.find({ marketer: marketerId })
      .populate("referredUser", "firstName lastName businessInfo.businessName")
      .sort({ earnedDate: -1 })
      .limit(10);

    // Calculate this month's performance
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thisMonthStats = await Seller.countDocuments({
      referredBy: marketerId,
      referralDate: { $gte: startOfMonth },
    });

    res.status(200).json({
      success: true,
      performance: marketer.marketerInfo.performance,
      referralStats,
      commissionStats,
      recentReferrals,
      recentCommissions,
      thisMonthReferrals: thisMonthStats,
      referralCode: marketer.marketerInfo.referralCode,
      referralLink: `${process.env.FRONTEND_URL}/register?ref=${marketer.marketerInfo.referralCode}`,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Get marketer profile
// @route   GET /api/marketers/profile
// @access  Marketer only
const getMarketerProfile = async (req, res) => {
  try {
    const marketer = await Marketer.findById(req.user.id);

    if (!marketer) {
      return res.status(404).json({
        success: false,
        message: "Marketer not found",
      });
    }

    res.status(200).json({
      success: true,
      marketer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// @desc    Update marketer profile
// @route   PUT /api/marketers/profile
// @access  Marketer only
const updateMarketerProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      bio,
      location,
      paymentInfo,
      communication,
      marketerId,
    } = req.body;

    const marketer = await Marketer.findById(marketerId).exec();

    if (!marketer) {
      return res.status(404).json({
        success: false,
        message: "Marketer not found",
      });
    }

    // Update fields
    if (firstName) marketer.firstName = firstName;
    if (lastName) marketer.lastName = lastName;
    if (bio) marketer.bio = bio;
    if (location) marketer.location = { ...marketer.location, ...location };
    if (paymentInfo)
      marketer.paymentInfo = { ...marketer.paymentInfo, ...paymentInfo };
    if (communication)
      marketer.communication = { ...marketer.communication, ...communication };

    await marketer.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      marketer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Get commission history
// @route   GET /api/marketers/commissions
// @access  Marketer only
const getCommissionHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const marketerId = req.user.id;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let filter = { marketer: marketerId };
    if (status) {
      filter.status = status;
    }

    const commissions = await Commission.find(filter)
      .populate("referredUser", "firstName lastName businessInfo.businessName")
      .populate("subscription", "plan billing")
      .sort({ earnedDate: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalCommissions = await Commission.countDocuments(filter);

    // Get summary stats
    const summary = await Commission.aggregate([
      { $match: { marketer: mongoose.Types.ObjectId(marketerId) } },
      {
        $group: {
          _id: "$status",
          totalAmount: { $sum: "$commissionAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      count: commissions.length,
      totalCommissions,
      commissions,
      summary,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCommissions / limitNum),
        hasNext: pageNum < Math.ceil(totalCommissions / limitNum),
        hasPrev: pageNum > 1,
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

// @desc    Get marketer by ID
// @route   GET /api/marketers/marketer-details/:marketerId
// @access  Authenticated users
const getMarketerById = async (req, res) => {
  try {
    const marketerId = req.params.marketerId;
    if (!marketerId) {
      return res.status(400).json({
        success: false,
        message: "Marketer ID is required",
      });
    }
    const marketer = await Marketer.findById(marketerId);
    if (!marketer) {
      return res.status(404).json({
        success: false,
        message: "Marketer not found",
      });
    }
    res.status(200).json({
      success: true,
      marketer,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const getAllMarketers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      role,
      county,
      isActive,
      verified,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      fields,
    } = req.query;

    // Build filter object
    const filter = {};

    // Status filter
    if (status) {
      filter.status = status;
    }

    // Role filter
    if (role) {
      filter.role = role;
    }

    // County filter
    if (county) {
      filter["location.county"] = new RegExp(county, "i");
    }

    // Active status filter
    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    // Email verification filter
    if (verified !== undefined) {
      filter["verification.email.verified"] = verified === "true";
    }

    // Search functionality
    if (search) {
      const searchRegex = new RegExp(search, "i");
      filter.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { "marketerInfo.referralCode": searchRegex },
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Sort options
    const sortOptions = {};
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "firstName",
      "lastName",
      "email",
      "status",
      "marketerInfo.performance.totalReferrals",
      "marketerInfo.performance.totalCommissionsEarned",
      "activity.lastLogin",
    ];

    if (validSortFields.includes(sortBy)) {
      sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;
    } else {
      sortOptions.createdAt = -1;
    }

    // Field selection (exclude sensitive fields by default)
    let selectFields =
      fields ||
      "-password -nationalId -verification.email.token -verification.phone.code -security";

    // Build query
    const query = Marketer.find(filter)
      .select(selectFields)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .populate("assignedManager", "firstName lastName email");

    // Execute query
    const marketers = await query.exec();

    // Get total count for pagination
    const totalCount = await Marketer.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNum);

    // Calculate statistics
    const stats = await Marketer.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalMarketers: { $sum: 1 },
          activeMarketers: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
          pendingMarketers: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          verifiedMarketers: {
            $sum: {
              $cond: [{ $eq: ["$verification.email.verified", true] }, 1, 0],
            },
          },
          totalReferrals: { $sum: "$marketerInfo.performance.totalReferrals" },
          totalCommissions: {
            $sum: "$marketerInfo.performance.totalCommissionsEarned",
          },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      message: "Marketers retrieved successfully",
      data: {
        marketers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          limit: limitNum,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
        statistics: stats[0] || {
          totalMarketers: 0,
          activeMarketers: 0,
          pendingMarketers: 0,
          verifiedMarketers: 0,
          totalReferrals: 0,
          totalCommissions: 0,
        },
        filters: {
          status,
          role,
          county,
          isActive,
          verified,
          search,
          sortBy,
          sortOrder,
        },
      },
    });
  } catch (error) {
    console.error("Get all marketers error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
const updateMarketerStatus = async (req, res) => {
  try {
    const { marketerId } = req.params;
    const { status } = req.body;

    // Validation
    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    // Validate status value
    const validStatuses = ["pending", "active", "suspended", "banned"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Find marketer
    const marketer = await Marketer.findById(marketerId).exec();
    if (!marketer) {
      return res.status(404).json({
        success: false,
        message: "Marketer not found",
      });
    }

    // Store previous status for logging
    const previousStatus = marketer.status;

    // Update status
    marketer.status = status;

    // If suspending, set isActive to false
    if (status === "suspended" || status === "banned") {
      marketer.isActive = false;
    }

    // If activating, set isActive to true
    if (status === "active") {
      marketer.isActive = true;
    }

    // Save changes
    await marketer.save();

    res.status(200).json({
      success: true,
      message: `Marketer status updated from ${previousStatus} to ${status}`,
    });
  } catch (error) {
    console.error("Update marketer status error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

module.exports = {
  registerMarketer,
  loginMarketer,
  getMarketerDashboard,
  getMarketerProfile,
  updateMarketerProfile,
  getCommissionHistory,
  getMarketerById,
  getAllMarketers,
  updateMarketerStatus,
};
