const Notification = require("../models/Notification");
const {
  createUserRef,
  validateUser,
  createErrorResponse,
  createSuccessResponse,
  createPaginationInfo,
  calculateSkip,
  getUserNotificationChannels,
  getNotificationTemplate,
  pipeAsync,
} = require("../utils/fpHelpers");

const { sendDirectNotification } = require("../utils/socketHelpers");

// ============ PURE BUSINESS LOGIC FUNCTIONS ============

/**
 * Create notification with proper validation
 */
const createNotificationData = async (
  recipientType,
  recipientId,
  type,
  data = {},
  customTemplate = null
) => {
  // Validate recipient
  const recipientExists = await validateUser(recipientType, recipientId);
  if (!recipientExists) {
    throw new Error("Invalid recipient");
  }

  // Get notification channels
  const channels = await getUserNotificationChannels(
    recipientType,
    recipientId
  );

  // Get notification template
  const template =
    customTemplate || getNotificationTemplate(type, recipientType, data);

  return {
    recipient: createUserRef(recipientType, recipientId),
    type,
    template: template.template,
    title: template.title,
    message: template.message,
    data,
    channels,
    priority: data.priority || "medium",
    relatedEntities: data.relatedEntities || [],
  };
};

/**
 * Bulk create notifications
 */
const createBulkNotifications = async (
  recipients,
  type,
  data = {},
  customTemplate = null
) => {
  const notifications = [];

  for (const recipient of recipients) {
    try {
      const notificationData = await createNotificationData(
        recipient.userType,
        recipient.userId,
        type,
        data,
        customTemplate
      );

      notifications.push(notificationData);
    } catch (error) {
      console.error(
        `Error creating notification for ${recipient.userType}_${recipient.userId}:`,
        error
      );
    }
  }

  return notifications;
};

/**
 * Filter notifications based on user preferences
 */
const filterNotificationsByPreferences = async (notifications) => {
  const filteredNotifications = [];

  for (const notification of notifications) {
    try {
      const { getUserModel } = require("../utils/fpHelpers");
      const UserModel = getUserModel(notification.recipient.userType);
      const user = await UserModel.findById(
        notification.recipient.userId
      ).select("preferences");

      if (!user) continue;

      // Check if user has notifications enabled for this type
      const prefs = user.preferences?.notifications || user.preferences;

      // Default to true if preferences not set
      let shouldSend = true;

      if (prefs) {
        switch (notification.type) {
          case "message":
            shouldSend =
              prefs.push?.newMessage !== false ||
              prefs.email?.newMessage !== false;
            break;
          case "support_ticket":
          case "support_response":
            shouldSend =
              prefs.email?.newInquiry !== false ||
              prefs.push?.newInquiry !== false;
            break;
          case "system_alert":
            shouldSend =
              prefs.email?.urgentUpdates !== false ||
              prefs.push?.newMessage !== false;
            break;
          default:
            shouldSend = true;
        }
      }

      if (shouldSend) {
        filteredNotifications.push(notification);
      }
    } catch (error) {
      console.error("Error filtering notification:", error);
      // Include notification on error to ensure delivery
      filteredNotifications.push(notification);
    }
  }

  return filteredNotifications;
};

/**
 * Process notification delivery
 */
const processNotificationDelivery = async (notification, io) => {
  try {
    // Save to database
    const savedNotification = await Notification.create(notification);

    // Send real-time notification if socket available
    if (io) {
      sendDirectNotification(io)(
        notification.recipient.userType,
        notification.recipient.userId,
        savedNotification
      );
    }

    // Mark push as sent (real-time delivery)
    if (notification.channels.includes("push")) {
      savedNotification.delivery.push.sent = true;
      savedNotification.delivery.push.sentAt = new Date();
      savedNotification.delivery.push.delivered = true;
      savedNotification.delivery.push.deliveredAt = new Date();
    }

    // Queue email delivery (implement your email service here)
    if (notification.channels.includes("email")) {
      await queueEmailNotification(savedNotification);
    }

    // Queue SMS delivery (implement your SMS service here)
    if (notification.channels.includes("sms")) {
      await queueSMSNotification(savedNotification);
    }

    await savedNotification.save();
    return savedNotification;
  } catch (error) {
    console.error("Error processing notification delivery:", error);
    throw error;
  }
};

/**
 * Queue email notification (placeholder)
 */
const queueEmailNotification = async (notification) => {
  try {
    // Implement your email service integration here
    // For example: AWS SES, SendGrid, Nodemailer, etc.

    console.log(`Queuing email notification: ${notification._id}`);

    // Mark as queued for now
    notification.delivery.email.sent = true;
    notification.delivery.email.sentAt = new Date();

    // In a real implementation, you would:
    // 1. Queue the email in a job queue (Redis, Bull, etc.)
    // 2. Process the queue with a background worker
    // 3. Update delivery status after sending
  } catch (error) {
    console.error("Error queuing email notification:", error);
    notification.delivery.email.error = error.message;
  }
};

/**
 * Queue SMS notification (placeholder)
 */
const queueSMSNotification = async (notification) => {
  try {
    // Implement your SMS service integration here
    // For example: Twilio, AWS SNS, Africa's Talking, etc.

    console.log(`Queuing SMS notification: ${notification._id}`);

    // Mark as queued for now
    notification.delivery.sms.sent = true;
    notification.delivery.sms.sentAt = new Date();

    // In a real implementation, you would:
    // 1. Queue the SMS in a job queue
    // 2. Process the queue with a background worker
    // 3. Update delivery status after sending
  } catch (error) {
    console.error("Error queuing SMS notification:", error);
    notification.delivery.sms.error = error.message;
  }
};

// ============ CONTROLLER FUNCTIONS ============

/**
 * Get user's notifications
 */
const getNotifications = async (req, res) => {
  try {
    const { id: userId, role: userType } = req.user;
    const {
      page = 1,
      limit = 20,
      type = "all",
      isRead = "all",
      priority = "all",
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = calculateSkip(pageNum, limitNum);

    // Build query
    const query = {
      "recipient.userId": userId,
      "recipient.userType": userType,
    };

    if (type !== "all") {
      query.type = type;
    }

    if (isRead !== "all") {
      query.isRead = isRead === "true";
    }

    if (priority !== "all") {
      query.priority = priority;
    }

    // Get notifications
    const notifications = await Notification.find(query)
      .populate("relatedEntities.entityId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalNotifications = await Notification.countDocuments(query);

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      "recipient.userId": userId,
      "recipient.userType": userType,
      isRead: false,
    });

    res.json(
      createSuccessResponse(
        {
          notifications,
          unreadCount,
          pagination: createPaginationInfo(
            pageNum,
            limitNum,
            totalNotifications
          ),
        },
        "Notifications retrieved successfully"
      )
    );
  } catch (error) {
    console.error("Error getting notifications:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to get notifications", 500));
  }
};

/**
 * Mark notification as read
 */
const markNotificationAsRead = async (req, res) => {
  try {
    const { id: notificationId } = req.params;
    const { id: userId, role: userType } = req.user;

    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        "recipient.userId": userId,
        "recipient.userType": userType,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true }
    );

    if (!notification) {
      return res
        .status(404)
        .json(createErrorResponse("Notification not found", 404));
    }

    res.json(
      createSuccessResponse(
        {
          notification,
        },
        "Notification marked as read"
      )
    );
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to mark notification as read", 500));
  }
};

/**
 * Mark all notifications as read
 */
const markAllNotificationsAsRead = async (req, res) => {
  try {
    const { id: userId, role: userType } = req.user;
    const { type } = req.query;

    const query = {
      "recipient.userId": userId,
      "recipient.userType": userType,
      isRead: false,
    };

    if (type && type !== "all") {
      query.type = type;
    }

    const result = await Notification.updateMany(query, {
      isRead: true,
      readAt: new Date(),
    });

    res.json(
      createSuccessResponse(
        {
          modifiedCount: result.modifiedCount,
        },
        `${result.modifiedCount} notifications marked as read`
      )
    );
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to mark notifications as read", 500));
  }
};

/**
 * Delete notification
 */
const deleteNotification = async (req, res) => {
  try {
    const { id: notificationId } = req.params;
    const { id: userId, role: userType } = req.user;

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      "recipient.userId": userId,
      "recipient.userType": userType,
    });

    if (!notification) {
      return res
        .status(404)
        .json(createErrorResponse("Notification not found", 404));
    }

    res.json(createSuccessResponse({}, "Notification deleted successfully"));
  } catch (error) {
    console.error("Error deleting notification:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to delete notification", 500));
  }
};

/**
 * Create notification (for admin use)
 */
const createNotification = async (req, res) => {
  try {
    const {
      recipients,
      type,
      title,
      message,
      data = {},
      channels = ["push"],
      priority = "medium",
      template = "custom",
    } = req.body;

    // Validate input
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res
        .status(400)
        .json(createErrorResponse("Recipients array is required"));
    }

    if (!type || !title || !message) {
      return res
        .status(400)
        .json(createErrorResponse("Type, title, and message are required"));
    }

    // Create custom template
    const customTemplate = {
      title,
      message,
      template,
    };

    // Create notifications
    const notificationData = await createBulkNotifications(
      recipients,
      type,
      {
        ...data,
        priority,
      },
      customTemplate
    );

    // Filter by user preferences
    const filteredNotifications = await filterNotificationsByPreferences(
      notificationData
    );

    // Process delivery
    const deliveredNotifications = [];
    for (const notification of filteredNotifications) {
      try {
        const delivered = await processNotificationDelivery(
          notification,
          req.io
        );
        deliveredNotifications.push(delivered);
      } catch (error) {
        console.error("Error delivering notification:", error);
      }
    }

    res.status(201).json(
      createSuccessResponse(
        {
          created: deliveredNotifications.length,
          total: recipients.length,
          notifications: deliveredNotifications,
        },
        `${deliveredNotifications.length} notifications created and delivered`
      )
    );
  } catch (error) {
    console.error("Error creating notification:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to create notification", 500));
  }
};

/**
 * Send system broadcast (admin only)
 */
const sendSystemBroadcast = async (req, res) => {
  try {
    const {
      message,
      targetUserTypes = ["Buyer", "Seller"],
      priority = "high",
      channels = ["push", "email"],
    } = req.body;

    if (!message) {
      return res.status(400).json(createErrorResponse("Message is required"));
    }

    // Get all active users of target types
    const recipients = [];

    for (const userType of targetUserTypes) {
      const { getUserModel } = require("../utils/fpHelpers");
      const UserModel = getUserModel(userType);

      const users = await UserModel.find({
        isActive: true,
        $or: [{ status: "active" }, { status: "pending" }],
      }).select("_id");

      for (const user of users) {
        recipients.push({
          userType,
          userId: user._id,
        });
      }
    }

    // Create custom template
    const customTemplate = {
      title: "System Announcement",
      message,
      template: "system_broadcast",
    };

    // Create notifications
    const notificationData = await createBulkNotifications(
      recipients,
      "system_alert",
      {
        priority,
        broadcastId: new Date().getTime(),
        adminId: req.user.id,
      },
      customTemplate
    );

    // Process delivery in batches to avoid overwhelming the system
    const batchSize = 100;
    let deliveredCount = 0;

    for (let i = 0; i < notificationData.length; i += batchSize) {
      const batch = notificationData.slice(i, i + batchSize);

      const batchPromises = batch.map((notification) =>
        processNotificationDelivery(notification, req.io).catch((error) => {
          console.error("Error in batch delivery:", error);
          return null;
        })
      );

      const batchResults = await Promise.allSettled(batchPromises);
      deliveredCount += batchResults.filter(
        (result) => result.status === "fulfilled" && result.value
      ).length;
    }

    res.json(
      createSuccessResponse(
        {
          delivered: deliveredCount,
          total: recipients.length,
          targetUserTypes,
        },
        `System broadcast sent to ${deliveredCount} users`
      )
    );
  } catch (error) {
    console.error("Error sending system broadcast:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to send system broadcast", 500));
  }
};

/**
 * Get notification statistics
 */
const getNotificationStats = async (req, res) => {
  try {
    const { id: userId, role: userType } = req.user;

    // Get counts by type
    const typeCounts = await Notification.aggregate([
      {
        $match: {
          "recipient.userId": userId,
          "recipient.userType": userType,
        },
      },
      {
        $group: {
          _id: "$type",
          total: { $sum: 1 },
          unread: { $sum: { $cond: [{ $eq: ["$isRead", false] }, 1, 0] } },
        },
      },
    ]);

    // Get counts by priority
    const priorityCounts = await Notification.aggregate([
      {
        $match: {
          "recipient.userId": userId,
          "recipient.userType": userType,
        },
      },
      {
        $group: {
          _id: "$priority",
          total: { $sum: 1 },
          unread: { $sum: { $cond: [{ $eq: ["$isRead", false] }, 1, 0] } },
        },
      },
    ]);

    // Get recent activity
    const recentNotifications = await Notification.find({
      "recipient.userId": userId,
      "recipient.userType": userType,
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("type title isRead createdAt priority");

    res.json(
      createSuccessResponse(
        {
          typeCounts: typeCounts.reduce((acc, item) => {
            acc[item._id] = item;
            return acc;
          }, {}),
          priorityCounts: priorityCounts.reduce((acc, item) => {
            acc[item._id] = item;
            return acc;
          }, {}),
          recentNotifications,
        },
        "Notification statistics retrieved successfully"
      )
    );
  } catch (error) {
    console.error("Error getting notification stats:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to get notification statistics", 500));
  }
};

/**
 * Update notification preferences
 */
const updateNotificationPreferences = async (req, res) => {
  try {
    const { id: userId, role: userType } = req.user;
    const { preferences } = req.body;

    if (!preferences) {
      return res
        .status(400)
        .json(createErrorResponse("Preferences are required"));
    }

    // Update user's notification preferences
    const { getUserModel } = require("../utils/fpHelpers");
    const UserModel = getUserModel(userType);

    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          "preferences.notifications": preferences,
        },
      },
      { new: true }
    ).select("preferences");

    if (!user) {
      return res.status(404).json(createErrorResponse("User not found", 404));
    }

    res.json(
      createSuccessResponse(
        {
          preferences: user.preferences?.notifications || preferences,
        },
        "Notification preferences updated successfully"
      )
    );
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    res
      .status(500)
      .json(
        createErrorResponse("Failed to update notification preferences", 500)
      );
  }
};

// ============ UTILITY FUNCTIONS ============

/**
 * Clean up expired notifications
 */
const cleanupExpiredNotifications = async () => {
  try {
    const result = await Notification.deleteMany({
      expiresAt: { $lt: new Date() },
    });

    console.log(`Cleaned up ${result.deletedCount} expired notifications`);
    return result.deletedCount;
  } catch (error) {
    console.error("Error cleaning up expired notifications:", error);
    return 0;
  }
};

/**
 * Get notification delivery statistics (admin only)
 */
const getDeliveryStats = async (req, res) => {
  try {
    // Admin access check would be in middleware
    const { startDate, endDate } = req.query;

    const matchQuery = {};

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const stats = await Notification.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pushSent: { $sum: { $cond: ["$delivery.push.sent", 1, 0] } },
          emailSent: { $sum: { $cond: ["$delivery.email.sent", 1, 0] } },
          smsSent: { $sum: { $cond: ["$delivery.sms.sent", 1, 0] } },
          pushDelivered: {
            $sum: { $cond: ["$delivery.push.delivered", 1, 0] },
          },
          emailDelivered: {
            $sum: { $cond: ["$delivery.email.delivered", 1, 0] },
          },
          smsDelivered: { $sum: { $cond: ["$delivery.sms.delivered", 1, 0] } },
        },
      },
    ]);

    res.json(
      createSuccessResponse(
        {
          stats: stats[0] || {
            total: 0,
            pushSent: 0,
            emailSent: 0,
            smsSent: 0,
            pushDelivered: 0,
            emailDelivered: 0,
            smsDelivered: 0,
          },
        },
        "Delivery statistics retrieved successfully"
      )
    );
  } catch (error) {
    console.error("Error getting delivery stats:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to get delivery statistics", 500));
  }
};

module.exports = {
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  createNotification,
  sendSystemBroadcast,
  getNotificationStats,
  updateNotificationPreferences,
  getDeliveryStats,
  cleanupExpiredNotifications,

  // Utility functions for internal use
  createNotificationData,
  createBulkNotifications,
  processNotificationDelivery,
};
