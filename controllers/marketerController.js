const Marketer = require("../models/Marketer");
const Seller = require("../models/Seller");
const Commission = require("../models/Commission");

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

    // Check if marketer already exists
    const existingMarketer = await Marketer.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingMarketer) {
      return res.status(400).json({
        success: false,
        message: "Marketer with this email or phone already exists",
      });
    }

    const marketerData = {
      email,
      password,
      phone,
      firstName,
      lastName,
      location,
      bio,
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

    // Generate JWT token
    const token = jwt.sign(
      { id: marketer._id, userType: "marketer" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    // TODO: Send verification email and SMS

    res.status(201).json({
      success: true,
      message:
        "Marketer registered successfully. Please verify your email and phone.",
      token,
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
    console.log("inside dashboard")
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
    console.log(error)
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
    const { firstName, lastName, bio, location, paymentInfo, communication } =
      req.body;

    const marketer = await Marketer.findById(req.user.id);

    if (!marketer) {
      return res.status(404).json({
        success: false,
        message: "Marketer not found",
      });
    }

    // Handle avatar upload
    if (req.file) {
      if (marketer.avatar && marketer.avatar.publicId) {
        await cloudinary.uploader.destroy(marketer.avatar.publicId);
      }

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "myjuakali/marketers/avatars",
        transformation: [
          { width: 300, height: 300, crop: "fill" },
          { quality: "auto:good" },
        ],
      });

      marketer.avatar = {
        url: result.secure_url,
        publicId: result.public_id,
        alt: `${firstName || marketer.firstName} ${
          lastName || marketer.lastName
        }`,
      };
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

module.exports = {
  registerMarketer,
  loginMarketer,
  getMarketerDashboard,
  getMarketerProfile,
  updateMarketerProfile,
  getCommissionHistory,
  getMarketerById,
};
