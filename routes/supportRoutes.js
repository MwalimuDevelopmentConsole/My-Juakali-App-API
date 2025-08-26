// routes/supportRoutes.js - Seller-Admin Support System Routes

const express = require("express");
const router = express.Router();

const {
  createSupportTicket,
  getSupportTickets,
  getSupportTicketDetails,
  sendSupportMessage,
  getSupportMessages,
  updateTicketStatus,
  assignTicket,
} = require("../controllers/supportController");

// Middleware for request validation
const validatePagination = (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  if (isNaN(pageNum) || pageNum < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid page number",
    });
  }

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    return res.status(400).json({
      success: false,
      message: "Invalid limit. Must be between 1 and 100",
    });
  }

  req.query.page = pageNum;
  req.query.limit = limitNum;
  next();
};

const validateObjectId = (paramName) => (req, res, next) => {
  const id = req.params[paramName];
  if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
    return res.status(400).json({
      success: false,
      message: `Invalid ${paramName} format`,
    });
  }
  next();
};

const validateSupportTicketData = (req, res, next) => {
  const { category, subject, description, priority } = req.body;

  // Validate required fields
  if (!category || !subject || !description) {
    return res.status(400).json({
      success: false,
      message: "Category, subject, and description are required",
    });
  }

  // Validate category
  const validCategories = [
    "technical_issue",
    "account_verification",
    "payment_dispute",
    "business_inquiry",
    "product_issue",
    "subscription_support",
    "general_support",
    "report_abuse",
  ];

  if (!validCategories.includes(category)) {
    return res.status(400).json({
      success: false,
      message: "Invalid category",
    });
  }

  // Validate subject length
  if (subject.trim().length < 5 || subject.trim().length > 200) {
    return res.status(400).json({
      success: false,
      message: "Subject must be between 5 and 200 characters",
    });
  }

  // Validate description length
  if (description.trim().length < 10 || description.trim().length > 2000) {
    return res.status(400).json({
      success: false,
      message: "Description must be between 10 and 2000 characters",
    });
  }

  // Validate priority if provided
  if (priority) {
    const validPriorities = ["low", "medium", "high", "urgent"];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority",
      });
    }
  }

  // Validate attachments if provided
  if (req.body.attachments && Array.isArray(req.body.attachments)) {
    if (req.body.attachments.length > 5) {
      return res.status(400).json({
        success: false,
        message: "Maximum 5 attachments allowed",
      });
    }

    for (const attachment of req.body.attachments) {
      if (!attachment.url || !attachment.name || !attachment.type) {
        return res.status(400).json({
          success: false,
          message: "Invalid attachment format",
        });
      }
    }
  }

  next();
};

const validateSupportMessageContent = (req, res, next) => {
  const { messageType = "text", content, isInternalNote = false } = req.body;

  if (!content) {
    return res.status(400).json({
      success: false,
      message: "Message content is required",
    });
  }

  // Internal notes validation
  if (isInternalNote) {
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can add internal notes",
      });
    }

    if (!content.text || content.text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Internal note text is required",
      });
    }

    if (content.text.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Internal note too long (max 1000 characters)",
      });
    }

    return next();
  }

  // Regular message validation
  switch (messageType) {
    case "text":
      if (!content.text || content.text.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Text content is required for text messages",
        });
      }
      if (content.text.length > 2000) {
        return res.status(400).json({
          success: false,
          message: "Support message too long (max 2000 characters)",
        });
      }
      break;

    case "image":
      if (
        !content.images ||
        !Array.isArray(content.images) ||
        content.images.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Images are required for image messages",
        });
      }
      if (content.images.length > 5) {
        return res.status(400).json({
          success: false,
          message: "Too many images (max 5 for support)",
        });
      }
      break;

    case "file":
      if (
        !content.files ||
        !Array.isArray(content.files) ||
        content.files.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Files are required for file messages",
        });
      }
      if (content.files.length > 3) {
        return res.status(400).json({
          success: false,
          message: "Too many files (max 3 for support)",
        });
      }
      break;
  }

  next();
};

const validateTicketStatusUpdate = (req, res, next) => {
  const { status, resolutionNotes } = req.body;

  if (!status) {
    return res.status(400).json({
      success: false,
      message: "Status is required",
    });
  }

  const validStatuses = [
    "open",
    "in_progress",
    "waiting_response",
    "resolved",
    "closed",
  ];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status",
    });
  }

  // Resolution notes required for resolved status
  if (status === "resolved") {
    if (!resolutionNotes || resolutionNotes.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Resolution notes are required when resolving a ticket",
      });
    }

    if (resolutionNotes.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Resolution notes too long (max 1000 characters)",
      });
    }
  }

  next();
};

const validateAdminAccess = (req, res, next) => {
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
    });
  }
  next();
};

const validateSellerOrAdminAccess = (req, res, next) => {
  const allowedRoles = ["seller", "admin", "super_admin"];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: "Seller or Admin access required",
    });
  }
  next();
};

// ============ TICKET MANAGEMENT ROUTES ============

/**
 * @route   POST /api/support/tickets
 * @desc    Create new support ticket
 * @access  Authenticated users (Seller, Admin)
 * @body    { category, subject, description, priority?, attachments? }
 */
router.post(
  "/tickets",
  validateSellerOrAdminAccess,
  validateSupportTicketData,
  createSupportTicket
);

/**
 * @route   GET /api/support/tickets
 * @desc    Get user's support tickets
 * @access  Authenticated users (Seller, Admin)
 * @query   page, limit, status, category, assigned (admin only)
 */
router.get(
  "/tickets",
  validateSellerOrAdminAccess,
  validatePagination,
  (req, res, next) => {
    // Validate query parameters
    const { status, category, assigned } = req.query;

    if (status && status !== "all") {
      const validStatuses = [
        "open",
        "in_progress",
        "waiting_response",
        "resolved",
        "closed",
      ];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status filter",
        });
      }
    }

    if (category && category !== "all") {
      const validCategories = [
        "technical_issue",
        "account_verification",
        "payment_dispute",
        "business_inquiry",
        "product_issue",
        "subscription_support",
        "general_support",
        "report_abuse",
      ];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category filter",
        });
      }
    }

    if (assigned && assigned !== "all" && assigned !== "assigned") {
      return res.status(400).json({
        success: false,
        message: 'Invalid assigned filter. Use "all" or "assigned"',
      });
    }

    next();
  },
  getSupportTickets
);

/**
 * @route   GET /api/support/tickets/:id
 * @desc    Get support ticket details
 * @access  Authenticated users (Ticket participants)
 */
router.get("/tickets/:id", validateObjectId("id"), getSupportTicketDetails);

/**
 * @route   PUT /api/support/tickets/:id/status
 * @desc    Update ticket status
 * @access  Authenticated admins
 * @body    { status, resolutionNotes? }
 */
router.put(
  "/tickets/:id/status",
  validateObjectId("id"),
  validateAdminAccess,
  validateTicketStatusUpdate,
  updateTicketStatus
);

/**
 * @route   PUT /api/support/tickets/:id/assign
 * @desc    Assign ticket to admin
 * @access  Authenticated admins
 * @body    { adminId }
 */
router.put(
  "/tickets/:id/assign",
  validateObjectId("id"),
  validateAdminAccess,
  (req, res, next) => {
    const { adminId } = req.body;

    if (!adminId || !/^[0-9a-fA-F]{24}$/.test(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Valid admin ID is required",
      });
    }

    next();
  },
  assignTicket
);

// ============ MESSAGING ROUTES ============

/**
 * @route   POST /api/support/tickets/:id/messages
 * @desc    Send message to support ticket
 * @access  Authenticated users (Ticket participants)
 * @body    { messageType?, content, isInternalNote? }
 */
router.post(
  "/tickets/:id/messages",
  validateObjectId("id"),
  validateSupportMessageContent,
  sendSupportMessage
);

/**
 * @route   GET /api/support/tickets/:id/messages
 * @desc    Get support ticket messages
 * @access  Authenticated users (Ticket participants)
 * @query   page, limit, includeInternal (admin only)
 */
router.get(
  "/tickets/:id/messages",
  validateObjectId("id"),
  validatePagination,
  (req, res, next) => {
    const { includeInternal } = req.query;

    // Only admins can view internal notes
    if (includeInternal === "true") {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return res.status(403).json({
          success: false,
          message: "Only admins can view internal notes",
        });
      }
    }

    next();
  },
  getSupportMessages
);

// ============ ADMIN SPECIFIC ROUTES ============

/**
 * @route   GET /api/support/admin/dashboard
 * @desc    Get admin support dashboard data
 * @access  Authenticated admins
 */
router.get("/admin/dashboard", validateAdminAccess, async (req, res) => {
  try {
    const SupportTicket = require("../models/SupportTicket");
    const { id: adminId } = req.user;

    // Get ticket counts by status
    const statusCounts = await SupportTicket.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Get assigned tickets count
    const assignedTickets = await SupportTicket.countDocuments({
      "assignedTo.userId": adminId,
    });

    // Get unassigned tickets count
    const unassignedTickets = await SupportTicket.countDocuments({
      assignedTo: { $exists: false },
      status: { $in: ["open", "in_progress"] },
    });

    // Get tickets by priority
    const priorityCounts = await SupportTicket.aggregate([
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]);

    // Get tickets by category
    const categoryCounts = await SupportTicket.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);

    // Recent tickets
    const recentTickets = await SupportTicket.find()
      .populate(
        "requester.userId",
        "firstName lastName businessInfo.businessName"
      )
      .sort({ createdAt: -1 })
      .limit(10)
      .select("ticketNumber subject status priority category createdAt");

    res.json({
      success: true,
      data: {
        statusCounts: statusCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        assignedTickets,
        unassignedTickets,
        priorityCounts: priorityCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        categoryCounts: categoryCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recentTickets,
      },
    });
  } catch (error) {
    console.error("Error getting admin dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get dashboard data",
    });
  }
});

/**
 * @route   GET /api/support/admin/available-admins
 * @desc    Get list of available admins for assignment
 * @access  Authenticated admins
 */
router.get("/admin/available-admins", validateAdminAccess, async (req, res) => {
  try {
    const Admin = require("../models/Admin");
    const { department } = req.query;

    let query = {
      isActive: true,
      status: "active",
    };

    if (department) {
      query.department = department;
    }

    const admins = await Admin.find(query)
      .select("firstName lastName department email")
      .sort({ firstName: 1 });

    res.json({
      success: true,
      data: { admins },
    });
  } catch (error) {
    console.error("Error getting available admins:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get available admins",
    });
  }
});

/**
 * @route   PUT /api/support/tickets/:id/escalate
 * @desc    Escalate ticket to another admin
 * @access  Authenticated admins
 * @body    { toAdminId, reason }
 */
router.put(
  "/tickets/:id/escalate",
  validateObjectId("id"),
  validateAdminAccess,
  async (req, res) => {
    try {
      const { id: ticketId } = req.params;
      const { toAdminId, reason } = req.body;
      const { id: fromAdminId } = req.user;

      // Validation
      if (!toAdminId || !/^[0-9a-fA-F]{24}$/.test(toAdminId)) {
        return res.status(400).json({
          success: false,
          message: "Valid target admin ID is required",
        });
      }

      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Escalation reason is required",
        });
      }

      const SupportTicket = require("../models/SupportTicket");
      const { validateUser } = require("../utils/fpHelpers");

      // Validate target admin exists
      const targetAdminExists = await validateUser("Admin", toAdminId);
      if (!targetAdminExists) {
        return res.status(400).json({
          success: false,
          message: "Target admin not found",
        });
      }

      // Update ticket
      const ticket = await SupportTicket.findByIdAndUpdate(
        ticketId,
        {
          $set: {
            "assignedTo.userId": toAdminId,
          },
          $push: {
            escalations: {
              fromAdmin: fromAdminId,
              toAdmin: toAdminId,
              reason: reason.trim(),
              escalatedAt: new Date(),
            },
          },
        },
        { new: true }
      );

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found",
        });
      }

      res.json({
        success: true,
        message: "Ticket escalated successfully",
        data: { ticket },
      });
    } catch (error) {
      console.error("Error escalating ticket:", error);
      res.status(500).json({
        success: false,
        message: "Failed to escalate ticket",
      });
    }
  }
);

// ============ UTILITY ROUTES ============

/**
 * @route   GET /api/support/stats
 * @desc    Get user's support statistics
 * @access  Authenticated users
 */
router.get("/stats", validateSellerOrAdminAccess, async (req, res) => {
  try {
    const { id: userId, role: userType } = req.user;
    const SupportTicket = require("../models/SupportTicket");

    let stats = {};

    if (userType === "Seller") {
      // Seller statistics
      const totalTickets = await SupportTicket.countDocuments({
        "requester.userId": userId,
        "requester.userType": "Seller",
      });

      const openTickets = await SupportTicket.countDocuments({
        "requester.userId": userId,
        "requester.userType": "Seller",
        status: { $in: ["open", "in_progress", "waiting_response"] },
      });

      const resolvedTickets = await SupportTicket.countDocuments({
        "requester.userId": userId,
        "requester.userType": "Seller",
        status: "resolved",
      });

      stats = {
        totalTickets,
        openTickets,
        resolvedTickets,
        closedTickets: totalTickets - openTickets - resolvedTickets,
      };
    } else if (userType === "Admin") {
      // Admin statistics
      const assignedTickets = await SupportTicket.countDocuments({
        "assignedTo.userId": userId,
      });

      const activeAssignedTickets = await SupportTicket.countDocuments({
        "assignedTo.userId": userId,
        status: { $in: ["open", "in_progress", "waiting_response"] },
      });

      const resolvedByAdmin = await SupportTicket.countDocuments({
        "resolution.resolvedBy": userId,
      });

      const totalUnassigned = await SupportTicket.countDocuments({
        assignedTo: { $exists: false },
        status: { $in: ["open", "in_progress"] },
      });

      stats = {
        assignedTickets,
        activeAssignedTickets,
        resolvedByAdmin,
        totalUnassigned,
      };
    }

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error getting support stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get support statistics",
    });
  }
});

/**
 * @route   GET /api/support/categories
 * @desc    Get support categories
 * @access  Authenticated users
 */
router.get("/categories", (req, res) => {
  const categories = [
    { value: "technical_issue", label: "Technical Issue", department: "tech" },
    {
      value: "account_verification",
      label: "Account Verification",
      department: "customer_support",
    },
    {
      value: "payment_dispute",
      label: "Payment Dispute",
      department: "finance",
    },
    {
      value: "business_inquiry",
      label: "Business Inquiry",
      department: "business_development",
    },
    {
      value: "product_issue",
      label: "Product Issue",
      department: "customer_support",
    },
    {
      value: "subscription_support",
      label: "Subscription Support",
      department: "customer_support",
    },
    {
      value: "general_support",
      label: "General Support",
      department: "customer_support",
    },
    {
      value: "report_abuse",
      label: "Report Abuse",
      department: "content_moderation",
    },
  ];

  res.json({
    success: true,
    data: { categories },
  });
});

// ============ ERROR HANDLING ============

// Handle 404 for support routes
router.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Support endpoint not found",
  });
});

module.exports = router;
