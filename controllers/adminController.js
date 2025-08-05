const Admin = require("../models/Admin");
const Seller = require("../models/Seller");
const Product = require("../models/Product");
const Review = require("../models/Review");
const UserSubscription = require("../models/UserSubscription");

// @desc    Register new admin
// @route   POST /api/admins/register
// @access  Super Admin only
const registerAdmin = async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      phone,
      role,
      department,
      permissions,
      reportsTo,
    } = req.body;

    // Only super admins can create other admins
    if (req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only super admins can create new admin accounts",
      });
    }

    // Validation
    if (
      !email ||
      !password ||
      !firstName ||
      !lastName ||
      !role ||
      !department
    ) {
      return res.status(400).json({
        success: false,
        message: "Required fields: email, password, name, role, and department",
      });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin with this email already exists",
      });
    }

    // Verify reporting manager exists if provided
    if (reportsTo) {
      const manager = await Admin.findById(reportsTo);
      if (!manager) {
        return res.status(404).json({
          success: false,
          message: "Reporting manager not found",
        });
      }
    }

    const adminData = {
      email,
      password,
      firstName,
      lastName,
      phone,
      role,
      department,
      permissions: permissions || {},
      reportsTo,
    };

    const admin = await Admin.create(adminData);

    // Generate JWT token
    const token = jwt.sign(
      { id: admin._id, userType: "admin", role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" } // Shorter session for admins
    );

    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      token,
      admin: {
        id: admin._id,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
        department: admin.department,
        permissions: admin.permissions,
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

// @desc    Get admin dashboard stats
// @route   GET /api/admins/dashboard
// @access  Admin only
const getAdminDashboard = async (req, res) => {
  try {
    const adminId = req.user.id;

    // Verify admin has view permissions
    const admin = await Admin.findById(adminId);
    if (!admin.hasPermission("analytics", "view")) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions to view dashboard",
      });
    }

    // Get basic counts
    const stats = await Promise.all([
      Seller.countDocuments({ status: "active" }),
      Seller.countDocuments({ status: "pending" }),
      Product.countDocuments({ status: "active" }),
      Product.countDocuments({ status: "pending_approval" }),
      Review.countDocuments({ status: "pending" }),
      UserSubscription.countDocuments({ status: "active" }),
    ]);

    // Get recent activities
    const recentSellers = await Seller.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("firstName lastName businessInfo.businessName createdAt");

    const recentProducts = await Product.find({ status: "pending_approval" })
      .populate("seller", "firstName lastName businessInfo.businessName")
      .sort({ createdAt: -1 })
      .limit(5)
      .select("title seller createdAt");

    const pendingReviews = await Review.find({ status: "pending" })
      .populate("reviewer", "firstName lastName")
      .populate("reviewee", "firstName lastName businessInfo.businessName")
      .sort({ createdAt: -1 })
      .limit(5);

    // Subscription analytics
    const subscriptionStats = await UserSubscription.aggregate([
      {
        $lookup: {
          from: "subscriptionplans",
          localField: "plan",
          foreignField: "_id",
          as: "planDetails",
        },
      },
      {
        $group: {
          _id: { $arrayElemAt: ["$planDetails.planType", 0] },
          count: { $sum: 1 },
          revenue: { $sum: "$billing.amount" },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      stats: {
        activeSellers: stats[0],
        pendingSellers: stats[1],
        activeProducts: stats[2],
        pendingProducts: stats[3],
        pendingReviews: stats[4],
        activeSubscriptions: stats[5],
      },
      recentActivities: {
        sellers: recentSellers,
        products: recentProducts,
        reviews: pendingReviews,
      },
      subscriptionStats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Approve/reject seller
// @route   PUT /api/admins/sellers/:id/status
// @access  Admin only
const updateSellerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!admin.hasPermission("users", "edit")) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    if (!["active", "suspended", "banned"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const seller = await Seller.findById(id);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    const oldStatus = seller.status;
    seller.status = status;

    if (status === "suspended" || status === "banned") {
      // Hide all seller's products
      await Product.updateMany({ seller: id }, { status: "inactive" });
    } else if (status === "active" && oldStatus !== "active") {
      // Reactivate products if seller was reactivated
      await Product.updateMany(
        { seller: id, status: "inactive" },
        { status: "active" }
      );
    }

    await seller.save();

    // TODO: Send notification to seller

    res.status(200).json({
      success: true,
      message: `Seller ${status} successfully`,
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

// @desc    Approve/reject product
// @route   PUT /api/admins/products/:id/status
// @access  Admin only
const updateProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const admin = await Admin.findById(req.user.id);
    if (!admin.hasPermission("products", "approve")) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    if (!["active", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const product = await Product.findById(id).populate("seller");
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    product.status = status;

    if (status === "active") {
      // Update seller's active products count
      await Seller.findByIdAndUpdate(product.seller._id, {
        $inc: { "activity.activeProducts": 1 },
      });
    }

    await product.save();

    // TODO: Send notification to seller

    res.status(200).json({
      success: true,
      message: `Product ${status} successfully`,
      product,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Approve/reject review
// @route   PUT /api/admins/reviews/:id/status
// @access  Admin only
const updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const admin = await Admin.findById(req.user.id);
    if (!admin.hasPermission("reviews", "moderate")) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    review.status = status;
    await review.save();

    // Update seller ratings if approved
    if (status === "approved") {
      const { updateSellerRatings } = require("./reviewsController");
      await updateSellerRatings(review.reviewee);
    }

    res.status(200).json({
      success: true,
      message: `Review ${status} successfully`,
      review,
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
  registerAdmin,
  getAdminDashboard,
  updateSellerStatus,
  updateProductStatus,
  updateReviewStatus,
};
