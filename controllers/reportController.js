const Product = require("../models/Product");
const Seller = require("../models/Seller");
const Buyer = require("../models/Buyer");
const Marketer = require("../models/Marketer");
const Review = require("../models/Review");
const Commission = require("../models/Commission");
const SellerSubscription = require("../models/SellerSubscription");
const SearchAnalytics = require("../models/SearchAnalytics");
const GeneralLedger = require("../models/GeneralLedger");
const { default: mongoose } = require("mongoose");

// Helper function to get date ranges
const getDateRange = (period) => {
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case "today":
      startDate = new Date(now.setHours(0, 0, 0, 0));
      endDate = new Date(now.setHours(23, 59, 59, 999));
      break;
    case "week":
      startDate = new Date(now.setDate(now.getDate() - 7));
      endDate = new Date();
      break;
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case "quarter":
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      break;
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31);
      break;
    case "custom":
      // Will be provided in query params
      startDate = null;
      endDate = null;
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date();
  }

  return { startDate, endDate };
};

// @desc    Get revenue report
// @route   GET /api/reports/revenue
// @access  Private/Admin
const getRevenueReport = async (req, res) => {
  try {
    const { period = "month", startDate, endDate } = req.query;

    let dateRange = getDateRange(period);
    if (period === "custom" && startDate && endDate) {
      dateRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      };
    }

    // Get subscription revenue
    const subscriptionRevenue = await SellerSubscription.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
          status: { $in: ["active", "expired"] },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$billing.amount" },
          totalSubscriptions: { $sum: 1 },
        },
      },
    ]);

    // Get revenue by subscription plan
    const revenueByPlan = await SellerSubscription.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
          status: { $in: ["active", "expired"] },
        },
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
          revenue: { $sum: "$billing.amount" },
          count: { $sum: 1 },
          avgAmount: { $avg: "$billing.amount" },
        },
      },
      {
        $sort: { revenue: -1 },
      },
    ]);

    // Get daily revenue breakdown
    const dailyRevenue = await SellerSubscription.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
          status: { $in: ["active", "expired"] },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          revenue: { $sum: "$billing.amount" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    // Get commission expenses
    const commissionExpenses = await Commission.aggregate([
      {
        $match: {
          earnedDate: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
          status: { $in: ["approved", "paid"] },
        },
      },
      {
        $group: {
          _id: null,
          totalCommissions: { $sum: "$commissionAmount" },
          totalCount: { $sum: 1 },
        },
      },
    ]);

    const totalRevenue = subscriptionRevenue[0]?.totalRevenue || 0;
    const totalCommissions = commissionExpenses[0]?.totalCommissions || 0;
    const netRevenue = totalRevenue - totalCommissions;

    res.status(200).json({
      success: true,
      data: {
        period: period,
        dateRange: dateRange,
        summary: {
          totalRevenue,
          totalCommissions,
          netRevenue,
          totalSubscriptions: subscriptionRevenue[0]?.totalSubscriptions || 0,
          profitMargin:
            totalRevenue > 0
              ? ((netRevenue / totalRevenue) * 100).toFixed(2)
              : 0,
        },
        revenueByPlan,
        dailyRevenue,
        commissions: {
          total: totalCommissions,
          count: commissionExpenses[0]?.totalCount || 0,
        },
      },
    });
  } catch (error) {
    console.error("Error generating revenue report:", error);
    res.status(500).json({
      success: false,
      message: "Error generating revenue report",
      error: error.message,
    });
  }
};

// @desc    Get user growth report
// @route   GET /api/reports/user-growth
// @access  Private/Admin
const getUserGrowthReport = async (req, res) => {
  try {
    const { period = "month", startDate, endDate } = req.query;

    let dateRange = getDateRange(period);
    if (period === "custom" && startDate && endDate) {
      dateRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      };
    }

    // Get seller growth
    const sellerGrowth = await Seller.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    // Get buyer growth
    const buyerGrowth = await Buyer.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    // Get marketer growth
    const marketerGrowth = await Marketer.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    // Get status breakdown
    const sellersByStatus = await Seller.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get sellers by location
    const sellersByLocation = await Seller.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$location.county",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    // Get verification stats
    const verificationStats = await Seller.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          emailVerified: {
            $sum: { $cond: ["$verification.email.verified", 1, 0] },
          },
          phoneVerified: {
            $sum: { $cond: ["$verification.phone.verified", 1, 0] },
          },
          identityVerified: {
            $sum: { $cond: ["$verification.identity.verified", 1, 0] },
          },
          businessVerified: {
            $sum: { $cond: ["$verification.business.verified", 1, 0] },
          },
          total: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        period: period,
        dateRange: dateRange,
        summary: {
          totalSellers: sellerGrowth.reduce((sum, item) => sum + item.count, 0),
          totalBuyers: buyerGrowth.reduce((sum, item) => sum + item.count, 0),
          totalMarketers: marketerGrowth.reduce(
            (sum, item) => sum + item.count,
            0
          ),
        },
        growth: {
          sellers: sellerGrowth,
          buyers: buyerGrowth,
          marketers: marketerGrowth,
        },
        sellerAnalysis: {
          byStatus: sellersByStatus,
          byLocation: sellersByLocation,
          verification: verificationStats[0] || {},
        },
      },
    });
  } catch (error) {
    console.error("Error generating user growth report:", error);
    res.status(500).json({
      success: false,
      message: "Error generating user growth report",
      error: error.message,
    });
  }
};

// @desc    Get product performance report
// @route   GET /api/reports/product-performance
// @access  Private/Admin
const getProductPerformanceReport = async (req, res) => {
  try {
    const { period = "month", startDate, endDate } = req.query;

    let dateRange = getDateRange(period);
    if (period === "custom" && startDate && endDate) {
      dateRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      };
    }

    // Get product statistics
    const productStats = await Product.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalViews: { $sum: "$stats.views" },
          totalInquiries: { $sum: "$stats.inquiries" },
          totalFavorites: { $sum: "$stats.favorites" },
          avgViews: { $avg: "$stats.views" },
          avgInquiries: { $avg: "$stats.inquiries" },
        },
      },
    ]);

    // Get products by status
    const productsByStatus = await Product.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get products by type
    const productsByType = await Product.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalViews: { $sum: "$stats.views" },
        },
      },
    ]);

    // Get products by category
    const productsByCategory = await Product.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$primaryCategory",
          count: { $sum: 1 },
          totalViews: { $sum: "$stats.views" },
          totalInquiries: { $sum: "$stats.inquiries" },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
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
    ]);

    // Get top performing products
    const topProducts = await Product.find({
      createdAt: {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate,
      },
      status: "active",
    })
      .sort({ "stats.views": -1 })
      .limit(10)
      .select("title stats ratings pricing seller")
      .populate("seller", "firstName lastName businessInfo.businessName");

    // Get products with most inquiries
    const mostInquiredProducts = await Product.find({
      createdAt: {
        $gte: dateRange.startDate,
        $lte: dateRange.endDate,
      },
      status: "active",
    })
      .sort({ "stats.inquiries": -1 })
      .limit(10)
      .select("title stats ratings pricing seller")
      .populate("seller", "firstName lastName businessInfo.businessName");

    // Get daily product creation trend
    const dailyCreation = await Product.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        period: period,
        dateRange: dateRange,
        summary: productStats[0] || {},
        breakdown: {
          byStatus: productsByStatus,
          byType: productsByType,
          byCategory: productsByCategory.map((cat) => ({
            name: cat.category.name,
            count: cat.count,
            views: cat.totalViews,
            inquiries: cat.totalInquiries,
          })),
        },
        topPerformers: {
          byViews: topProducts,
          byInquiries: mostInquiredProducts,
        },
        trends: {
          dailyCreation,
        },
      },
    });
  } catch (error) {
    console.error("Error generating product performance report:", error);
    res.status(500).json({
      success: false,
      message: "Error generating product performance report",
      error: error.message,
    });
  }
};

// @desc    Get subscription report
// @route   GET /api/reports/subscriptions
// @access  Private/Admin
const getSubscriptionReport = async (req, res) => {
  try {
    const { period = "month", startDate, endDate } = req.query;

    let dateRange = getDateRange(period);
    if (period === "custom" && startDate && endDate) {
      dateRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      };
    }

    // Get subscription statistics
    const subscriptionStats = await SellerSubscription.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalRevenue: { $sum: "$billing.amount" },
        },
      },
    ]);

    // Get subscriptions by plan
    const subscriptionsByPlan = await SellerSubscription.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
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
          activeCount: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Get subscription by billing cycle
    const subscriptionsByCycle = await SellerSubscription.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$billing.cycle",
          count: { $sum: 1 },
          revenue: { $sum: "$billing.amount" },
        },
      },
    ]);

    // Get churn analysis
    const churnedSubscriptions = await SellerSubscription.aggregate([
      {
        $match: {
          status: { $in: ["cancelled", "expired"] },
          "cancellation.requestedAt": {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$cancellation.reason",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    // Get renewal statistics
    const renewalStats = await SellerSubscription.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalAutoRenewEnabled: {
            $sum: { $cond: ["$autoRenew", 1, 0] },
          },
          totalAutoRenewDisabled: {
            $sum: { $cond: [{ $not: "$autoRenew" }, 1, 0] },
          },
          avgRenewalAttempts: { $avg: "$renewalAttempts" },
        },
      },
    ]);

    // Get trial conversion rate
    const trialStats = await SellerSubscription.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalTrials: {
            $sum: { $cond: ["$trial.isTrialUser", 1, 0] },
          },
          convertedFromTrial: {
            $sum: { $cond: ["$trial.convertedFromTrial", 1, 0] },
          },
        },
      },
    ]);

    const trialConversionRate =
      trialStats[0]?.totalTrials > 0
        ? (
            (trialStats[0].convertedFromTrial / trialStats[0].totalTrials) *
            100
          ).toFixed(2)
        : 0;

    res.status(200).json({
      success: true,
      data: {
        period: period,
        dateRange: dateRange,
        summary: {
          total: subscriptionStats.reduce((sum, item) => sum + item.count, 0),
          totalRevenue: subscriptionStats.reduce(
            (sum, item) => sum + item.totalRevenue,
            0
          ),
          byStatus: subscriptionStats,
        },
        breakdown: {
          byPlan: subscriptionsByPlan,
          byCycle: subscriptionsByCycle,
        },
        churnAnalysis: {
          reasons: churnedSubscriptions,
          total: churnedSubscriptions.reduce(
            (sum, item) => sum + item.count,
            0
          ),
        },
        renewals: renewalStats[0] || {},
        trials: {
          total: trialStats[0]?.totalTrials || 0,
          converted: trialStats[0]?.convertedFromTrial || 0,
          conversionRate: trialConversionRate,
        },
      },
    });
  } catch (error) {
    console.error("Error generating subscription report:", error);
    res.status(500).json({
      success: false,
      message: "Error generating subscription report",
      error: error.message,
    });
  }
};

// @desc    Get marketer performance report
// @route   GET /api/reports/marketer-performance
// @access  Private/Admin
const getMarketerPerformanceReport = async (req, res) => {
  try {
    const { period = "month", startDate, endDate } = req.query;

    let dateRange = getDateRange(period);
    if (period === "custom" && startDate && endDate) {
      dateRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      };
    }

    // Get top performing marketers
    const topMarketers = await Marketer.find({ status: "active" })
      .sort({ "marketerInfo.performance.totalReferrals": -1 })
      .limit(10)
      .select(
        "firstName lastName marketerInfo.performance marketerInfo.referralCode location.county"
      );

    // Get commission summary
    const commissionSummary = await Commission.aggregate([
      {
        $match: {
          earnedDate: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$commissionAmount" },
        },
      },
    ]);

    // Get commission by marketer
    const commissionByMarketer = await Commission.aggregate([
      {
        $match: {
          earnedDate: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
          status: "paid",
        },
      },
      {
        $group: {
          _id: "$marketer",
          totalCommissions: { $sum: "$commissionAmount" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { totalCommissions: -1 },
      },
      {
        $limit: 10,
      },
      {
        $lookup: {
          from: "marketers",
          localField: "_id",
          foreignField: "_id",
          as: "marketerDetails",
        },
      },
      {
        $unwind: "$marketerDetails",
      },
    ]);

    // Get referral conversion rate
    const referralStats = await Seller.aggregate([
      {
        $match: {
          referredBy: { $exists: true, $ne: null },
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: null,
          totalReferrals: { $sum: 1 },
          activeReferrals: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
          withSubscription: {
            $sum: {
              $cond: [{ $ne: ["$currentSubscription", null] }, 1, 0],
            },
          },
        },
      },
    ]);

    const conversionRate =
      referralStats[0]?.totalReferrals > 0
        ? (
            (referralStats[0].withSubscription /
              referralStats[0].totalReferrals) *
            100
          ).toFixed(2)
        : 0;

    res.status(200).json({
      success: true,
      data: {
        period: period,
        dateRange: dateRange,
        summary: {
          totalCommissions: commissionSummary.reduce(
            (sum, item) => sum + item.totalAmount,
            0
          ),
          totalReferrals: referralStats[0]?.totalReferrals || 0,
          activeReferrals: referralStats[0]?.activeReferrals || 0,
          conversionRate: conversionRate,
        },
        topPerformers: topMarketers,
        commissions: {
          byStatus: commissionSummary,
          byMarketer: commissionByMarketer.map((item) => ({
            marketer: {
              id: item.marketerDetails._id,
              name: `${item.marketerDetails.firstName} ${item.marketerDetails.lastName}`,
              referralCode: item.marketerDetails.marketerInfo.referralCode,
            },
            totalCommissions: item.totalCommissions,
            count: item.count,
          })),
        },
      },
    });
  } catch (error) {
    console.error("Error generating marketer performance report:", error);
    res.status(500).json({
      success: false,
      message: "Error generating marketer performance report",
      error: error.message,
    });
  }
};

// @desc    Get search analytics report
// @route   GET /api/reports/search-analytics
// @access  Private/Admin
const getSearchAnalyticsReport = async (req, res) => {
  try {
    const { period = "month", startDate, endDate } = req.query;

    let dateRange = getDateRange(period);
    if (period === "custom" && startDate && endDate) {
      dateRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      };
    }

    // Get top search queries
    const topQueries = await SearchAnalytics.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$normalizedQuery",
          count: { $sum: 1 },
          avgResults: { $avg: "$resultsCount" },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 20,
      },
    ]);

    // Get searches with no results
    const noResultSearches = await SearchAnalytics.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
          resultsCount: 0,
        },
      },
      {
        $group: {
          _id: "$normalizedQuery",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 20,
      },
    ]);

    // Get search trends
    const searchTrends = await SearchAnalytics.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          searchCount: { $sum: 1 },
          avgResults: { $avg: "$resultsCount" },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    // Get category-wise searches
    const searchesByCategory = await SearchAnalytics.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
          "filters.category": { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$filters.category",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        period: period,
        dateRange: dateRange,
        topQueries,
        noResultSearches,
        trends: searchTrends,
        searchesByCategory,
      },
    });
  } catch (error) {
    console.error("Error generating search analytics report:", error);
    res.status(500).json({
      success: false,
      message: "Error generating search analytics report",
      error: error.message,
    });
  }
};

// @desc    Get financial summary report
// @route   GET /api/reports/financial-summary
// @access  Private/Admin
const getFinancialSummaryReport = async (req, res) => {
  try {
    const { period = "month", startDate, endDate } = req.query;

    let dateRange = getDateRange(period);
    if (period === "custom" && startDate && endDate) {
      dateRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      };
    }

    // Get income from subscriptions
    const subscriptionIncome = await SellerSubscription.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
          status: { $in: ["active", "expired"] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$billing.amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get commission expenses
    const commissionExpenses = await Commission.aggregate([
      {
        $match: {
          earnedDate: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
          status: { $in: ["approved", "paid"] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$commissionAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Get general ledger entries if available
    const ledgerEntries = await GeneralLedger.aggregate([
      {
        $match: {
          transactionDate: {
            $gte: dateRange.startDate,
            $lte: dateRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: "$transactionType",
          totalDebit: { $sum: "$debitAmount" },
          totalCredit: { $sum: "$creditAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalIncome = subscriptionIncome[0]?.total || 0;
    const totalExpenses = commissionExpenses[0]?.total || 0;
    const netProfit = totalIncome - totalExpenses;
    const profitMargin =
      totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      data: {
        period: period,
        dateRange: dateRange,
        summary: {
          totalIncome,
          totalExpenses,
          netProfit,
          profitMargin,
        },
        income: {
          subscriptions: {
            amount: subscriptionIncome[0]?.total || 0,
            count: subscriptionIncome[0]?.count || 0,
          },
        },
        expenses: {
          commissions: {
            amount: commissionExpenses[0]?.total || 0,
            count: commissionExpenses[0]?.count || 0,
          },
        },
        ledgerEntries,
      },
    });
  } catch (error) {
    console.error("Error generating financial summary report:", error);
    res.status(500).json({
      success: false,
      message: "Error generating financial summary report",
      error: error.message,
    });
  }
};

module.exports = {
  getRevenueReport,
  getUserGrowthReport,
  getProductPerformanceReport,
  getSubscriptionReport,
  getMarketerPerformanceReport,
  getSearchAnalyticsReport,
  getFinancialSummaryReport,
};
