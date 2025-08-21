// socketSetup.js - Complete Socket.IO Server Configuration

const { Server } = require("socket.io");
const {
  handleConnection,
  socketAuthMiddleware,
  rateLimitMiddleware,
  getOnlineUsersCount,
} = require("./socketHandlers");
const allowedOrigins = require("./config/allowedOrigins");

// ============ SOCKET SERVER INITIALIZATION ============

/**
 * Initialize Socket.IO server with Express app
 */
const initializeSocketServer = (server, options = {}) => {
  const defaultOptions = {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 1e6, // 1MB
    allowEIO3: true,
  };

  const io = new Server(server, { ...defaultOptions, ...options });

  // Apply middleware
  setupSocketMiddleware(io);

  // Handle connections
  io.on("connection", handleConnection(io));

  // Setup admin namespace
  setupAdminNamespace(io);

  // Setup periodic tasks
  setupPeriodicTasks(io);

  // Error handling
  setupErrorHandling(io);

  console.log("✅ Socket.IO server initialized successfully");

  return io;
};

/**
 * Setup Socket.IO middleware
 */
const setupSocketMiddleware = (io) => {
  // Rate limiting middleware
  io.use(rateLimitMiddleware(200, 60000)); // 200 requests per minute

  // Authentication middleware
  io.use(socketAuthMiddleware);

  // CORS validation middleware
  io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;

    if (!origin || allowedOrigins.includes(origin)) {
      next();
    } else {
      next(new Error("CORS policy violation"));
    }
  });

  // Request logging middleware (in development)
  if (process.env.NODE_ENV === "development") {
    io.use((socket, next) => {
      console.log(
        `Socket middleware: ${socket.id} from ${socket.handshake.address}`
      );
      next();
    });
  }

  console.log("✅ Socket middleware configured");
};

/**
 * Setup admin namespace for admin-specific functionality
 */
const setupAdminNamespace = (io) => {
  const adminNamespace = io.of("/admin");

  // Admin-specific middleware
  adminNamespace.use(async (socket, next) => {
    try {
      const { userType } = socket.handshake.auth;

      if (userType !== "Admin") {
        return next(new Error("Admin access required"));
      }

      next();
    } catch (error) {
      next(new Error("Admin authentication failed"));
    }
  });

  // Admin connection handler
  adminNamespace.on("connection", (socket) => {
    console.log(`Admin connected: ${socket.id}`);

    // Join admin broadcast room
    socket.join("admin_broadcast");

    // Admin-specific events
    socket.on("get_system_stats", async () => {
      try {
        const stats = await getSystemStats(io);
        socket.emit("system_stats", stats);
      } catch (error) {
        socket.emit("error", { message: "Failed to get system stats" });
      }
    });

    socket.on("broadcast_to_users", async (data) => {
      try {
        const { message, targetUserTypes = ["Buyer", "Seller"] } = data;

        if (!message) {
          return socket.emit("error", { message: "Message is required" });
        }

        // Broadcast to specified user types
        targetUserTypes.forEach((userType) => {
          io.to(`presence_${userType.toLowerCase()}`).emit(
            "admin_announcement",
            {
              message,
              timestamp: new Date(),
              from: "System Administrator",
            }
          );
        });

        socket.emit("broadcast_sent", {
          message: "Broadcast sent successfully",
          targetUserTypes,
        });
      } catch (error) {
        socket.emit("error", { message: "Failed to send broadcast" });
      }
    });

    socket.on("force_disconnect_user", async (data) => {
      try {
        const { userId, userType, reason = "Administrative action" } = data;

        if (!userId || !userType) {
          return socket.emit("error", { message: "User ID and type required" });
        }

        // Find and disconnect user's sockets
        const sockets = await io.fetchSockets();
        const userSockets = sockets.filter(
          (s) => s.userId === userId && s.userType === userType
        );

        userSockets.forEach((userSocket) => {
          userSocket.emit("force_disconnect", { reason });
          userSocket.disconnect();
        });

        socket.emit("user_disconnected", {
          userId,
          userType,
          socketsDisconnected: userSockets.length,
        });
      } catch (error) {
        socket.emit("error", { message: "Failed to disconnect user" });
      }
    });

    socket.on("disconnect", () => {
      console.log(`Admin disconnected: ${socket.id}`);
    });
  });

  console.log("✅ Admin namespace configured");
};

/**
 * Setup periodic tasks
 */
const setupPeriodicTasks = (io) => {
  // Broadcast system stats to admins every 30 seconds
  setInterval(async () => {
    try {
      const stats = await getSystemStats(io);
      io.of("/admin").to("admin_broadcast").emit("system_stats_update", stats);
    } catch (error) {
      console.error("Error broadcasting system stats:", error);
    }
  }, 30000);

  // Clean up inactive sockets every 5 minutes
  setInterval(async () => {
    try {
      const sockets = await io.fetchSockets();
      let cleanedUp = 0;

      for (const socket of sockets) {
        // Check if socket has been inactive for more than 10 minutes
        const lastActivity = socket.data?.lastActivity || socket.handshake.time;
        const inactiveTime = Date.now() - lastActivity;

        if (inactiveTime > 10 * 60 * 1000) {
          // 10 minutes
          socket.disconnect();
          cleanedUp++;
        }
      }

      if (cleanedUp > 0) {
        console.log(`Cleaned up ${cleanedUp} inactive sockets`);
      }
    } catch (error) {
      console.error("Error cleaning up inactive sockets:", error);
    }
  }, 5 * 60 * 1000);

  // Periodic notification cleanup
  setInterval(async () => {
    try {
      const {
        cleanupExpiredNotifications,
      } = require("./controllers/notificationController");
      const cleaned = await cleanupExpiredNotifications();

      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} expired notifications`);
      }
    } catch (error) {
      console.error("Error cleaning up notifications:", error);
    }
  }, 60 * 60 * 1000); // Every hour

  console.log("✅ Periodic tasks configured");
};

/**
 * Setup error handling
 */
const setupErrorHandling = (io) => {
  io.engine.on("connection_error", (err) => {
    console.error("Socket connection error:", {
      code: err.code,
      message: err.message,
      context: err.context,
      type: err.type,
    });
  });

  // Handle uncaught socket errors
  process.on("uncaughtException", (error) => {
    if (error.message?.includes("socket")) {
      console.error("Uncaught socket exception:", error);
      // Don't exit process for socket errors
    }
  });

  console.log("✅ Error handling configured");
};

/**
 * Get system statistics
 */
const getSystemStats = async (io) => {
  try {
    const onlineUsers = getOnlineUsersCount(io);
    const sockets = await io.fetchSockets();

    // Get database stats
    const Conversation = require("./models/Conversation");
    const Message = require("./models/Message");
    const SupportTicket = require("./models/SupportTicket");
    const Notification = require("./models/Notification");

    const [
      totalConversations,
      activeConversations,
      totalMessages,
      todayMessages,
      openSupportTickets,
      unreadNotifications,
    ] = await Promise.all([
      Conversation.countDocuments(),
      Conversation.countDocuments({ status: "active" }),
      Message.countDocuments(),
      Message.countDocuments({
        createdAt: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      }),
      SupportTicket.countDocuments({
        status: { $in: ["open", "in_progress"] },
      }),
      Notification.countDocuments({ isRead: false }),
    ]);

    return {
      onlineUsers,
      totalSockets: sockets.length,
      conversations: {
        total: totalConversations,
        active: activeConversations,
      },
      messages: {
        total: totalMessages,
        today: todayMessages,
      },
      support: {
        openTickets: openSupportTickets,
      },
      notifications: {
        unread: unreadNotifications,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error("Error getting system stats:", error);
    return {
      error: "Failed to get system stats",
      timestamp: new Date(),
    };
  }
};

// ============ MIDDLEWARE FOR EXPRESS ROUTES ============

/**
 * Attach Socket.IO instance to Express requests
 */
const attachSocketIO = (io) => {
  return (req, res, next) => {
    req.io = io;
    next();
  };
};

/**
 * Middleware to check if user is online
 */
const checkUserOnlineStatus = (io) => {
  return async (req, res, next) => {
    try {
      const { userId, userType } = req.params;

      if (!userId || !userType) {
        return next();
      }

      const sockets = await io.fetchSockets();
      const userSocket = sockets.find(
        (socket) => socket.userId === userId && socket.userType === userType
      );

      req.userOnlineStatus = {
        isOnline: !!userSocket,
        lastSeen: userSocket?.data?.lastActivity || null,
      };

      next();
    } catch (error) {
      console.error("Error checking user online status:", error);
      req.userOnlineStatus = { isOnline: false, lastSeen: null };
      next();
    }
  };
};

// ============ SOCKET MANAGEMENT UTILITIES ============

/**
 * Send message to specific user
 */
const sendToUser = async (io, userType, userId, event, data) => {
  try {
    const { getUserRoom } = require("./utils/socketHelpers");
    const userRoom = getUserRoom(userType, userId);

    io.to(userRoom).emit(event, {
      ...data,
      timestamp: new Date(),
    });

    return true;
  } catch (error) {
    console.error("Error sending to user:", error);
    return false;
  }
};

/**
 * Send message to conversation participants
 */
const sendToConversation = async (
  io,
  conversationId,
  event,
  data,
  excludeUserId = null
) => {
  try {
    const { getConversationRoom } = require("./utils/socketHelpers");
    const conversationRoom = getConversationRoom(conversationId);

    if (excludeUserId) {
      const sockets = await io.in(conversationRoom).fetchSockets();
      const targetSockets = sockets.filter(
        (socket) => socket.userId !== excludeUserId
      );

      targetSockets.forEach((socket) => {
        socket.emit(event, {
          ...data,
          timestamp: new Date(),
        });
      });
    } else {
      io.to(conversationRoom).emit(event, {
        ...data,
        timestamp: new Date(),
      });
    }

    return true;
  } catch (error) {
    console.error("Error sending to conversation:", error);
    return false;
  }
};

/**
 * Get active users count by type
 */
const getActiveUsersByType = async (io, userType) => {
  try {
    const sockets = await io.fetchSockets();
    return sockets.filter((socket) => socket.userType === userType).length;
  } catch (error) {
    console.error("Error getting active users by type:", error);
    return 0;
  }
};

// ============ GRACEFUL SHUTDOWN ============

/**
 * Gracefully shutdown socket server
 */
const gracefulShutdown = (io) => {
  return async () => {
    console.log("🔄 Gracefully shutting down Socket.IO server...");

    try {
      // Notify all connected clients
      io.emit("server_shutdown", {
        message: "Server is shutting down. Please reconnect in a moment.",
        timestamp: new Date(),
      });

      // Wait a bit for messages to be sent
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Close all connections
      const sockets = await io.fetchSockets();
      sockets.forEach((socket) => socket.disconnect(true));

      // Close the server
      io.close();

      console.log("✅ Socket.IO server shutdown complete");
    } catch (error) {
      console.error("❌ Error during Socket.IO shutdown:", error);
    }
  };
};

// ============ EXPORTS ============

module.exports = {
  initializeSocketServer,
  attachSocketIO,
  checkUserOnlineStatus,
  sendToUser,
  sendToConversation,
  getActiveUsersByType,
  gracefulShutdown,
  getSystemStats,
};

// ============ USAGE EXAMPLE ============

/*
// In your main server file (app.js or server.js):

const express = require('express');
const http = require('http');
const { initializeSocketServer, attachSocketIO, gracefulShutdown } = require('./socketSetup');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = initializeSocketServer(server, {
  // Custom options if needed
  cors: {
    origin: process.env.CLIENT_URLS?.split(',') || ["http://localhost:3000"]
  }
});

// Attach Socket.IO to Express requests
app.use(attachSocketIO(io));

// Your routes
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/support', require('./routes/supportRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown handling
const shutdown = gracefulShutdown(io);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

*/
