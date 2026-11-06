const mongoose = require("mongoose");
const IssueReport = require("../models/IssueReport");
const Product = require("../models/Product");
const Seller = require("../models/Seller");

// Helper to generate a unique ticket number like INC-2026-4891
const generateTicketNumber = async () => {
  const year = new Date().getFullYear();
  let ticket = "";
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 10) {
    attempts++;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    ticket = `INC-${year}-${randomSuffix}`;
    const found = await IssueReport.findOne({ reportNumber: ticket });
    if (!found) exists = false;
  }
  return ticket;
};

// @desc    Submit an issue / incident report
// @route   POST /api/issues
// @access  Authenticated users only
const createIssue = async (req, res) => {
  try {
    const {
      category,
      priority = "medium",
      subject,
      description,
      targetProduct,
      targetSeller,
      evidenceImages,
    } = req.body;

    const userId = req.user?.id || req.user?._id;
    const rawUserType = req.user?.userType || req.user?.role || "Buyer";
    const userType = ["Seller", "seller"].includes(rawUserType) ? "Seller" : "Buyer";

    if (!category) {
      return res.status(400).json({ success: false, message: "Issue category is required" });
    }

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, message: "Subject is required" });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: "Detailed description is required" });
    }

    const reporterName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.phone || "User";
    const reportNumber = await generateTicketNumber();

    let resolvedTargetSeller = targetSeller || null;
    let resolvedTargetProduct = targetProduct || null;

    if (resolvedTargetProduct && !resolvedTargetSeller) {
      const prod = await Product.findById(resolvedTargetProduct).lean();
      if (prod?.seller) resolvedTargetSeller = prod.seller;
    }

    const newIssue = await IssueReport.create({
      reportNumber,
      reporter: {
        userId,
        userType,
        name: reporterName,
        email: req.user.email || "",
        phone: req.user.phone || "",
      },
      category,
      priority,
      subject: subject.trim(),
      description: description.trim(),
      targetProduct: resolvedTargetProduct,
      targetSeller: resolvedTargetSeller,
      evidenceImages: Array.isArray(evidenceImages) ? evidenceImages : [],
      status: "pending",
      timeline: [
        {
          status: "pending",
          note: "Report registered by user",
          updatedBy: reporterName,
          updatedAt: new Date(),
        },
      ],
    });

    res.status(201).json({
      success: true,
      message: `Report ${reportNumber} submitted successfully. Our team will investigate.`,
      issue: newIssue,
    });
  } catch (error) {
    console.error("Error creating issue report:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to submit report" });
  }
};

// @desc    Get issues submitted by the logged in user
// @route   GET /api/issues/my-issues
// @access  Authenticated user
const getMyIssues = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    const issues = await IssueReport.find({ "reporter.userId": userId })
      .populate("targetProduct", "title media slug")
      .populate("targetSeller", "firstName lastName businessInfo phone email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: issues.length,
      issues,
    });
  } catch (error) {
    console.error("Error fetching user issues:", error);
    res.status(500).json({ success: false, message: "Failed to fetch your reports" });
  }
};

// @desc    Get single issue details
// @route   GET /api/issues/:id
// @access  Reporter or Admin
const getIssueDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?._id;
    const rawRole = (req.user?.userType || req.user?.role || "").toLowerCase();
    const isAdmin = ["admin", "super_admin"].includes(rawRole);

    const issue = await IssueReport.findById(id)
      .populate("targetProduct", "title media slug pricing")
      .populate("targetSeller", "firstName lastName businessInfo phone email location")
      .populate("resolution.resolvedBy", "firstName lastName email")
      .lean();

    if (!issue) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    const isOwner = issue.reporter?.userId?.toString() === userId.toString();
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized to view this report" });
    }

    res.status(200).json({
      success: true,
      issue,
    });
  } catch (error) {
    console.error("Error fetching issue details:", error);
    res.status(500).json({ success: false, message: "Failed to fetch report details" });
  }
};

// @desc    Get all issues for Admin Dashboard
// @route   GET /api/issues/admin/all
// @access  Admin only
const getAllIssuesAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status = "",
      category = "",
      priority = "",
      search = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    if (search && search.trim()) {
      const reg = new RegExp(search.trim(), "i");
      query.$or = [
        { reportNumber: reg },
        { subject: reg },
        { description: reg },
        { "reporter.name": reg },
        { "reporter.phone": reg },
      ];
    }

    const [issues, total, statsAggregation] = await Promise.all([
      IssueReport.find(query)
        .populate("targetProduct", "title slug media")
        .populate("targetSeller", "firstName lastName businessInfo phone email")
        .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      IssueReport.countDocuments(query),
      IssueReport.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $in: ["$status", ["in_progress", "investigating"]] }, 1, 0] } },
            resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } },
            highOrUrgent: { $sum: { $cond: [{ $in: ["$priority", ["high", "urgent"]] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const stats = statsAggregation[0] || {
      total: 0,
      pending: 0,
      inProgress: 0,
      resolved: 0,
      highOrUrgent: 0,
    };

    res.status(200).json({
      success: true,
      data: {
        issues,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
        stats,
      },
    });
  } catch (error) {
    console.error("Error fetching admin issues:", error);
    res.status(500).json({ success: false, message: "Failed to fetch incident reports" });
  }
};

// @desc    Admin updates issue status & adds resolution
// @route   PATCH /api/issues/:id/resolve
// @access  Admin only
const resolveIssue = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes, note } = req.body;
    const adminId = req.user?.id || req.user?._id;
    const adminName = `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || "Administrator";

    if (!status) {
      return res.status(400).json({ success: false, message: "Status is required" });
    }

    if (status === "resolved" && (!resolutionNotes || !resolutionNotes.trim())) {
      return res.status(400).json({
        success: false,
        message: "Resolution notes are required when marking an incident as resolved.",
      });
    }

    const issue = await IssueReport.findById(id);
    if (!issue) {
      return res.status(404).json({ success: false, message: "Incident report not found" });
    }

    issue.status = status;

    if (status === "resolved") {
      issue.resolution = {
        resolvedBy: adminId,
        adminName,
        resolutionNotes: resolutionNotes.trim(),
        resolvedAt: new Date(),
      };
    }

    // Append to timeline
    issue.timeline.push({
      status,
      note: resolutionNotes?.trim() || note?.trim() || `Status updated to ${status}`,
      updatedBy: adminName,
      updatedAt: new Date(),
    });

    await issue.save();

    res.status(200).json({
      success: true,
      message: `Incident report status updated to ${status}`,
      issue,
    });
  } catch (error) {
    console.error("Error resolving issue:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to update incident" });
  }
};

module.exports = {
  createIssue,
  getMyIssues,
  getIssueDetails,
  getAllIssuesAdmin,
  resolveIssue,
};

