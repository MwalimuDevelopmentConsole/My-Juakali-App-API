const SubscriptionPlan = require("../models/SubscriptionPlan");
const UserSubscription = require("../models/SellerSubscription");
const Seller = require("../models/Seller");
const { generateTokens } = require("./authController");
const Marketer = require("../models/Marketer");
const crypto = require("crypto");

// @desc    Register new seller
// @route   POST /api/sellers/register
// @access  Public
const registerSeller = async (req, res) => {
  try {
    const {
      email,
      password,
      phone,
      firstName,
      lastName,
      businessInfo,
      location,
      referralCode,
    } = req.body;

    // Validation
    if (
      !email ||
      !password ||
      !phone ||
      !firstName ||
      !lastName ||
      !businessInfo?.businessName ||
      !businessInfo?.specialties ||
      !location?.county
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields: email, password, phone, name, business name, specialties, and county",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // Check if seller already exists
    const existingSeller = await Seller.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingSeller) {
      return res.status(400).json({
        success: false,
        message: "Seller with this email or phone already exists",
      });
    }

    // Check referral code if provided
    let referredBy = null;
    if (referralCode) {
      const marketer = await Marketer.findOne({
        "marketerInfo.referralCode": referralCode.toUpperCase(),
        status: "active",
      });

      if (marketer) {
        referredBy = marketer._id;
      }
    }

    // Generate verification tokens
    const emailVerificationToken = crypto.randomBytes(32).toString("hex");
    const phoneVerificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    // Optional location coordinates validation
    if (
      location?.coordinates?.coordinates &&
      Array.isArray(location.coordinates.coordinates) &&
      location.coordinates.coordinates.length === 2 &&
      typeof location.coordinates.coordinates[0] === "number" &&
      typeof location.coordinates.coordinates[1] === "number"
    ) {
      // Valid coordinates — do nothing
    } else {
      // Invalid or missing — remove coordinates field to avoid MongoDB errors
      if (location?.coordinates) {
        delete location.coordinates.coordinates;
        delete location.coordinates.type;
      }
    }

    const sellerData = {
      email,
      password,
      phone,
      firstName,
      lastName,
      businessInfo: {
        ...businessInfo,
        specialties: Array.isArray(businessInfo.specialties)
          ? businessInfo.specialties
          : businessInfo.specialties.split(",").map((s) => s.trim()),
      },
      location,
      verification: {
        email: {
          token: emailVerificationToken,
          tokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        phone: {
          code: phoneVerificationCode,
          codeExpires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        },
      },
      referredBy,
      referralDate: referredBy ? new Date() : undefined,
    };

    const seller = await Seller.create(sellerData);

    // Create free subscription for new seller
    const freePlan = await SubscriptionPlan.findOne({
      planType: "free",
      status: "active",
    });
    if (freePlan) {
      const subscription = await UserSubscription.create({
        user: seller._id,
        userType: "Seller",
        plan: freePlan._id,
        billing: {
          amount: 0,
          cycle: "monthly",
        },
        subscribedFeatures: freePlan.features,
        referredBy,
      });

      seller.currentSubscription = subscription._id;
      await seller.save();
    }

    // Update marketer referral count
    if (referredBy) {
      await Marketer.findByIdAndUpdate(referredBy, {
        $inc: {
          "marketerInfo.performance.totalReferrals": 1,
          "marketerInfo.performance.activeReferrals": 1,
        },
        $set: { "activity.lastReferralDate": new Date() },
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(seller, "seller");

    // Set refresh token in httpOnly cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true, // Use secure cookies in production
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // TODO: Send verification email and SMS
    // await sendVerificationEmail(seller.email, emailVerificationToken);
    // await sendVerificationSMS(seller.phone, phoneVerificationCode);

    res.status(201).json({
      success: true,
      message:
        "Seller registered successfully. Please verify your email and phone number.",
      accessToken,
      seller: {
        id: seller._id,
        email: seller.email,
        firstName: seller.firstName,
        lastName: seller.lastName,
        businessName: seller.businessInfo.businessName,
        status: seller.status,
        verificationScore: seller.verificationScore,
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

// @desc    Get seller profile
// @route   GET /api/sellers/profile
// @access  Seller only
const getSellerProfile = async (req, res) => {
  try {
    const seller = await Seller.findById(req.user.id)
      .populate({
        path: "currentSubscription",
        populate: {
          path: "plan",
          select: "name planType features",
        },
      })
      .populate("subscriptionHistory");

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    res.status(200).json({
      success: true,
      seller,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Update seller profile
// @route   PUT /api/sellers/profile
// @access  Seller only
const updateSellerProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      bio,
      businessInfo,
      location,
      socialLinks,
      preferences,
    } = req.body;

    const seller = await Seller.findById(req.user.id);

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Handle avatar upload
    if (req.file) {
      // Delete old avatar
      if (seller.avatar && seller.avatar.publicId) {
        await cloudinary.uploader.destroy(seller.avatar.publicId);
      }

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "myjuakali/sellers/avatars",
        transformation: [
          { width: 300, height: 300, crop: "fill" },
          { quality: "auto:good" },
        ],
      });

      seller.avatar = {
        url: result.secure_url,
        publicId: result.public_id,
        alt: `${firstName || seller.firstName} ${lastName || seller.lastName}`,
      };
    }

    // Update fields
    if (firstName) seller.firstName = firstName;
    if (lastName) seller.lastName = lastName;
    if (bio) seller.bio = bio;
    if (businessInfo) {
      seller.businessInfo = { ...seller.businessInfo, ...businessInfo };
      if (businessInfo.specialties) {
        seller.businessInfo.specialties = Array.isArray(
          businessInfo.specialties
        )
          ? businessInfo.specialties
          : businessInfo.specialties.split(",").map((s) => s.trim());
      }
    }
    if (location) seller.location = { ...seller.location, ...location };
    if (socialLinks)
      seller.socialLinks = { ...seller.socialLinks, ...socialLinks };
    if (preferences)
      seller.preferences = { ...seller.preferences, ...preferences };

    await seller.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      seller,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Upload verification documents
// @route   POST /api/sellers/upload-documents
// @access  Seller only
const uploadVerificationDocuments = async (req, res) => {
  try {
    const { documentType } = req.body; // 'identity' or 'business'

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No documents uploaded",
      });
    }

    if (!["identity", "business"].includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Must be "identity" or "business"',
      });
    }

    const seller = await Seller.findById(req.user.id);

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    const uploadedDocuments = [];

    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: `myjuakali/sellers/documents/${documentType}`,
        resource_type: "auto",
      });

      uploadedDocuments.push({
        type: file.fieldname, // national_id, passport, business_permit, etc.
        url: result.secure_url,
        publicId: result.public_id,
        status: "pending",
      });
    }

    // Add documents to appropriate verification section
    if (documentType === "identity") {
      seller.verification.identity.documents.push(...uploadedDocuments);
    } else {
      seller.verification.business.documents.push(...uploadedDocuments);
    }

    await seller.save();

    res.status(200).json({
      success: true,
      message: "Documents uploaded successfully and are pending verification",
      documents: uploadedDocuments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Get seller dashboard stats
// @route   GET /api/sellers/dashboard
// @access  Seller only
const getSellerDashboard = async (req, res) => {
  try {
    const sellerId = req.user.id;

    // Get seller with subscription
    const seller = await Seller.findById(sellerId).populate({
      path: "currentSubscription",
      populate: {
        path: "plan",
        select: "name planType features",
      },
    });

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Get product statistics
    const productStats = await Product.aggregate([
      { $match: { seller: seller._id } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalViews: { $sum: "$stats.views" },
          totalInquiries: { $sum: "$stats.inquiries" },
        },
      },
    ]);

    // Get recent products
    const recentProducts = await Product.find({ seller: sellerId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("title status createdAt stats pricing");

    // Calculate totals
    const stats = {
      totalProducts: seller.activity.totalProducts,
      activeProducts: seller.activity.activeProducts,
      totalViews: productStats.reduce((sum, stat) => sum + stat.totalViews, 0),
      totalInquiries: productStats.reduce(
        (sum, stat) => sum + stat.totalInquiries,
        0
      ),
      verificationScore: seller.verificationScore,
      subscription: seller.currentSubscription,
    };

    // Group product stats by status
    const productsByStatus = {};
    productStats.forEach((stat) => {
      productsByStatus[stat._id] = stat.count;
    });

    res.status(200).json({
      success: true,
      stats,
      productsByStatus,
      recentProducts,
      subscription: seller.currentSubscription,
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
  registerSeller,
  getSellerProfile,
  updateSellerProfile,
  uploadVerificationDocuments,
  getSellerDashboard,
};
