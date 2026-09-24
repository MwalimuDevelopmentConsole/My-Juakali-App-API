const AgentIssue = require("../models/AgentIssue");
const Marketer = require("../models/Marketer");

// @desc    Log a suggestion or issue (Agent)
// @route   POST /api/agent-issues
// @access  Agent / Marketer
const createIssue = async (req, res) => {
  try {
    const agentId = req.user.id;
    const marketer = await Marketer.findById(agentId);

    const {
      type,
      title,
      description,
      category,
      priority,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    const agentName = marketer
      ? `${marketer.firstName} ${marketer.lastName}`.trim()
      : req.user.firstName
      ? `${req.user.firstName} ${req.user.lastName || ""}`.trim()
      : "Field Agent";

    const newIssue = new AgentIssue({
      agent: agentId,
      agentName,
      agentPhone: marketer?.phone || req.user.phone,
      agentEmail: marketer?.email || req.user.email,
      type: type || "suggestion",
      title: title.trim(),
      description: description.trim(),
      category: category || "seller_onboarding",
      priority: priority || "medium",
      isPublic: false, // Admin decides when to make public to community
      status: "open",
      statusHistory: [
        {
          status: "open",
          changedAt: new Date(),
          changedBy: {
            id: agentId,
            name: agentName,
            role: "marketer",
          },
          note: "Issue logged by agent",
        },
      ],
    });

    await newIssue.save();

    res.status(201).json({
      success: true,
      message: "Feedback / issue submitted successfully",
      issue: newIssue,
    });
  } catch (error) {
    console.error("Create agent issue error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit issue",
      error: error.message,
    });
  }
};

// @desc    Get my logged issues (Agent)
// @route   GET /api/agent-issues/my-issues
// @access  Agent
const getMyIssues = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { status, type } = req.query;

    const query = { agent: agentId };
    if (status && status !== "all") query.status = status;
    if (type && type !== "all") query.type = type;

    const issues = await AgentIssue.find(query)
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: issues.length,
      issues,
    });
  } catch (error) {
    console.error("Get my issues error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve your issues",
      error: error.message,
    });
  }
};

// @desc    Get public suggestions & issues feed (Agents community)
// @route   GET /api/agent-issues/public
// @access  Agent
const getPublicIssues = async (req, res) => {
  try {
    const { category, type, search } = req.query;

    const query = { isPublic: true };
    if (category && category !== "all") query.category = category;
    if (type && type !== "all") query.type = type;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const issues = await AgentIssue.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.status(200).json({
      success: true,
      count: issues.length,
      issues,
    });
  } catch (error) {
    console.error("Get public issues error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve community issues",
      error: error.message,
    });
  }
};

// @desc    Get all issues (Admin)
// @route   GET /api/agent-issues/admin/all
// @access  Admin
const getAllIssuesAdmin = async (req, res) => {
  try {
    const { status, type, category, priority, page = 1, limit = 20, search } = req.query;

    const query = {};
    if (status && status !== "all") query.status = status;
    if (type && type !== "all") query.type = type;
    if (category && category !== "all") query.category = category;
    if (priority && priority !== "all") query.priority = priority;

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { agentName: { $regex: search, $options: "i" } },
        { agentPhone: { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [issues, total] = await Promise.all([
      AgentIssue.find(query)
        .populate("agent", "firstName lastName phone email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AgentIssue.countDocuments(query),
    ]);

    // Aggregate stats
    const stats = await AgentIssue.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statCounts = {
      total: 0,
      open: 0,
      in_review: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
      rejected: 0,
    };

    stats.forEach((s) => {
      if (statCounts[s._id] !== undefined) {
        statCounts[s._id] = s.count;
      }
      statCounts.total += s.count;
    });

    res.status(200).json({
      success: true,
      issues,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
      stats: statCounts,
    });
  } catch (error) {
    console.error("Get all agent issues admin error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve issues",
      error: error.message,
    });
  }
};

// @desc    Get single issue details
// @route   GET /api/agent-issues/:id
// @access  Agent / Admin
const getIssueById = async (req, res) => {
  try {
    const issue = await AgentIssue.findById(req.params.id).populate(
      "agent",
      "firstName lastName phone email"
    );

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Issue / suggestion not found",
      });
    }

    // If agent, check permission (is author or public)
    const userRole = req.user.role?.toLowerCase();
    if (
      userRole === "marketer" &&
      !issue.isPublic &&
      issue.agent._id.toString() !== req.user.id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Private issue",
      });
    }

    res.status(200).json({
      success: true,
      issue,
    });
  } catch (error) {
    console.error("Get issue error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve issue",
      error: error.message,
    });
  }
};

// @desc    Update issue status & resolution explanation (Admin)
// @route   PATCH /api/agent-issues/admin/:id/status
// @access  Admin
const updateIssueStatusAdmin = async (req, res) => {
  try {
    const { status, resolutionExplanation, adminNotes, priority } = req.body;

    const issue = await AgentIssue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: "Issue / suggestion not found",
      });
    }

    const adminName = req.user.firstName
      ? `${req.user.firstName} ${req.user.lastName || ""}`.trim()
      : req.user.email || "Admin";

    if (status) {
      issue.status = status;
      if (["resolved", "closed", "rejected"].includes(status)) {
        issue.resolvedAt = new Date();
        issue.resolvedBy = {
          id: req.user.id,
          name: adminName,
          role: req.user.role || "admin",
        };
      }
    }

    if (resolutionExplanation !== undefined) {
      issue.resolutionExplanation = resolutionExplanation;
    }

    if (adminNotes !== undefined) {
      issue.adminNotes = adminNotes;
    }

    if (priority) {
      issue.priority = priority;
    }

    if (req.body.isPublic !== undefined) {
      issue.isPublic = Boolean(req.body.isPublic);
    }

    issue.statusHistory.push({
      status: status || issue.status,
      changedAt: new Date(),
      changedBy: {
        id: req.user.id,
        name: adminName,
        role: req.user.role || "admin",
      },
      note: resolutionExplanation || adminNotes || `Status updated to ${status || issue.status}`,
    });

    await issue.save();

    res.status(200).json({
      success: true,
      message: "Issue updated successfully",
      issue,
    });
  } catch (error) {
    console.error("Update issue status admin error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update issue status",
      error: error.message,
    });
  }
};

module.exports = {
  createIssue,
  getMyIssues,
  getPublicIssues,
  getAllIssuesAdmin,
  getIssueById,
  updateIssueStatusAdmin,
};
