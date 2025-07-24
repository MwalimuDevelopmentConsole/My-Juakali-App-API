const Commission = require("../models/Commission");
const Marketer = require("../models/Marketer");

// @desc    Get all commissions (Admin)
// @route   GET /api/commissions
// @access  Admin only
const getAllCommissions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, marketer, period } = req.query;

    const admin = await Admin.findById(req.user.id);
    if (!admin.hasPermission("financials", "commissions")) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let filter = {};
    if (status) filter.status = status;
    if (marketer) filter.marketer = marketer;
    if (period) filter.period = period;

    const commissions = await Commission.find(filter)
      .populate(
        "marketer",
        "firstName lastName email marketerInfo.referralCode"
      )
      .populate("referredUser", "firstName lastName businessInfo.businessName")
      .populate("subscription", "plan billing")
      .sort({ earnedDate: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalCommissions = await Commission.countDocuments(filter);

    // Get summary statistics
    const summary = await Commission.aggregate([
      { $match: filter },
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

// @desc    Approve commission for payment
// @route   PUT /api/commissions/:id/approve
// @access  Admin only
const approveCommission = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findById(req.user.id);
    if (!admin.hasPermission("financials", "commissions")) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    const commission = await Commission.findById(id).populate(
      "marketer",
      "firstName lastName paymentInfo"
    );

    if (!commission) {
      return res.status(404).json({
        success: false,
        message: "Commission not found",
      });
    }

    if (commission.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Commission is not in pending status",
      });
    }

    commission.status = "approved";
    await commission.save();

    res.status(200).json({
      success: true,
      message: "Commission approved successfully",
      commission,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Mark commission as paid
// @route   PUT /api/commissions/:id/paid
// @access  Admin only
const markCommissionPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentReference, paymentMethod } = req.body;

    const admin = await Admin.findById(req.user.id);
    if (!admin.hasPermission("financials", "commissions")) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    const commission = await Commission.findById(id);

    if (!commission) {
      return res.status(404).json({
        success: false,
        message: "Commission not found",
      });
    }

    if (commission.status !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Commission must be approved before marking as paid",
      });
    }

    commission.status = "paid";
    commission.paidAt = new Date();
    commission.paymentReference = paymentReference;
    commission.paymentMethod = paymentMethod;

    await commission.save();

    // Update marketer's paid commissions
    await Marketer.findByIdAndUpdate(commission.marketer, {
      $inc: {
        "marketerInfo.performance.totalCommissionsPaid":
          commission.commissionAmount,
      },
    });

    res.status(200).json({
      success: true,
      message: "Commission marked as paid successfully",
      commission,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Get commission statistics
// @route   GET /api/commissions/stats
// @access  Admin only
const getCommissionStats = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id);
    if (!admin.hasPermission("financials", "view")) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    // Overall commission stats
    const overallStats = await Commission.aggregate([
      {
        $group: {
          _id: null,
          totalCommissions: { $sum: "$commissionAmount" },
          totalCount: { $sum: 1 },
          avgCommission: { $avg: "$commissionAmount" },
        },
      },
    ]);

    // Stats by status
    const statusStats = await Commission.aggregate([
      {
        $group: {
          _id: "$status",
          totalAmount: { $sum: "$commissionAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // Monthly commission trends (last 12 months)
    const monthlyStats = await Commission.aggregate([
      {
        $match: {
          earnedDate: {
            $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$earnedDate" },
            month: { $month: "$earnedDate" },
          },
          totalAmount: { $sum: "$commissionAmount" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
    ]);

    // Top performing marketers
    const topMarketers = await Commission.aggregate([
      {
        $group: {
          _id: "$marketer",
          totalCommissions: { $sum: "$commissionAmount" },
          totalReferrals: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "marketers",
          localField: "_id",
          foreignField: "_id",
          as: "marketerInfo",
        },
      },
      {
        $unwind: "$marketerInfo",
      },
      {
        $project: {
          totalCommissions: 1,
          totalReferrals: 1,
          marketerName: {
            $concat: ["$marketerInfo.firstName", " ", "$marketerInfo.lastName"],
          },
          referralCode: "$marketerInfo.marketerInfo.referralCode",
        },
      },
      {
        $sort: { totalCommissions: -1 },
      },
      {
        $limit: 10,
      },
    ]);

    res.status(200).json({
      success: true,
      overallStats: overallStats[0] || {
        totalCommissions: 0,
        totalCount: 0,
        avgCommission: 0,
      },
      statusStats,
      monthlyStats,
      topMarketers,
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
  getAllCommissions,
  approveCommission,
  markCommissionPaid,
  getCommissionStats,
};
