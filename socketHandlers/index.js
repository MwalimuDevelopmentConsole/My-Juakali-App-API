const {
  initializeSocketConnection,
  cleanupSocketConnection,
  joinConversationRoom,
  leaveConversationRoom,
  joinSupportRoom,
  leaveSupportRoom,
  joinPresenceRoom,
  leavePresenceRoom,
  handleTypingStart,
  handleTypingStop,
  handleSupportTyping,
  handleSocketError,
  validateSocketAuth,
  createRateLimit,
  getConversationRoom,
  getUserRoom,
  getMessagePreview,
} = require("../utils/socketHelpers");
const jwt = require("jsonwebtoken");
const { validateUser } = require("../utils/fpHelpers");

// Create rate limiters for different events
const messageRateLimit = createRateLimit(30, 60000); // 30 messages per minute
const typingRateLimit = createRateLimit(60, 60000); // 60 typing events per minute
const joinRoomRateLimit = createRateLimit(100, 60000); // 100 room joins per minute

// ============ SOCKET CONNECTION MANAGEMENT ============

/**
 * Handle new socket connection
 */
const handleConnection = (io) => async (socket) => {
  console.log(`New socket connection: ${socket.id}`);

  try {
    // Extract user info from socket handshake
    const { userId, userType, token } = socket.handshake.auth;

    if (!userId || !userType) {
      socket.emit("error", { message: "Missing authentication data" });
      socket.disconnect();
      return;
    }

    // Validate user exists and is active
    const userExists = await validateUser(userType, userId);
    if (!userExists) {
      socket.emit("error", { message: "Invalid user credentials" });
      socket.disconnect();
      return;
    }

    // Initialize socket connection
    const userInfo = await getUserInfo(userType, userId);
    const connectionData = initializeSocketConnection(socket, {
      userId,
      userType,
      userInfo,
    });

    // Join presence room
    joinPresenceRoom(io)(socket);

    // Emit successful connection
    socket.emit("connected", {
      message: "Successfully connected to chat server",
      userKey: connectionData.userKey,
      timestamp: new Date(),
    });

    // Set up event handlers
    setupEventHandlers(io, socket);
  } catch (error) {
    console.error("Error handling socket connection:", error);
    socket.emit("error", { message: "Connection failed" });
    socket.disconnect();
  }
};

/**
 * Get user info for socket connection
 */
const getUserInfo = async (userType, userId) => {
  const { getUserModel } = require("../utils/fpHelpers");
  const UserModel = getUserModel(userType);

  const user = await UserModel.findById(userId).select(
    "firstName lastName businessInfo.businessName avatar"
  );

  return {
    id: userId,
    name: user?.firstName || user?.businessInfo?.businessName || "User",
    fullName: user?.fullName || user?.businessInfo?.businessName || "User",
    avatar: user?.avatar?.url || null,
  };
};

/**
 * Set up socket event handlers
 */
const setupEventHandlers = (io, socket) => {
  // ============ CONVERSATION EVENTS ============

  /**
   * Join conversation room
   */
  socket.on("join_conversation", async (data) => {
    try {
      if (!validateSocketAuth(socket)) {
        return socket.emit("error", { message: "Not authenticated" });
      }

      if (!joinRoomRateLimit(socket, "join_conversation")) {
        return socket.emit("error", {
          message: "Rate limit exceeded for joining rooms",
        });
      }

      const { conversationId } = data;

      if (!conversationId || !/^[0-9a-fA-F]{24}$/.test(conversationId)) {
        return socket.emit("error", { message: "Invalid conversation ID" });
      }

      // Validate user has access to conversation
      const Conversation = require("../models/Conversation");
      const { isParticipant } = require("../utils/fpHelpers");

      const conversation = await Conversation.findById(conversationId);
      if (
        !conversation ||
        !isParticipant(socket.userId, socket.userType)(conversation)
      ) {
        return socket.emit("error", {
          message: "Access denied to conversation",
        });
      }

      // Join room
      const rooms = joinConversationRoom(io)(socket, conversationId);

      socket.emit("conversation_joined", {
        conversationId,
        rooms: [rooms.conversationRoom, rooms.typingRoom],
        timestamp: new Date(),
      });
    } catch (error) {
      handleSocketError(socket, error, "join_conversation");
    }
  });

  /**
   * Leave conversation room
   */
  socket.on("leave_conversation", (data) => {
    try {
      if (!validateSocketAuth(socket)) {
        return socket.emit("error", { message: "Not authenticated" });
      }

      const { conversationId } = data;

      if (!conversationId) {
        return socket.emit("error", { message: "Conversation ID required" });
      }

      leaveConversationRoom(io)(socket, conversationId);

      socket.emit("conversation_left", {
        conversationId,
        timestamp: new Date(),
      });
    } catch (error) {
      handleSocketError(socket, error, "leave_conversation");
    }
  });

  // ============ TYPING INDICATORS ============

  /**
   * Handle typing start
   */
  socket.on("typing_start", (data) => {
    try {
      if (!validateSocketAuth(socket)) {
        return socket.emit("error", { message: "Not authenticated" });
      }

      if (!typingRateLimit(socket, "typing_start")) {
        return socket.emit("error", {
          message: "Rate limit exceeded for typing events",
        });
      }

      const { conversationId } = data;

      if (!conversationId || !/^[0-9a-fA-F]{24}$/.test(conversationId)) {
        return socket.emit("error", { message: "Invalid conversation ID" });
      }

      handleTypingStart(io)(socket, conversationId);
    } catch (error) {
      handleSocketError(socket, error, "typing_start");
    }
  });

  /**
   * Handle typing stop
   */
  socket.on("typing_stop", (data) => {
    try {
      if (!validateSocketAuth(socket)) {
        return socket.emit("error", { message: "Not authenticated" });
      }

      const { conversationId } = data;

      if (!conversationId) {
        return socket.emit("error", { message: "Conversation ID required" });
      }

      handleTypingStop(io)(socket, conversationId);
    } catch (error) {
      handleSocketError(socket, error, "typing_stop");
    }
  });

  // ============ SUPPORT TICKET EVENTS ============

  /**
   * Join support ticket room
   */
  socket.on("join_support_ticket", async (data) => {
    try {
      if (!validateSocketAuth(socket)) {
        return socket.emit("error", { message: "Not authenticated" });
      }

      if (!joinRoomRateLimit(socket, "join_support_ticket")) {
        return socket.emit("error", {
          message: "Rate limit exceeded for joining rooms",
        });
      }

      const { ticketId } = data;

      if (!ticketId || !/^[0-9a-fA-F]{24}$/.test(ticketId)) {
        return socket.emit("error", { message: "Invalid ticket ID" });
      }

      // Validate user has access to ticket
      const SupportTicket = require("../models/SupportTicket");

      const ticket = await SupportTicket.findById(ticketId);
      if (!ticket) {
        return socket.emit("error", { message: "Support ticket not found" });
      }

      // Check access permissions
      const hasAccess =
        (ticket.requester.userId.toString() === socket.userId &&
          ticket.requester.userType === socket.userType) ||
        (ticket.assignedTo?.userId?.toString() === socket.userId &&
          socket.userType === "Admin") ||
        socket.userType === "Admin";

      if (!hasAccess) {
        return socket.emit("error", {
          message: "Access denied to support ticket",
        });
      }

      // Join room
      const supportRoom = joinSupportRoom(io)(socket, ticketId);

      socket.emit("support_ticket_joined", {
        ticketId,
        room: supportRoom,
        timestamp: new Date(),
      });
    } catch (error) {
      handleSocketError(socket, error, "join_support_ticket");
    }
  });

  /**
   * Leave support ticket room
   */
  socket.on("leave_support_ticket", (data) => {
    try {
      if (!validateSocketAuth(socket)) {
        return socket.emit("error", { message: "Not authenticated" });
      }

      const { ticketId } = data;

      if (!ticketId) {
        return socket.emit("error", { message: "Ticket ID required" });
      }

      leaveSupportRoom(io)(socket, ticketId);

      socket.emit("support_ticket_left", {
        ticketId,
        timestamp: new Date(),
      });
    } catch (error) {
      handleSocketError(socket, error, "leave_support_ticket");
    }
  });

  /**
   * Handle support typing
   */
  socket.on("support_typing", (data) => {
    try {
      if (!validateSocketAuth(socket)) {
        return socket.emit("error", { message: "Not authenticated" });
      }

      if (!typingRateLimit(socket, "support_typing")) {
        return socket.emit("error", {
          message: "Rate limit exceeded for typing events",
        });
      }

      const { ticketId, isTyping } = data;

      if (!ticketId || typeof isTyping !== "boolean") {
        return socket.emit("error", {
          message: "Ticket ID and typing status required",
        });
      }

      handleSupportTyping(io)(socket, ticketId, isTyping);
    } catch (error) {
      handleSocketError(socket, error, "support_typing");
    }
  });

  // ============ MESSAGE STATUS EVENTS ============

  /**
   * Handle message delivery acknowledgment
   */
  socket.on("message_delivered", async (data) => {
    try {
      if (!validateSocketAuth(socket)) {
        return socket.emit("error", { message: "Not authenticated" });
      }

      const { messageId } = data;

      if (!messageId || !/^[0-9a-fA-F]{24}$/.test(messageId)) {
        return socket.emit("error", { message: "Invalid message ID" });
      }

      // Update message delivery status in database
      const Message = require("../models/Message");
      const { handleMessageDelivered } = require("../utils/socketHelpers");

      await Message.updateOne(
        {
          _id: messageId,
          "recipients.userId": socket.userId,
          "recipients.userType": socket.userType,
        },
        {
          $set: {
            "recipients.$.deliveredAt": new Date(),
          },
        }
      );

      // Emit delivery confirmation
      handleMessageDelivered(io)(messageId, socket.userId, socket.userType);
    } catch (error) {
      handleSocketError(socket, error, "message_delivered");
    }
  });

  /**
   * Handle message read acknowledgment
   */
  socket.on("message_read", async (data) => {
    try {
      if (!validateSocketAuth(socket)) {
        return socket.emit("error", { message: "Not authenticated" });
      }

      const { messageId, conversationId } = data;

      if (!messageId || !/^[0-9a-fA-F]{24}$/.test(messageId)) {
        return socket.emit("error", { message: "Invalid message ID" });
      }

      // Update message read status in database
      const Message = require("../models/Message");
      const { handleMessageRead } = require("../utils/socketHelpers");

      await Message.updateOne(
        {
          _id: messageId,
          "recipients.userId": socket.userId,
          "recipients.userType": socket.userType,
        },
        {
          $set: {
            "recipients.$.readAt": new Date(),
            status: "read",
          },
        }
      );

      // Emit read confirmation if conversation ID provided
      if (conversationId) {
        handleMessageRead(io)(
          messageId,
          conversationId,
          socket.userId,
          socket.userType
        );
      }
    } catch (error) {
      handleSocketError(socket, error, "message_read");
    }
  });

  /**
   * Handle new message sent from frontend
   */
  socket.on("new_message_sent", async (data) => {
    try {
      if (!validateSocketAuth(socket)) {
        return socket.emit("error", { message: "Not authenticated" });
      }

      const { message, conversationId } = data;

      // Validate conversation access
      const Conversation = require("../models/Conversation");
      const conversation = await Conversation.findById(conversationId).populate(
        {
          path: "participants.user.userId",
          select: "firstName lastName businessInfo.businessName avatar",
        }
      );

      if (!conversation) {
        return socket.emit("error", { message: "Conversation not found" });
      }

      // Check if user is participant
      const isParticipant = conversation.participants.some(
        (p) =>
          p.user.userId._id.toString() === socket.userId &&
          p.user.userType === socket.userType &&
          !p.isDeleted
      );

      if (!isParticipant) {
        return socket.emit("error", {
          message: "Access denied to conversation",
        });
      }

      // Get other participants (recipients)
      const otherParticipants = conversation.participants.filter(
        (p) =>
          !(
            p.user.userId._id.toString() === socket.userId &&
            p.user.userType === socket.userType
          ) && !p.isDeleted
      );

      // Broadcast message to conversation room
      const conversationRoom = getConversationRoom(conversationId);
      socket.to(conversationRoom).emit("new_message", {
        ...message,
        sender: {
          ...message.sender,
          userId: {
            _id: message.sender.userId._id || message.sender.userId,
            firstName: socket.userInfo?.name?.split(" ")[0] || "User",
            lastName: socket.userInfo?.name?.split(" ")[1] || "",
            businessInfo: socket.userInfo?.businessInfo || {},
          },
        },
        timestamp: new Date(),
      });

      // Send to individual user rooms for offline/background users
      otherParticipants.forEach((participant) => {
        const userRoom = getUserRoom(
          participant.user.userType,
          participant.user.userId._id
        );

        io.to(userRoom).emit("message_notification", {
          conversationId,
          messageId: message._id,
          sender: message.sender,
          messageType: message.messageType,
          preview: getMessagePreview(message),
          unreadCount: participant.unreadCount + 1,
          timestamp: new Date(),
        });
      });

      console.log(`Message broadcast to conversation: ${conversationId}`);
    } catch (error) {
      console.error("Error handling new message:", error);
      socket.emit("error", { message: "Failed to broadcast message" });
    }
  });

  /**
   * Handle message read acknowledgment
   */
  socket.on("message_read", async (data) => {
    try {
      if (!validateSocketAuth(socket)) return;

      const { messageId, conversationId } = data;

      console.log("message to mark as read:", data);

      // Update message in database
      const Message = require("../models/Message");
      await Message.updateOne(
        {
          _id: messageId,
          "recipients.userId": socket.userId,
          "recipients.userType": socket.userType,
        },
        {
          $set: {
            "recipients.$.readAt": new Date(),
            status: "read",
          },
        }
      );

      // Notify sender about read status
      const conversationRoom = getConversationRoom(conversationId);
      socket.to(conversationRoom).emit("message_read", {
        messageId,
        conversationId,
        readBy: {
          userId: socket.userId,
          userType: socket.userType,
        },
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Error handling message read:", error);
    }
  });

  // ============ PRESENCE EVENTS ============

  /**
   * Handle user status update
   */
  socket.on("update_status", (data) => {
    try {
      if (!validateSocketAuth(socket)) {
        return socket.emit("error", { message: "Not authenticated" });
      }

      const { status } = data;
      const validStatuses = ["online", "away", "busy"];

      if (!status || !validStatuses.includes(status)) {
        return socket.emit("error", { message: "Invalid status" });
      }

      const { updateUserPresence } = require("../utils/socketHelpers");
      updateUserPresence(io)(socket.userType, socket.userId, status);

      socket.emit("status_updated", {
        status,
        timestamp: new Date(),
      });
    } catch (error) {
      handleSocketError(socket, error, "update_status");
    }
  });

  // ============ ADMIN EVENTS ============

  /**
   * Admin broadcast (admin only)
   */
  socket.on("admin_broadcast", (data) => {
    try {
      if (!validateSocketAuth(socket) || socket.userType !== "Admin") {
        return socket.emit("error", { message: "Admin access required" });
      }

      const { message, targetType = "all" } = data;

      if (!message) {
        return socket.emit("error", { message: "Broadcast message required" });
      }

      const { broadcastToAdmins } = require("../utils/socketHelpers");

      if (targetType === "admins") {
        broadcastToAdmins(io)(message, { from: socket.userInfo });
      } else {
        // Broadcast to all users (implement as needed)
        io.emit("system_broadcast", {
          message,
          from: socket.userInfo,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      handleSocketError(socket, error, "admin_broadcast");
    }
  });

  // ============ CONNECTION CLEANUP ============

  /**
   * Handle socket disconnection
   */
  socket.on("disconnect", (reason) => {
    try {
      console.log(`Socket disconnected: ${socket.userKey} - Reason: ${reason}`);

      // Leave presence room and announce offline status
      leavePresenceRoom(io)(socket);

      // Clean up connection
      cleanupSocketConnection(socket);
    } catch (error) {
      console.error("Error handling socket disconnect:", error);
    }
  });

  // ============ ERROR HANDLING ============

  /**
   * Handle socket errors
   */
  socket.on("error", (error) => {
    console.error(`Socket error for ${socket.userKey}:`, error);
  });

  /**
   * Handle connection errors
   */
  socket.on("connect_error", (error) => {
    console.error(`Connection error for ${socket.userKey}:`, error);
  });
};

// ============ MIDDLEWARE FUNCTIONS ============

/**
 * Socket authentication middleware
 */
const socketAuthMiddleware = async (socket, next) => {
  try {
    const { token, userId, userType } = socket.handshake.auth;

    if (!token || !userId || !userType) {
      return next(new Error("Missing authentication data"));
    }

    // Validate JWT token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return next(new Error("Token has expired"));
      }
      return next(new Error("Invalid token"));
    }

    const userExists = await validateUser(userType, userId);
    console.log("userExists:", userExists);
    if (!userExists) {
      return next(new Error("Invalid user"));
    }

    next();
  } catch (error) {
    console.log(error);
    next(new Error("Authentication failed"));
  }
};

/**
 * Rate limiting middleware
 */
const rateLimitMiddleware = (maxRequests = 100, windowMs = 60000) => {
  const requestCounts = new Map();

  return (socket, next) => {
    const key = socket.handshake.address;
    const now = Date.now();

    if (!requestCounts.has(key)) {
      requestCounts.set(key, []);
    }

    const requests = requestCounts.get(key);
    const validRequests = requests.filter(
      (timestamp) => now - timestamp < windowMs
    );

    if (validRequests.length >= maxRequests) {
      return next(new Error("Rate limit exceeded"));
    }

    validRequests.push(now);
    requestCounts.set(key, validRequests);

    next();
  };
};

// ============ UTILITY FUNCTIONS ============

/**
 * Get online users count
 */
const getOnlineUsersCount = (io) => {
  const sockets = io.sockets.sockets;
  const onlineUsers = {
    total: 0,
    buyers: 0,
    sellers: 0,
    admins: 0,
  };

  sockets.forEach((socket) => {
    if (socket.userType) {
      onlineUsers.total++;
      switch (socket.userType) {
        case "Buyer":
          onlineUsers.buyers++;
          break;
        case "Seller":
          onlineUsers.sellers++;
          break;
        case "Admin":
          onlineUsers.admins++;
          break;
      }
    }
  });

  return onlineUsers;
};

/**
 * Get user's active conversations
 */
const getUserActiveConversations = async (userId, userType) => {
  const Conversation = require("../models/Conversation");
  const { isParticipant } = require("../utils/fpHelpers");

  const conversations = await Conversation.find({
    "participants.user.userId": userId,
    "participants.user.userType": userType,
    "participants.isDeleted": false,
    status: "active",
  }).select("_id");

  return conversations.map((conv) => conv._id.toString());
};

module.exports = {
  handleConnection,
  socketAuthMiddleware,
  rateLimitMiddleware,
  getOnlineUsersCount,
  getUserActiveConversations,
};
