const Product = require("../models/Product");
const Seller = require("../models/Seller");
const Buyer = require("../models/Buyer");
const Marketer = require("../models/Marketer");
const Review = require("../models/Review");
const Commission = require("../models/Commission");
const SellerSubscription = require("../models/SellerSubscription");
const SearchAnalytics = require("../models/SearchAnalytics");
const { default: mongoose } = require("mongoose");

// @desc    Get admin dashboard overview
// @route   GET /api/dashboard/admin
// @access  Private/Admin
const getAdminDashboard = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get total counts
    const [
      totalSellers,
      totalBuyers,
      totalMarketers,
      totalProducts,
      activeProducts,
      pendingProducts,
      activeSubscriptions,
      totalRevenue,
    ] = await Promise.all([
      Seller.countDocuments(),
      Buyer.countDocuments(),
      Marketer.countDocuments(),
      Product.countDocuments(),
      Product.countDocuments({ status: "active" }),
      Product.countDocuments({ status: "pending_approval" }),
      SellerSubscription.countDocuments({ status: "active" }),
      SellerSubscription.aggregate([
        {
          $match: {
            status: "active",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$billing.amount" },
          },
        },
      ]),
    ]);

    // Get monthly growth
    const [
      newSellersThisMonth,
      newSellersLastMonth,
      newBuyersThisMonth,
      newBuyersLastMonth,
      newProductsThisMonth,
      newProductsLastMonth,
    ] = await Promise.all([
      Seller.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Seller.countDocuments({
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      }),
      Buyer.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Buyer.countDocuments({
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      }),
      Product.countDocuments({ createdAt: { $gte: startOfMonth } }),
      Product.countDocuments({
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      }),
    ]);

    // Calculate growth percentages
    const calculateGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return (((current - previous) / previous) * 100).toFixed(2);
    };

    // Get recent activities
    const recentSellers = await Seller.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("firstName lastName businessInfo.businessName createdAt status");

    const recentProducts = await Product.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("seller", "firstName lastName businessInfo.businessName")
      .select("title status createdAt pricing.basePrice");

    // Get top performing sellers
    const topSellers = await Seller.find({ status: "active" })
      .sort({ "activity.totalRevenue": -1 })
      .limit(5)
      .select(
        "firstName lastName businessInfo.businessName activity.totalRevenue activity.totalProducts ratings.average"
      );

    // Get revenue trend for last 6 months
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const revenueTrend = await SellerSubscription.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo },
          status: { $in: ["active", "expired"] },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          revenue: { $sum: "$billing.amount" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
    ]);

    // Get subscription distribution
    const subscriptionDistribution = await SellerSubscription.aggregate([
      {
        $match: { status: "active" },
      },
      {
        $lookup: {
          from: "subscriptionplans",
          localField: "plan",
          foreignField: "_id",
          as: "planDetails",
        },
      },
      {
        $unwind: "$planDetails",
      },
      {
        $group: {
          _id: "$planDetails.name",
          count: { $sum: 1 },
          revenue: { $sum: "$billing.amount" },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalSellers,
          totalBuyers,
          totalMarketers,
          totalProducts,
          activeProducts,
          pendingProducts,
          activeSubscriptions,
          totalRevenue: totalRevenue[0]?.total || 0,
        },
        growth: {
          sellers: {
            current: newSellersThisMonth,
            previous: newSellersLastMonth,
            percentage: calculateGrowth(newSellersThisMonth, newSellersLastMonth),
          },
          buyers: {
            current: newBuyersThisMonth,
            previous: newBuyersLastMonth,
            percentage: calculateGrowth(newBuyersThisMonth, newBuyersLastMonth),
          },
          products: {
            current: newProductsThisMonth,
            previous: newProductsLastMonth,
            percentage: calculateGrowth(newProductsThisMonth, newProductsLastMonth),
          },
        },
        recentActivities: {
          recentSellers,
          recentProducts,
        },
        topPerformers: {
          topSellers,
        },
        trends: {
          revenue: revenueTrend,
          subscriptions: subscriptionDistribution,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching admin dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard data",
      error: error.message,
    });
  }
};

// @desc    Get seller dashboard overview
// @route   GET /api/dashboard/seller
// @access  Private/Seller
const getSellerDashboard = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get seller details
    const seller = await Seller.findById(sellerId).populate(
      "currentSubscription"
    );

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    // Get product statistics
    const [
      totalProducts,
      activeProducts,
      draftProducts,
      pendingProducts,
      viewsThisMonth,
      inquiriesThisMonth,
    ] = await Promise.all([
      Product.countDocuments({ seller: sellerId }),
      Product.countDocuments({ seller: sellerId, status: "active" }),
      Product.countDocuments({ seller: sellerId, status: "draft" }),
      Product.countDocuments({ seller: sellerId, status: "pending_approval" }),
      Product.aggregate([
        {
          $match: {
            seller: new mongoose.Types.ObjectId(sellerId),
            createdAt: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            totalViews: { $sum: "$stats.views" },
            totalInquiries: { $sum: "$stats.inquiries" },
          },
        },
      ]),
      Product.aggregate([
        {
          $match: {
            seller: new mongoose.Types.ObjectId(sellerId),
            createdAt: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            totalInquiries: { $sum: "$stats.inquiries" },
          },
        },
      ]),
    ]);

    // Get recent products
    const recentProducts = await Product.find({ seller: sellerId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("title status stats createdAt pricing.basePrice media");

    // Get top performing products
    const topProducts = await Product.find({ seller: sellerId, status: "active" })
      .sort({ "stats.views": -1 })
      .limit(5)
      .select("title stats ratings pricing.basePrice media");

    // Get recent reviews
    const recentReviews = await Review.find({ reviewee: sellerId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("reviewer", "firstName lastName avatar");

    // Get subscription info
    const subscription = await SellerSubscription.findById(
      seller.currentSubscription
    ).populate("plan");

    // Get monthly stats trend (last 6 months)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const monthlyStats = await Product.aggregate([
      {
        $match: {
          seller: new mongoose.Types.ObjectId(sellerId),
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          products: { $sum: 1 },
          views: { $sum: "$stats.views" },
          inquiries: { $sum: "$stats.inquiries" },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        seller: {
          id: seller._id,
          name: seller.fullName,
          businessName: seller.businessInfo.businessName,
          rating: seller.ratings.average,
          totalReviews: seller.ratings.count,
          verificationScore: seller.verificationScore,
          status: seller.status,
        },
        overview: {
          totalProducts,
          activeProducts,
          draftProducts,
          pendingProducts,
          profileViews: seller.activity.profileViews,
          totalRevenue: seller.activity.totalRevenue,
        },
        monthlyStats: {
          views: viewsThisMonth[0]?.totalViews || 0,
          inquiries: inquiriesThisMonth[0]?.totalInquiries || 0,
        },
        recentProducts,
        topProducts,
        recentReviews,
        subscription: subscription
          ? {
              plan: subscription.plan?.name,
              status: subscription.status,
              startDate: subscription.startDate,
              endDate: subscription.endDate,
              daysRemaining: subscription.daysRemaining,
              features: subscription.subscribedFeatures,
              usage: subscription.usage,
            }
          : null,
        trends: {
          monthlyStats,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching seller dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard data",
      error: error.message,
    });
  }
};

// @desc    Get marketer dashboard overview
// @route   GET /api/dashboard/marketer
// @access  Private/Marketer
const getMarketerDashboard = async (req, res) => {
  try {
    const marketerId = req.user.id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get marketer details
    const marketer = await Marketer.findById(marketerId);

    if (!marketer) {
      return res.status(404).json({
        success: false,
        message: "Marketer not found",
      });
    }

    // Get referral statistics
    const [
      totalReferrals,
      activeReferrals,
      monthlyReferrals,
      pendingCommissions,
      paidCommissions,
      totalCommissionsAmount,
    ] = await Promise.all([
      Seller.countDocuments({ referredBy: marketerId }),
      Seller.countDocuments({ referredBy: marketerId, status: "active" }),
      Seller.countDocuments({
        referredBy: marketerId,
        createdAt: { $gte: startOfMonth },
      }),
      Commission.countDocuments({ marketer: marketerId, status: "pending" }),
      Commission.countDocuments({ marketer: marketerId, status: "paid" }),
      Commission.aggregate([
        {
          $match: {
            marketer: new mongoose.Types.ObjectId(marketerId),
            status: "paid",
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$commissionAmount" },
          },
        },
      ]),
    ]);

    // Get recent referrals
    const recentReferrals = await Seller.find({ referredBy: marketerId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("firstName lastName businessInfo.businessName status createdAt")
      .populate("currentSubscription", "plan status billing.amount");

    // Get commission breakdown
    const commissionBreakdown = await Commission.aggregate([
      {
        $match: {
          marketer: new mongoose.Types.ObjectId(marketerId),
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          amount: { $sum: "$commissionAmount" },
        },
      },
    ]);

    // Get monthly earnings trend (last 6 months)
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const earningsTrend = await Commission.aggregate([
      {
        $match: {
          marketer: new mongoose.Types.ObjectId(marketerId),
          earnedDate: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$earnedDate" },
            month: { $month: "$earnedDate" },
          },
          earnings: { $sum: "$commissionAmount" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
    ]);

    // Get pending commission details
    const pendingCommissionDetails = await Commission.find({
      marketer: marketerId,
      status: "pending",
    })
      .sort({ earnedDate: -1 })
      .limit(10)
      .populate("referredSeller", "firstName lastName businessInfo.businessName")
      .populate("subscription", "plan billing.amount");

    res.status(200).json({
      success: true,
      data: {
        marketer: {
          id: marketer._id,
          name: marketer.fullName,
          referralCode: marketer.marketerInfo.referralCode,
          status: marketer.status,
          commissionRate: marketer.marketerInfo.commission.rate * 100,
        },
        overview: {
          totalReferrals,
          activeReferrals,
          monthlyReferrals,
          pendingCommissions,
          paidCommissions,
          totalEarnings: totalCommissionsAmount[0]?.total || 0,
          pendingEarnings:
            marketer.marketerInfo.performance.pendingCommissions,
        },
        performance: marketer.marketerInfo.performance,
        recentReferrals,
        commissions: {
          breakdown: commissionBreakdown,
          pending: pendingCommissionDetails,
        },
        trends: {
          earnings: earningsTrend,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching marketer dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard data",
      error: error.message,
    });
  }
};

// @desc    Get platform statistics (public)
// @route   GET /api/dashboard/stats
// @access  Public
const getPlatformStats = async (req, res) => {
  try {
    const [
      totalSellers,
      totalProducts,
      totalServices,
      averageRating,
      topCategories,
    ] = await Promise.all([
      Seller.countDocuments({ status: "active" }),
      Product.countDocuments({ type: "product", status: "active" }),
      Product.countDocuments({ type: "service", status: "active" }),
      Product.aggregate([
        {
          $match: { status: "active", "ratings.count": { $gt: 0 } },
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: "$ratings.average" },
          },
        },
      ]),
      Product.aggregate([
        {
          $match: { status: "active" },
        },
        {
          $group: {
            _id: "$primaryCategory",
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1 },
        },
        {
          $limit: 5,
        },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "category",
          },
        },
        {
          $unwind: "$category",
        },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalSellers,
        totalProducts,
        totalServices,
        averageRating: averageRating[0]?.avgRating.toFixed(1) || 0,
        topCategories: topCategories.map((cat) => ({
          name: cat.category.name,
          count: cat.count,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching platform stats:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching platform statistics",
      error: error.message,
    });
  }
};

module.exports = {
  getAdminDashboard,
  getSellerDashboard,
  getMarketerDashboard,
  getPlatformStats,
};
