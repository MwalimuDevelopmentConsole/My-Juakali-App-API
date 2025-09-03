const SubscriptionPlan = require("../models/SubscriptionPlan");
const UserSubscription = require("../models/SellerSubscription");
const Seller = require("../models/Seller");
const { generateTokens } = require("./authController");
const Marketer = require("../models/Marketer");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Product = require("../models/Product");

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
        delete location.coordinates;
      }
    }

    const hashPassword = await bcrypt.hash(password, 10);

    const sellerData = {
      email,
      password: hashPassword,
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
    console.log(error);
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
      .populate("subscriptionHistory")
      .select("-password");

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
    const { documentType, sellerId } = req.body; // 'identity' or 'business'

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No documents uploaded",
      });
    }

    if (!sellerId) {
      return res.status(400).json({
        success: false,
        message: "Seller ID is required",
      });
    }

    if (!["identity", "business"].includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Must be "identity" or "business"',
      });
    }

    const sellerIdToUse =
      req.user.role.toLowerCase() === "admin" ? sellerId : req.user.id;

    const seller = await Seller.findById(sellerIdToUse);

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    const uploadedDocuments = [];

    for (const [index, file] of req.files.entries()) {
      uploadedDocuments.push({
        type: req.body.documentTypes[index],
        url: `${process.env.API_DOMAIN}/${file.path}`,
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

const uploadProfileAvatar = async (req, res) => {
  try {
    const { sellerId } = req.body;
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No photo uploaded",
      });
    }

    if (!sellerId) {
      return res.status(400).json({
        success: false,
        message: "Seller ID is required",
      });
    }

    const seller = await Seller.findById(sellerId);

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    seller.avatar = {
      alt: "profile photo",
      url: `${process.env.API_DOMAIN}/${req.file.path}`,
    };

    await seller.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
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

const getSellerOverview = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const seller = await Seller.findById(sellerId)
      .select(
        `
        firstName 
        lastName 
        avatar 
        bio 
        businessInfo.businessName 
        businessInfo.businessType 
        businessInfo.specialties 
        businessInfo.yearsOfExperience 
        businessInfo.employees 
        businessInfo.workingHours
        location.county 
        location.subcounty 
        location.ward 
        location.landmark
        verification.email.verified 
        verification.phone.verified 
        verification.identity.verified 
        verification.business.verified
        ratings.average 
        ratings.count 
        ratings.breakdown
        activity.profileViews 
        activity.totalProducts 
        activity.activeProducts
        isActive 
        status 
        portfolio
        socialLinks
        preferences.privacy
        phone
        createdAt
      `
      )
      .populate({
        path: "currentSubscription",
        select: "plan status",
        populate: {
          path: "plan",
          select: "name planType features badge",
        },
      });

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Check if seller is active and not banned
    if (
      !seller.isActive ||
      seller.status === "banned" ||
      seller.status === "suspended"
    ) {
      return res.status(404).json({
        success: false,
        message: "Seller profile not available",
      });
    }

    // Increment profile views count
    await Seller.findByIdAndUpdate(
      sellerId,
      { $inc: { "activity.profileViews": 1 } },
      { new: false } // We don't need the updated document returned
    );

    // Create response object respecting privacy settings
    const sellerOverview = {
      _id: seller._id,
      firstName: seller.firstName,
      lastName: seller.lastName,
      fullName: seller.fullName, // Virtual field
      avatar: seller.avatar,
      bio: seller.bio,

      // Business Information
      businessInfo: {
        businessName: seller.businessInfo.businessName,
        businessType: seller.businessInfo.businessType,
        specialties: seller.businessInfo.specialties,
        yearsOfExperience: seller.businessInfo.yearsOfExperience,
        employees: seller.businessInfo.employees,
        // Only show working hours if privacy allows
        workingHours:
          seller.preferences?.privacy?.showBusinessHours !== false
            ? seller.businessInfo.workingHours
            : null,
      },

      // Location (respect privacy settings)
      location:
        seller.preferences?.privacy?.showLocation !== false
          ? {
              county: seller.location.county,
              subcounty: seller.location.subcounty,
              ward: seller.location.ward,
              landmark: seller.location.landmark,
            }
          : {
              county: seller.location.county, // Always show county for basic location context
              subcounty: seller.location.subcounty, // Show subcounty for general area
            },

      // Phone (respect privacy settings)
      phone:
        seller.preferences?.privacy?.showPhone !== false ? seller.phone : null,

      // Verification & Trust
      verification: {
        email: seller.verification.email.verified,
        phone: seller.verification.phone.verified,
        identity: seller.verification.identity.verified,
        business: seller.verification.business.verified,
      },
      verificationScore: seller.verificationScore, // Virtual field

      // Ratings & Reviews
      ratings: {
        average: seller.ratings.average,
        count: seller.ratings.count,
        breakdown: seller.ratings.breakdown,
      },

      // Public Activity Stats (increment the displayed count to reflect the new view)
      stats: {
        profileViews: seller.activity.profileViews + 1, // Show incremented count
        totalProducts: seller.activity.totalProducts,
        activeProducts: seller.activity.activeProducts,
        memberSince: seller.createdAt,
      },

      // Status
      isActive: seller.isActive,
      status: seller.status,
      isLocked: seller.isLocked, // Virtual field

      // Portfolio (only featured or limit to recent)
      portfolio:
        seller.portfolio?.filter((item) => item.featured) ||
        seller.portfolio?.slice(0, 6) ||
        [], // Show featured or first 6

      // Social Links
      socialLinks: seller.socialLinks,

      // Subscription (for badge display)
      subscription: seller.currentSubscription
        ? {
            plan: seller.currentSubscription.plan,
            status: seller.currentSubscription.status,
          }
        : null,

      // Allow direct contact (for showing contact buttons)
      allowDirectContact:
        seller.preferences?.privacy?.allowDirectContact !== false,
    };

    res.status(200).json({
      success: true,
      seller: sellerOverview,
    });
  } catch (error) {
    console.error("Error fetching seller overview:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

const removeVerificationDocument = async (req, res) => {
  try {
    const { sellerId, documentType, documentId } = req.body;

    if (!["identity", "business"].includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Must be "identity" or "business"',
      });
    }

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Find the document
    const docIndex = seller.verification[documentType].documents.findIndex(
      (doc) => doc._id.toString() === documentId
    );

    if (docIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const [removedDoc] = seller.verification[documentType].documents.splice(
      docIndex,
      1
    );

    await seller.save();

    res.status(200).json({
      success: true,
      message: "Document removed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

const updateDocumentStatus = async (req, res) => {
  try {
    const { sellerId, documentType, documentId, status, rejectionReason } =
      req.body;

    if (!["identity", "business"].includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Must be "identity" or "business"',
      });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "approved" or "rejected"',
      });
    }

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    const document = seller.verification[documentType].documents.find(
      (doc) => doc._id.toString() === documentId
    );

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    document.status = status;
    if (status === "approved") {
      document.verifiedAt = new Date();
      document.verifiedBy = req.user.id; // Admin ID from auth middleware
      seller.verification[documentType].verified = true;
    } else if (status === "rejected") {
      document.rejectionReason = rejectionReason || "No reason provided";
    }

    await seller.save();

    res.status(200).json({
      success: true,
      message: `Document ${status} successfully`,
      document,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

const updateSellerStatus = async (req, res) => {
  try {
    const { sellerId, status } = req.body;

    if (!["active", "inactive", "suspended", "banned"].includes(status)) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid status. Must be one of "active", "inactive", "suspended", or "banned"',
      });
    }

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    seller.status = status;
    if (status === "active") {
      seller.isActive = true;
    } else {
      seller.isActive = false;
    }

    await seller.save();
    await Product.updateMany(
      {
        seller: seller._id,
      },
      {
        status: status === "active" ? "active" : "suspended",
      }
    );

    res.status(200).json({
      success: true,
      message: `Seller status updated to ${status}`,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const manageSellerCapabilities = async (req, res) => {
  try {
    const { sellerId, capabilities } = req.body;

    const validCapabilities = [
      "customOrders",
      "bulkOrders",
      "canDeliver",
      "freeEstimates",
      "onSiteServices",
    ];

    // Validate capabilities
    for (const key of Object.keys(capabilities)) {
      if (!validCapabilities.includes(key)) {
        return res.status(400).json({
          success: false,
          message: `Invalid capability: ${key}`,
        });
      }
    }

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Update capabilities
    seller.capabilities = {
      ...seller.capabilities,
      ...capabilities,
    };

    await seller.save();

    res.status(200).json({
      success: true,
      message: "Seller capabilities updated successfully",
      capabilities: seller.capabilities,
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
  getSellerOverview,
  removeVerificationDocument,
  updateDocumentStatus,
  updateSellerStatus,
  uploadProfileAvatar,
  manageSellerCapabilities
};
