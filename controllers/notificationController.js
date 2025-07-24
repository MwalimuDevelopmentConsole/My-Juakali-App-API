const Notification = require("../models/Notification");

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Authenticated users
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, isRead } = req.query;
    const userId = req.user.id;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let filter = { recipient: userId };

    if (type) {
      filter.type = type;
    }

    if (isRead !== undefined) {
      filter.isRead = isRead === "true";
    }

    const notifications = await Notification.find(filter)
      .populate("relatedUser", "firstName lastName businessInfo.businessName")
      .populate("relatedProduct", "title media.images")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalNotifications = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      count: notifications.length,
      totalNotifications,
      unreadCount,
      notifications,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalNotifications / limitNum),
        hasNext: pageNum < Math.ceil(totalNotifications / limitNum),
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

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Authenticated users
const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: userId },
      {
        isRead: true,
        readAt: new Date(),
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
      notification,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Authenticated users
const markAllNotificationsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await Notification.updateMany(
      { recipient: userId, isRead: false },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Authenticated users
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOneAndDelete({
      _id: id,
      recipient: userId,
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Create notification (internal function)
const createNotification = async (notificationData) => {
  try {
    const notification = await Notification.create(notificationData);

    // TODO: Send push notification, email, or SMS based on user preferences
    // const user = await User.findById(notification.recipient);
    // if (user.preferences.notifications.push) {
    //   await sendPushNotification(notification);
    // }
    // if (user.preferences.notifications.email) {
    //   await sendEmailNotification(notification);
    // }

    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};

// @desc    Send notification to user (Admin)
// @route   POST /api/notifications/send
// @access  Admin only
const sendNotification = async (req, res) => {
  try {
    const {
      recipients, // Array of user IDs or 'all'
      type,
      title,
      message,
      actionUrl,
      deliveryMethods = ["push"],
    } = req.body;

    const admin = await Admin.findById(req.user.id);
    if (!admin.hasPermission("system", "notifications")) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    // Validation
    if (!title || !message || !type) {
      return res.status(400).json({
        success: false,
        message: "Title, message, and type are required",
      });
    }

    let targetUsers = [];

    if (recipients === "all") {
      // Send to all active users
      const allUsers = await Promise.all([
        Buyer.find({ isActive: true }).select("_id"),
        Seller.find({ isActive: true }).select("_id"),
        Marketer.find({ isActive: true }).select("_id"),
      ]);

      targetUsers = [
        ...allUsers[0].map((u) => u._id),
        ...allUsers[1].map((u) => u._id),
        ...allUsers[2].map((u) => u._id),
      ];
    } else if (Array.isArray(recipients)) {
      targetUsers = recipients;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Recipients must be an array of user IDs or "all"',
      });
    }

    // Create notifications for all recipients
    const notifications = await Promise.all(
      targetUsers.map((userId) =>
        createNotification({
          recipient: userId,
          type,
          title,
          message,
          actionUrl,
          deliveryMethods: {
            push: { sent: deliveryMethods.includes("push") },
            email: { sent: deliveryMethods.includes("email") },
            sms: { sent: deliveryMethods.includes("sms") },
          },
        })
      )
    );

    res.status(201).json({
      success: true,
      message: `Notifications sent to ${targetUsers.length} users`,
      notificationCount: notifications.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Get notification statistics (Admin)
// @route   GET /api/notifications/stats
// @access  Admin only
const getNotificationStats = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id);
    if (!admin.hasPermission("analytics", "view")) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    const { period = "month" } = req.query;

    let dateFilter;
    switch (period) {
      case "week":
        dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "quarter":
        dateFilter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Overall notification stats
    const overallStats = await Notification.aggregate([
      { $match: { createdAt: { $gte: dateFilter } } },
      {
        $group: {
          _id: null,
          totalNotifications: { $sum: 1 },
          readNotifications: { $sum: { $cond: ["$isRead", 1, 0] } },
          uniqueRecipients: { $addToSet: "$recipient" },
        },
      },
      {
        $addFields: {
          uniqueRecipientCount: { $size: "$uniqueRecipients" },
          readRate: {
            $multiply: [
              { $divide: ["$readNotifications", "$totalNotifications"] },
              100,
            ],
          },
        },
      },
    ]);

    // Notifications by type
    const typeStats = await Notification.aggregate([
      { $match: { createdAt: { $gte: dateFilter } } },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          readCount: { $sum: { $cond: ["$isRead", 1, 0] } },
        },
      },
      {
        $addFields: {
          readRate: { $multiply: [{ $divide: ["$readCount", "$count"] }, 100] },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Daily notification trends
    const dailyTrends = await Notification.aggregate([
      { $match: { createdAt: { $gte: dateFilter } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
          readCount: { $sum: { $cond: ["$isRead", 1, 0] } },
        },
      },
      {
        $addFields: {
          date: {
            $dateFromParts: {
              year: "$_id.year",
              month: "$_id.month",
              day: "$_id.day",
            },
          },
          readRate: { $multiply: [{ $divide: ["$readCount", "$count"] }, 100] },
        },
      },
      { $sort: { date: 1 } },
    ]);

    res.status(200).json({
      success: true,
      period,
      overallStats: overallStats[0] || {},
      typeStats,
      dailyTrends,
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
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  sendNotification,
  getNotificationStats,
  createNotification, // Export for internal use
};
