const SubscriptionPlan = require("../models/SubscriptionPlan");
const UserSubscription = require("../models/SellerSubscription");
const Seller = require("../models/Seller");
const { generateTokens } = require("./authController");
const Marketer = require("../models/Marketer");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Product = require("../models/Product");
const { default: mongoose } = require("mongoose");
const Buyer = require("../models/Buyer");

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
      onboardedByAgent,
    } = req.body;

    // Validation - email is optional
    if (
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
          "Required fields: password, phone, name, business name, specialties, and county",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const formattedEmail =
      email && typeof email === "string" && email.trim()
        ? email.toLowerCase().trim()
        : undefined;

    // Check if seller already exists
    const checkDuplicate = async (models, field, value) => {
      if (!value) return null;
      const results = await Promise.all(
        models.map((model) => model.findOne({ [field]: value }).lean())
      );

      return results.find((item) => item !== null) || null;
    };

    const models = [Buyer, Seller, Marketer];

    let emailExists = null;
    if (formattedEmail) {
      emailExists = await checkDuplicate(models, "email", formattedEmail);
    }
    const phoneExists = await checkDuplicate(models, "phone", phone);

    if (formattedEmail && emailExists) {
      return res.status(409).json({ message: "Email already registered" });
    }

    if (phoneExists) {
      return res
        .status(409)
        .json({ message: "Phone number already registered" });
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
      email: formattedEmail,
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
          verified: false,
        },
        phone: {
          code: phoneVerificationCode,
          codeExpires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
          verified: false,
        },
      },
      referredBy,
      referralDate: referredBy ? new Date() : undefined,
      status: "active",
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

    // If onboarded by an agent, do NOT overwrite the agent's authentication cookie or log in as seller
    if (onboardedByAgent) {
      return res.status(201).json({
        success: true,
        message: `Seller account for ${seller.firstName} ${seller.lastName} created successfully.`,
        seller: {
          id: seller._id,
          email: seller.email,
          firstName: seller.firstName,
          lastName: seller.lastName,
          phone: seller.phone,
          businessName: seller.businessInfo.businessName,
          status: seller.status,
          verificationScore: seller.verificationScore,
        },
      });
    }

    // Generate tokens for self-registration
    const { accessToken, refreshToken } = generateTokens(seller, "seller");

    // Set refresh token in httpOnly cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true, // Use secure cookies in production
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

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
      email,
      phone,
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

    const checkDuplicate = async (models, field, value) => {
      if (!value) return null;
      const results = await Promise.all(
        models.map((model) => model.findOne({ [field]: value, _id: { $ne: seller._id } }).lean())
      );
      return results.find((item) => item !== null) || null;
    };

    const models = [Buyer, Seller, Marketer];

    // Handle email update (optional)
    if (email !== undefined) {
      const formattedEmail =
        email && typeof email === "string" && email.trim()
          ? email.toLowerCase().trim()
          : undefined;

      if (formattedEmail && formattedEmail !== seller.email) {
        const emailExists = await checkDuplicate(models, "email", formattedEmail);
        if (emailExists) {
          return res.status(409).json({ success: false, message: "Email already registered" });
        }
        seller.email = formattedEmail;
      } else if (!formattedEmail) {
        seller.email = undefined;
      }
    }

    // Handle phone update
    if (phone && phone !== seller.phone) {
      const phoneExists = await checkDuplicate(models, "phone", phone);
      if (phoneExists) {
        return res.status(409).json({ success: false, message: "Phone number already registered" });
      }
      seller.phone = phone;
    }

    // Update fields
    if (firstName) seller.firstName = firstName;
    if (lastName) seller.lastName = lastName;
    if (bio !== undefined) seller.bio = bio;
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

// @desc    Admin manually verify or unverify seller email or phone
// @route   PATCH /api/sellers/admin/verify-contact
// @access  Admin only
const adminVerifySellerContact = async (req, res) => {
  try {
    const { sellerId, type, verified } = req.body; // type: 'email' | 'phone'
    if (!sellerId || !["email", "phone"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "sellerId and valid type ('email' or 'phone') are required",
      });
    }

    const seller = await Seller.findById(sellerId);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    if (!seller.verification) {
      seller.verification = {};
    }
    if (!seller.verification[type]) {
      seller.verification[type] = {};
    }

    const isVerified = verified !== undefined ? Boolean(verified) : true;
    seller.verification[type].verified = isVerified;
    if (isVerified) {
      seller.verification[type].verifiedAt = new Date();
    } else {
      seller.verification[type].verifiedAt = null;
    }

    // Recalculate verification score
    // email: 20%, phone: 20%, identity: 30%, business: 30%
    let score = 0;
    if (seller.verification.email?.verified) score += 20;
    if (seller.verification.phone?.verified) score += 20;
    if (
      seller.verification.identity?.status === "verified" ||
      seller.verification.identity?.documents?.some((d) => d.status === "approved")
    ) {
      score += 30;
    }
    if (
      seller.verification.business?.status === "verified" ||
      seller.verification.business?.documents?.some((d) => d.status === "approved")
    ) {
      score += 30;
    }
    seller.verificationScore = Math.min(score, 100);

    await seller.save();

    res.status(200).json({
      success: true,
      message: `${type === "email" ? "Email" : "Phone"} verification status updated successfully`,
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

const getSellerOverviewByAdmin = async (req, res) => {
  try {
    const { sellerId } = req.params;

    const sellerDoc = await Seller.findById(sellerId)
      .select(
        `
      -password
      -emailVerificationToken
      `
      )
      .populate({
        path: "currentSubscription",
        select: "plan status",
        populate: {
          path: "plan",
          select: "name planType features badge",
        },
      })
      // .lean({virtuals: true})
      .exec();

    if (!sellerDoc) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    const seller = sellerDoc.toObject({ virtuals: true });

    const activeProductsCount = await Product.countDocuments({
      seller: seller._id,
      status: "active",
    });

    seller.stats = {
      profileViews: seller.activity.profileViews, // Show incremented count
      totalProducts: seller.activity.totalProducts,
      activeProducts: activeProductsCount,
      memberSince: seller.createdAt,
    };

    res.status(200).json({
      success: true,
      seller,
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
    const { sellerId, documentType, documents } = req.body;

    // Validate required fields
    if (!sellerId) {
      return res.status(400).json({
        success: false,
        message: "Seller ID is required",
      });
    }

    if (!documentType || !["identity", "business"].includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Must be "identity" or "business"',
      });
    }

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Documents array is required and cannot be empty",
      });
    }

    // Validate each document in the array
    for (const doc of documents) {
      if (!doc.documentId || !doc.status) {
        return res.status(400).json({
          success: false,
          message: "Each document must have documentId and status",
        });
      }

      if (!["approved", "rejected", "pending"].includes(doc.status)) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid status. Must be "approved", "rejected", or "pending"',
        });
      }

      if (doc.status === "rejected" && !doc.rejectionReason?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Rejection reason is required for rejected documents",
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

    const updatedDocuments = [];
    const notFoundDocuments = [];

    // Update each document
    for (const docUpdate of documents) {
      const document = seller.verification[documentType].documents.find(
        (doc) => doc._id.toString() === docUpdate.documentId
      );

      if (!document) {
        notFoundDocuments.push(docUpdate.documentId);
        continue;
      }

      // Update document status
      document.status = docUpdate.status;

      if (docUpdate.status === "approved") {
        document.verifiedAt = new Date();
        document.verifiedBy = req.user.id; // Admin ID from auth middleware
        // Clear any previous rejection reason
        document.rejectionReason = undefined;
      } else if (docUpdate.status === "rejected") {
        document.rejectionReason = docUpdate.rejectionReason.trim();
        // Clear verification fields
        document.verifiedAt = undefined;
        document.verifiedBy = undefined;
      } else if (docUpdate.status === "pending") {
        // Clear both approval and rejection fields
        document.verifiedAt = undefined;
        document.verifiedBy = undefined;
        document.rejectionReason = undefined;
      }

      updatedDocuments.push({
        documentId: document._id,
        type: document.type,
        status: document.status,
        rejectionReason: document.rejectionReason,
      });
    }

    // Check if there were any documents not found
    if (notFoundDocuments.length > 0) {
      return res.status(404).json({
        success: false,
        message: `Documents not found: ${notFoundDocuments.join(", ")}`,
      });
    }

    // Check if ALL documents of this type are now approved
    const allDocuments = seller.verification[documentType].documents;
    const allApproved = allDocuments.every((doc) => doc.status === "approved");

    // Update verification status based on all documents
    seller.verification[documentType].verified = allApproved;

    // If not all approved, also clear the verification timestamp
    if (!allApproved) {
      seller.verification[documentType].verifiedAt = undefined;
    } else {
      seller.verification[documentType].verifiedAt = new Date();
    }

    await seller.save();

    res.status(200).json({
      success: true,
      message: `${updatedDocuments.length} document(s) updated successfully`,
      data: {
        updatedDocuments,
        verificationStatus: {
          [documentType]: {
            verified: seller.verification[documentType].verified,
            verifiedAt: seller.verification[documentType].verifiedAt,
          },
        },
      },
    });
  } catch (error) {
    console.error("Error updating document status:", error);
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

const getSellersByAgentId = async (req, res) => {
  try {
    const { page = 1, limit = 10, agentId, status } = req.query;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        message: "Marketer Id is required",
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let filter = {
      referredBy: new mongoose.Types.ObjectId(agentId), // Fixed: mongoose.Types.ObjectId
    };

    if (status) {
      filter.status = status;
    }
    console.log(filter);

    const sellers = await Seller.find(filter)
      .select("businessInfo firstName lastName avatar email status") // Added status to selection
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalSellers = await Seller.countDocuments(filter);
    const totalPages = Math.ceil(totalSellers / limitNum);

    res.status(200).json({
      success: true,
      count: totalSellers,
      sellers,
      pagination: {
        currentPage: pageNum,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching sellers by agent:", error);
  }
};

const getAllSellers = async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search = "",
    status,
    sortBy,
    sortOrder,
    marketerId,
  } = req.query;

  const query = {};
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { "businessInfo.businessName": { $regex: search, $options: "i" } },
    ];
  }
  if (status) {
    query.status = status;
  }

  const sortOptions = {};
  if (sortBy) {
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
  } else {
    sortOptions.createdAt = -1; // Default sort by newest
  }
  if (marketerId) {
    query.referredBy = mongoose.Types.ObjectId(marketerId);
  }

  try {
    const sellers = await Seller.find(query)
      .select(
        "firstName lastName email phone businessInfo.businessName status isActive verificationScore createdAt"
      )
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalSellers = await Seller.countDocuments(query);

    res.status(200).json({
      success: true,
      page: parseInt(page),
      totalPages: Math.ceil(totalSellers / limit),
      totalSellers,
      sellers,
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
  adminVerifySellerContact,
  uploadVerificationDocuments,
  getSellerDashboard,
  getSellerOverview,
  removeVerificationDocument,
  updateDocumentStatus,
  updateSellerStatus,
  uploadProfileAvatar,
  manageSellerCapabilities,
  getSellersByAgentId,
  getAllSellers,
  getSellerOverviewByAdmin,
};
