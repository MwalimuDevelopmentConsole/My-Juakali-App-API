const SubscriptionPlan = require("../models/SubscriptionPlan")
const UserSubscription = require("../models/UserSubscription")
const Seller = require("../models/Seller")


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
      referralCode
    } = req.body;
    
    // Validation
    if (!email || !password || !phone || !firstName || !lastName || !businessInfo?.businessName || !businessInfo?.specialties || !location?.county) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: email, password, phone, name, business name, specialties, and county'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }
    
    // Check if seller already exists
    const existingSeller = await Seller.findOne({ 
      $or: [{ email }, { phone }] 
    });
    
    if (existingSeller) {
      return res.status(400).json({
        success: false,
        message: 'Seller with this email or phone already exists'
      });
    }
    
    // Check referral code if provided
    let referredBy = null;
    if (referralCode) {
      const marketer = await Marketer.findOne({ 
        'marketerInfo.referralCode': referralCode.toUpperCase(),
        status: 'active'
      });
      
      if (marketer) {
        referredBy = marketer._id;
      }
    }
    
    // Generate verification tokens
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const phoneVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
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
          : businessInfo.specialties.split(',').map(s => s.trim())
      },
      location,
      verification: {
        email: {
          token: emailVerificationToken,
          tokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        phone: {
          code: phoneVerificationCode,
          codeExpires: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
        }
      },
      referredBy,
      referralDate: referredBy ? new Date() : undefined
    };
    
    const seller = await Seller.create(sellerData);
    
    // Create free subscription for new seller
    const freePlan = await SubscriptionPlan.findOne({ planType: 'free', status: 'active' });
    if (freePlan) {
      const subscription = await UserSubscription.create({
        user: seller._id,
        userType: 'Seller',
        plan: freePlan._id,
        billing: {
          amount: 0,
          cycle: 'monthly'
        },
        subscribedFeatures: freePlan.features,
        referredBy
      });
      
      seller.currentSubscription = subscription._id;
      await seller.save();
    }
    
    // Update marketer referral count
    if (referredBy) {
      await Marketer.findByIdAndUpdate(referredBy, {
        $inc: { 
          'marketerInfo.performance.totalReferrals': 1,
          'marketerInfo.performance.activeReferrals': 1
        },
        $set: { 'activity.lastReferralDate': new Date() }
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: seller._id, userType: 'seller' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    // TODO: Send verification email and SMS
    // await sendVerificationEmail(seller.email, emailVerificationToken);
    // await sendVerificationSMS(seller.phone, phoneVerificationCode);
    
    res.status(201).json({
      success: true,
      message: 'Seller registered successfully. Please verify your email and phone number.',
      token,
      seller: {
        id: seller._id,
        email: seller.email,
        firstName: seller.firstName,
        lastName: seller.lastName,
        businessName: seller.businessInfo.businessName,
        status: seller.status,
        verificationScore: seller.verificationScore
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Login seller
// @route   POST /api/sellers/login
// @access  Public
const loginSeller = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // Find seller and include password
    const seller = await Seller.findOne({ email })
      .select('+password')
      .populate({
        path: 'currentSubscription',
        populate: {
          path: 'plan',
          select: 'name planType features'
        }
      });
    
    if (!seller) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if account is locked
    if (seller.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked. Please try again later.'
      });
    }
    
    // Check if account is active
    if (!seller.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }
    
    // Check if seller is banned or suspended
    if (seller.status === 'banned' || seller.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: `Account is ${seller.status}. Please contact support.`
      });
    }
    
    // Verify password
    const isPasswordCorrect = await seller.comparePassword(password);
    
    if (!isPasswordCorrect) {
      // Increment login attempts
      seller.security.loginAttempts += 1;
      
      if (seller.security.loginAttempts >= 5) {
        seller.security.lockUntil = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      }
      
      await seller.save();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Reset login attempts on successful login
    if (seller.security.loginAttempts > 0) {
      seller.security.loginAttempts = 0;
      seller.security.lockUntil = undefined;
    }
    
    // Update login statistics
    seller.activity.loginCount += 1;
    seller.activity.lastLogin = new Date();
    seller.activity.lastActive = new Date();
    
    await seller.save();
    
    // Generate JWT token
    const token = jwt.sign(
      { id: seller._id, userType: 'seller' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      seller: {
        id: seller._id,
        email: seller.email,
        firstName: seller.firstName,
        lastName: seller.lastName,
        businessInfo: seller.businessInfo,
        status: seller.status,
        verificationScore: seller.verificationScore,
        subscription: seller.currentSubscription,
        location: seller.location
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
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
        path: 'currentSubscription',
        populate: {
          path: 'plan',
          select: 'name planType features'
        }
      })
      .populate('subscriptionHistory');
    
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }
    
    res.status(200).json({
      success: true,
      seller
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
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
      preferences
    } = req.body;
    
    const seller = await Seller.findById(req.user.id);
    
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }
    
    // Handle avatar upload
    if (req.file) {
      // Delete old avatar
      if (seller.avatar && seller.avatar.publicId) {
        await cloudinary.uploader.destroy(seller.avatar.publicId);
      }
      
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'myjuakali/sellers/avatars',
        transformation: [
          { width: 300, height: 300, crop: 'fill' },
          { quality: 'auto:good' }
        ]
      });
      
      seller.avatar = {
        url: result.secure_url,
        publicId: result.public_id,
        alt: `${firstName || seller.firstName} ${lastName || seller.lastName}`
      };
    }
    
    // Update fields
    if (firstName) seller.firstName = firstName;
    if (lastName) seller.lastName = lastName;
    if (bio) seller.bio = bio;
    if (businessInfo) {
      seller.businessInfo = { ...seller.businessInfo, ...businessInfo };
      if (businessInfo.specialties) {
        seller.businessInfo.specialties = Array.isArray(businessInfo.specialties)
          ? businessInfo.specialties
          : businessInfo.specialties.split(',').map(s => s.trim());
      }
    }
    if (location) seller.location = { ...seller.location, ...location };
    if (socialLinks) seller.socialLinks = { ...seller.socialLinks, ...socialLinks };
    if (preferences) seller.preferences = { ...seller.preferences, ...preferences };
    
    await seller.save();
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      seller
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
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
        message: 'No documents uploaded'
      });
    }
    
    if (!['identity', 'business'].includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type. Must be "identity" or "business"'
      });
    }
    
    const seller = await Seller.findById(req.user.id);
    
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }
    
    const uploadedDocuments = [];
    
    for (const file of req.files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: `myjuakali/sellers/documents/${documentType}`,
        resource_type: 'auto'
      });
      
      uploadedDocuments.push({
        type: file.fieldname, // national_id, passport, business_permit, etc.
        url: result.secure_url,
        publicId: result.public_id,
        status: 'pending'
      });
    }
    
    // Add documents to appropriate verification section
    if (documentType === 'identity') {
      seller.verification.identity.documents.push(...uploadedDocuments);
    } else {
      seller.verification.business.documents.push(...uploadedDocuments);
    }
    
    await seller.save();
    
    res.status(200).json({
      success: true,
      message: 'Documents uploaded successfully and are pending verification',
      documents: uploadedDocuments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
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
    const seller = await Seller.findById(sellerId)
      .populate({
        path: 'currentSubscription',
        populate: {
          path: 'plan',
          select: 'name planType features'
        }
      });
    
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }
    
    // Get product statistics
    const productStats = await Product.aggregate([
      { $match: { seller: seller._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalViews: { $sum: '$stats.views' },
          totalInquiries: { $sum: '$stats.inquiries' }
        }
      }
    ]);
    
    // Get recent products
    const recentProducts = await Product.find({ seller: sellerId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title status createdAt stats pricing');
    
    // Calculate totals
    const stats = {
      totalProducts: seller.activity.totalProducts,
      activeProducts: seller.activity.activeProducts,
      totalViews: productStats.reduce((sum, stat) => sum + stat.totalViews, 0),
      totalInquiries: productStats.reduce((sum, stat) => sum + stat.totalInquiries, 0),
      verificationScore: seller.verificationScore,
      subscription: seller.currentSubscription
    };
    
    // Group product stats by status
    const productsByStatus = {};
    productStats.forEach(stat => {
      productsByStatus[stat._id] = stat.count;
    });
    
    res.status(200).json({
      success: true,
      stats,
      productsByStatus,
      recentProducts,
      subscription: seller.currentSubscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

module.exports = {
  registerSeller,
  loginSeller,
  getSellerProfile,
  updateSellerProfile,
  uploadVerificationDocuments,
  getSellerDashboard
};
