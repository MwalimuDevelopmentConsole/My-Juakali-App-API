// routes/notificationRoutes.js - Complete Notification API Routes

const express = require("express");
const router = express.Router();

const {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  createNotification,
  sendSystemBroadcast,
  getNotificationStats,
  updateNotificationPreferences,
  getDeliveryStats,
} = require("../controllers/notificationController");
const { authenticateToken } = require("../middleware/auth");

router.use(authenticateToken);

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

const validateNotificationFilters = (req, res, next) => {
  const { type, isRead, priority } = req.query;

  if (type && type !== "all") {
    const validTypes = [
      "message",
      "support_ticket",
      "support_response",
      "system_alert",
      "product_inquiry",
      "verification_update",
      "subscription_reminder",
    ];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification type filter",
      });
    }
  }

  if (isRead && isRead !== "all" && isRead !== "true" && isRead !== "false") {
    return res.status(400).json({
      success: false,
      message: 'Invalid isRead filter. Use "true", "false", or "all"',
    });
  }

  if (priority && priority !== "all") {
    const validPriorities = ["low", "medium", "high", "urgent"];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority filter",
      });
    }
  }

  next();
};

const validateCreateNotification = (req, res, next) => {
  const {
    recipients,
    type,
    title,
    message,
    channels = ["push"],
    priority = "medium",
  } = req.body;

  // Validate recipients
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Recipients array is required and cannot be empty",
    });
  }

  if (recipients.length > 1000) {
    return res.status(400).json({
      success: false,
      message: "Too many recipients (max 1000)",
    });
  }

  // Validate recipient format
  for (const recipient of recipients) {
    if (!recipient.userType || !recipient.userId) {
      return res.status(400).json({
        success: false,
        message: "Each recipient must have userType and userId",
      });
    }

    const validUserTypes = ["Buyer", "Seller", "Admin"];
    if (!validUserTypes.includes(recipient.userType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userType in recipients",
      });
    }

    if (!/^[0-9a-fA-F]{24}$/.test(recipient.userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId format in recipients",
      });
    }
  }

  // Validate required fields
  if (!type || !title || !message) {
    return res.status(400).json({
      success: false,
      message: "Type, title, and message are required",
    });
  }

  // Validate type
  const validTypes = [
    "message",
    "support_ticket",
    "support_response",
    "system_alert",
    "product_inquiry",
    "verification_update",
    "subscription_reminder",
    "custom",
  ];

  if (!validTypes.includes(type)) {
    return res.status(400).json({
      success: false,
      message: "Invalid notification type",
    });
  }

  // Validate title and message length
  if (title.length < 1 || title.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Title must be between 1 and 100 characters",
    });
  }

  if (message.length < 1 || message.length > 500) {
    return res.status(400).json({
      success: false,
      message: "Message must be between 1 and 500 characters",
    });
  }

  // Validate channels
  if (!Array.isArray(channels) || channels.length === 0) {
    return res.status(400).json({
      success: false,
      message: "At least one delivery channel is required",
    });
  }

  const validChannels = ["push", "email", "sms"];
  for (const channel of channels) {
    if (!validChannels.includes(channel)) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery channel",
      });
    }
  }

  // Validate priority
  const validPriorities = ["low", "medium", "high", "urgent"];
  if (!validPriorities.includes(priority)) {
    return res.status(400).json({
      success: false,
      message: "Invalid priority",
    });
  }

  next();
};

const validateBroadcast = (req, res, next) => {
  const {
    message,
    targetUserTypes = ["Buyer", "Seller"],
    priority = "high",
    channels = ["push", "email"],
  } = req.body;

  if (!message || message.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: "Message is required",
    });
  }

  if (message.length > 1000) {
    return res.status(400).json({
      success: false,
      message: "Message too long (max 1000 characters)",
    });
  }

  if (!Array.isArray(targetUserTypes) || targetUserTypes.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Target user types are required",
    });
  }

  const validUserTypes = ["Buyer", "Seller", "Admin"];
  for (const userType of targetUserTypes) {
    if (!validUserTypes.includes(userType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid target user type",
      });
    }
  }

  const validPriorities = ["low", "medium", "high", "urgent"];
  if (!validPriorities.includes(priority)) {
    return res.status(400).json({
      success: false,
      message: "Invalid priority",
    });
  }

  const validChannels = ["push", "email", "sms"];
  if (!Array.isArray(channels)) {
    return res.status(400).json({
      success: false,
      message: "Channels must be an array",
    });
  }

  for (const channel of channels) {
    if (!validChannels.includes(channel)) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery channel",
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

const validatePreferences = (req, res, next) => {
  const { preferences } = req.body;

  if (!preferences || typeof preferences !== "object") {
    return res.status(400).json({
      success: false,
      message: "Preferences object is required",
    });
  }

  // Validate preferences structure (this can be customized based on your user models)
  const requiredChannels = ["push", "email", "sms"];
  const requiredNotificationTypes = [
    "newMessage",
    "newInquiry",
    "urgentUpdates",
  ];

  for (const channel of requiredChannels) {
    if (preferences[channel] && typeof preferences[channel] !== "object") {
      return res.status(400).json({
        success: false,
        message: `Invalid ${channel} preferences format`,
      });
    }
  }

  next();
};

// ============ NOTIFICATION ROUTES ============

/**
 * @route   GET /api/notifications
 * @desc    Get user's notifications
 * @access  Authenticated users
 * @query   page, limit, type, isRead, priority
 */
router.get(
  "/",
  validatePagination,
  validateNotificationFilters,
  getNotifications
);

/**
 * @route   GET /api/notifications/stats
 * @desc    Get user's notification statistics
 * @access  Authenticated users
 */
router.get("/stats", getNotificationStats);

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Authenticated users (notification recipient)
 */
router.put("/:id/read", validateObjectId("id"), markNotificationAsRead);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Authenticated users
 * @query   type (optional filter)
 */
router.put(
  "/read-all",
  (req, res, next) => {
    const { type } = req.query;

    if (type && type !== "all") {
      const validTypes = [
        "message",
        "support_ticket",
        "support_response",
        "system_alert",
        "product_inquiry",
        "verification_update",
        "subscription_reminder",
      ];

      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid notification type filter",
        });
      }
    }

    next();
  },
  markAllNotificationsAsRead
);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete notification
 * @access  Authenticated users (notification recipient)
 */
router.delete("/:id", validateObjectId("id"), deleteNotification);

/**
 * @route   GET /api/notifications/preferences
 * @desc    Get user's notification preferences
 * @access  Authenticated users
 */
router.get("/preferences", async (req, res) => {
  try {
    const { id: userId, role: userType } = req.user;
    const { getUserModel } = require("../utils/fpHelpers");

    const UserModel = getUserModel(userType);
    const user = await UserModel.findById(userId).select("preferences");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      data: {
        preferences: user.preferences?.notifications || {},
      },
    });
  } catch (error) {
    console.error("Error getting notification preferences:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get notification preferences",
    });
  }
});

/**
 * @route   PUT /api/notifications/preferences
 * @desc    Update user's notification preferences
 * @access  Authenticated users
 * @body    { preferences }
 */
router.put("/preferences", validatePreferences, updateNotificationPreferences);

// ============ ADMIN NOTIFICATION ROUTES ============

/**
 * @route   POST /api/notifications/create
 * @desc    Create custom notification
 * @access  Authenticated admins
 * @body    { recipients, type, title, message, data?, channels?, priority? }
 */
router.post(
  "/create",
  validateAdminAccess,
  validateCreateNotification,
  createNotification
);

/**
 * @route   POST /api/notifications/broadcast
 * @desc    Send system broadcast to all users
 * @access  Authenticated admins
 * @body    { message, targetUserTypes?, priority?, channels? }
 */
router.post(
  "/broadcast",
  validateAdminAccess,
  validateBroadcast,
  sendSystemBroadcast
);

/**
 * @route   GET /api/notifications/admin/delivery-stats
 * @desc    Get notification delivery statistics
 * @access  Authenticated admins
 * @query   startDate?, endDate?
 */
router.get(
  "/admin/delivery-stats",
  validateAdminAccess,
  (req, res, next) => {
    const { startDate, endDate } = req.query;

    // Validate date formats if provided
    if (startDate && isNaN(Date.parse(startDate))) {
      return res.status(400).json({
        success: false,
        message: "Invalid startDate format",
      });
    }

    if (endDate && isNaN(Date.parse(endDate))) {
      return res.status(400).json({
        success: false,
        message: "Invalid endDate format",
      });
    }

    next();
  },
  getDeliveryStats
);

/**
 * @route   GET /api/notifications/admin/templates
 * @desc    Get available notification templates
 * @access  Authenticated admins
 */
router.get("/admin/templates", validateAdminAccess, (req, res) => {
  const templates = {
    message: {
      buyer: {
        template: "new_message_buyer",
        title: "New message from seller",
        variables: ["senderName", "productTitle"],
      },
      seller: {
        template: "new_message_seller",
        title: "New message from buyer",
        variables: ["senderName", "productTitle"],
      },
      admin: {
        template: "new_message_admin",
        title: "New message",
        variables: ["senderName", "conversationType"],
      },
    },
    support_ticket: {
      admin: {
        template: "support_ticket_created",
        title: "New support ticket",
        variables: ["category", "subject", "ticketNumber", "priority"],
      },
      seller: {
        template: "support_ticket_confirmation",
        title: "Support ticket created",
        variables: ["ticketNumber", "category"],
      },
    },
    support_response: {
      seller: {
        template: "support_ticket_response",
        title: "Support ticket update",
        variables: ["ticketNumber", "adminName"],
      },
    },
    system_alert: {
      all: {
        template: "system_alert",
        title: "System Alert",
        variables: ["alertType", "message", "actionRequired"],
      },
    },
    custom: {
      all: {
        template: "custom",
        title: "Custom Notification",
        variables: ["customData"],
      },
    },
  };

  res.json({
    success: true,
    data: { templates },
  });
});

/**
 * @route   POST /api/notifications/admin/test
 * @desc    Send test notification (admin only)
 * @access  Authenticated admins
 * @body    { recipientId, recipientType, message? }
 */
router.post("/admin/test", validateAdminAccess, async (req, res) => {
  try {
    const {
      recipientId,
      recipientType,
      message = "This is a test notification",
    } = req.body;

    if (!recipientId || !recipientType) {
      return res.status(400).json({
        success: false,
        message: "Recipient ID and type are required",
      });
    }

    if (!/^[0-9a-fA-F]{24}$/.test(recipientId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid recipient ID format",
      });
    }

    const validUserTypes = ["Buyer", "Seller", "Admin"];
    if (!validUserTypes.includes(recipientType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid recipient type",
      });
    }

    // Create test notification
    const {
      createNotificationData,
      processNotificationDelivery,
    } = require("../controllers/notificationController");

    const notificationData = await createNotificationData(
      recipientType,
      recipientId,
      "system_alert",
      { adminId: req.user.id },
      {
        title: "Test Notification",
        message,
        template: "test_notification",
      }
    );

    const delivered = await processNotificationDelivery(
      notificationData,
      req.io
    );

    res.json({
      success: true,
      message: "Test notification sent successfully",
      data: { notification: delivered },
    });
  } catch (error) {
    console.error("Error sending test notification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send test notification",
    });
  }
});

// ============ WEBHOOK ROUTES (for external services) ============

/**
 * @route   POST /api/notifications/webhooks/email-delivery
 * @desc    Handle email delivery webhook
 * @access  Public (with verification)
 */
router.post("/webhooks/email-delivery", async (req, res) => {
  try {
    // Implement webhook verification based on your email service
    // For example, verify signature from SendGrid, AWS SES, etc.

    const { notificationId, status, timestamp, error } = req.body;

    if (!notificationId || !status) {
      return res.status(400).json({
        success: false,
        message: "Notification ID and status are required",
      });
    }

    // Update notification delivery status
    const updateData = {
      "delivery.email.delivered": status === "delivered",
      "delivery.email.deliveredAt":
        status === "delivered" ? new Date(timestamp) : undefined,
    };

    if (status === "opened") {
      updateData["delivery.email.opened"] = true;
      updateData["delivery.email.openedAt"] = new Date(timestamp);
    }

    if (error) {
      updateData["delivery.email.error"] = error;
    }

    await Notification.findByIdAndUpdate(notificationId, updateData);

    res.json({ success: true, message: "Webhook processed" });
  } catch (error) {
    console.error("Error processing email webhook:", error);
    res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
});

/**
 * @route   POST /api/notifications/webhooks/sms-delivery
 * @desc    Handle SMS delivery webhook
 * @access  Public (with verification)
 */
router.post("/webhooks/sms-delivery", async (req, res) => {
  try {
    // Implement webhook verification based on your SMS service
    // For example, verify signature from Twilio, AWS SNS, etc.

    const { notificationId, status, timestamp, error } = req.body;

    if (!notificationId || !status) {
      return res.status(400).json({
        success: false,
        message: "Notification ID and status are required",
      });
    }

    // Update notification delivery status
    const updateData = {
      "delivery.sms.delivered": status === "delivered",
      "delivery.sms.deliveredAt":
        status === "delivered" ? new Date(timestamp) : undefined,
    };

    if (error) {
      updateData["delivery.sms.error"] = error;
    }

    await Notification.findByIdAndUpdate(notificationId, updateData);

    res.json({ success: true, message: "Webhook processed" });
  } catch (error) {
    console.error("Error processing SMS webhook:", error);
    res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
});

// ============ ERROR HANDLING ============

// Handle 404 for notification routes
router.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Notification endpoint not found",
  });
});

module.exports = router;
