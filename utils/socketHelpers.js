const { createUserRef, extractUserInfo } = require('./fpHelpers');

// ============ SOCKET CONNECTION MANAGEMENT ============

/**
 * Initialize socket connection with user identification
 */
const initializeSocketConnection = (socket, { userId, userType, userInfo }) => {
  // Store user information in socket
  socket.userId = userId;
  socket.userType = userType;
  socket.userKey = `${userType.toLowerCase()}_${userId}`;
  socket.userInfo = userInfo;
  
  // Join user's personal room
  const personalRoom = getUserRoom(userType, userId);
  socket.join(personalRoom);
  
  console.log(`User connected: ${socket.userKey} in room: ${personalRoom}`);
  
  return {
    userId,
    userType,
    userKey: socket.userKey,
    personalRoom
  };
};

/**
 * Clean up socket connection
 */
const cleanupSocketConnection = (socket) => {
  if (socket.userId && socket.userType) {
    const personalRoom = getUserRoom(socket.userType, socket.userId);
    socket.leave(personalRoom);
    
    console.log(`User disconnected: ${socket.userKey} from room: ${personalRoom}`);
  }
};

// ============ ROOM MANAGEMENT ============

/**
 * Generate room names
 */
const getUserRoom = (userType, userId) => `user_${userType.toLowerCase()}_${userId}`;
const getConversationRoom = (conversationId) => `conversation_${conversationId}`;
const getTypingRoom = (conversationId) => `typing_${conversationId}`;
const getSupportRoom = (ticketId) => `support_${ticketId}`;
const getPresenceRoom = (userType) => `presence_${userType.toLowerCase()}`;

/**
 * Join conversation room
 */
const joinConversationRoom = (io) => (socket, conversationId) => {
  const conversationRoom = getConversationRoom(conversationId);
  const typingRoom = getTypingRoom(conversationId);
  
  socket.join(conversationRoom);
  socket.join(typingRoom);
  
  // Notify other participants about user joining
  socket.to(conversationRoom).emit('user_joined_conversation', {
    userId: socket.userId,
    userType: socket.userType,
    userInfo: socket.userInfo,
    conversationId,
    timestamp: new Date()
  });
  
  console.log(`${socket.userKey} joined conversation: ${conversationId}`);
  
  return { conversationRoom, typingRoom };
};

/**
 * Leave conversation room
 */
const leaveConversationRoom = (io) => (socket, conversationId) => {
  const conversationRoom = getConversationRoom(conversationId);
  const typingRoom = getTypingRoom(conversationId);
  
  socket.leave(conversationRoom);
  socket.leave(typingRoom);
  
  // Notify other participants about user leaving
  socket.to(conversationRoom).emit('user_left_conversation', {
    userId: socket.userId,
    userType: socket.userType,
    userInfo: socket.userInfo,
    conversationId,
    timestamp: new Date()
  });
  
  console.log(`${socket.userKey} left conversation: ${conversationId}`);
};

/**
 * Join support ticket room
 */
const joinSupportRoom = (io) => (socket, ticketId) => {
  const supportRoom = getSupportRoom(ticketId);
  socket.join(supportRoom);
  
  // Notify other admins about joining
  socket.to(supportRoom).emit('admin_joined_support', {
    adminId: socket.userId,
    adminInfo: socket.userInfo,
    ticketId,
    timestamp: new Date()
  });
  
  console.log(`${socket.userKey} joined support ticket: ${ticketId}`);
  
  return supportRoom;
};

/**
 * Leave support ticket room
 */
const leaveSupportRoom = (io) => (socket, ticketId) => {
  const supportRoom = getSupportRoom(ticketId);
  socket.leave(supportRoom);
  
  console.log(`${socket.userKey} left support ticket: ${ticketId}`);
};

// ============ MESSAGE DELIVERY ============

/**
 * Deliver message to conversation participants
 */
const deliverMessage = (io) => (messageData, conversationId) => {
  const conversationRoom = getConversationRoom(conversationId);
  
  // Emit to conversation room
  io.to(conversationRoom).emit('new_message', {
    ...messageData,
    timestamp: new Date()
  });
  
  // Also send to individual user rooms for offline users
  if (messageData.recipients) {
    messageData.recipients.forEach(recipient => {
      const userRoom = getUserRoom(recipient.userType, recipient.userId);
      io.to(userRoom).emit('message_notification', {
        conversationId,
        messageId: messageData._id,
        sender: messageData.sender,
        messageType: messageData.messageType,
        preview: getMessagePreview(messageData),
        timestamp: new Date()
      });
    });
  }
  
  console.log(`Message delivered to conversation: ${conversationId}`);
};

/**
 * Deliver support message
 */
const deliverSupportMessage = (io) => (messageData, ticketId) => {
  const supportRoom = getSupportRoom(ticketId);
  
  io.to(supportRoom).emit('support_message', {
    ...messageData,
    timestamp: new Date()
  });
  
  console.log(`Support message delivered to ticket: ${ticketId}`);
};

/**
 * Send direct notification to user
 */
const sendDirectNotification = (io) => (userType, userId, notification) => {
  const userRoom = getUserRoom(userType, userId);
  
  io.to(userRoom).emit('notification', {
    ...notification,
    timestamp: new Date()
  });
  
  console.log(`Direct notification sent to: ${userType}_${userId}`);
};

/**
 * Get message preview for notifications
 */
const getMessagePreview = (messageData) => {
  const { messageType, content } = messageData;
  
  switch (messageType) {
    case 'text':
      return content.text?.substring(0, 100) || 'New message';
    case 'image':
      return `📷 ${content.images?.length || 1} image(s)`;
    case 'file':
      return `📎 ${content.files?.[0]?.name || 'File attachment'}`;
    case 'location':
      return '📍 Location shared';
    case 'offer':
      return `💰 Offer: ${content.offer?.currency} ${content.offer?.amount}`;
    case 'system':
      return 'System message';
    default:
      return 'New message';
  }
};

// ============ TYPING INDICATORS ============

/**
 * Handle typing start
 */
const handleTypingStart = (io) => (socket, conversationId) => {
  const typingRoom = getTypingRoom(conversationId);
  
  socket.to(typingRoom).emit('user_typing_start', {
    userId: socket.userId,
    userType: socket.userType,
    userInfo: socket.userInfo,
    conversationId,
    timestamp: new Date()
  });
  
  // Auto-stop typing after 3 seconds if no stop signal
  if (socket.typingTimeout) {
    clearTimeout(socket.typingTimeout);
  }
  
  socket.typingTimeout = setTimeout(() => {
    handleTypingStop(io)(socket, conversationId);
  }, 3000);
};

/**
 * Handle typing stop
 */
const handleTypingStop = (io) => (socket, conversationId) => {
  const typingRoom = getTypingRoom(conversationId);
  
  socket.to(typingRoom).emit('user_typing_stop', {
    userId: socket.userId,
    userType: socket.userType,
    userInfo: socket.userInfo,
    conversationId,
    timestamp: new Date()
  });
  
  if (socket.typingTimeout) {
    clearTimeout(socket.typingTimeout);
    socket.typingTimeout = null;
  }
};

/**
 * Handle support typing indicators
 */
const handleSupportTyping = (io) => (socket, ticketId, isTyping) => {
  const supportRoom = getSupportRoom(ticketId);
  
  socket.to(supportRoom).emit('support_typing', {
    userId: socket.userId,
    userType: socket.userType,
    userInfo: socket.userInfo,
    ticketId,
    isTyping,
    timestamp: new Date()
  });
};

// ============ PRESENCE MANAGEMENT ============

/**
 * Update user online status
 */
const updateUserPresence = (io) => (userType, userId, status) => {
  const presenceRoom = getPresenceRoom(userType);
  
  io.to(presenceRoom).emit('user_presence_update', {
    userId,
    userType,
    status, // 'online', 'away', 'offline'
    timestamp: new Date()
  });
  
  console.log(`User presence updated: ${userType}_${userId} - ${status}`);
};

/**
 * Join presence room
 */
const joinPresenceRoom = (io) => (socket) => {
  const presenceRoom = getPresenceRoom(socket.userType);
  socket.join(presenceRoom);
  
  // Announce user is online
  updateUserPresence(io)(socket.userType, socket.userId, 'online');
  
  return presenceRoom;
};

/**
 * Leave presence room  
 */
const leavePresenceRoom = (io) => (socket) => {
  const presenceRoom = getPresenceRoom(socket.userType);
  socket.leave(presenceRoom);
  
  // Announce user is offline
  updateUserPresence(io)(socket.userType, socket.userId, 'offline');
};

// ============ MESSAGE STATUS UPDATES ============

/**
 * Handle message delivered status
 */
const handleMessageDelivered = (io) => (messageId, userId, userType) => {
  const userRoom = getUserRoom(userType, userId);
  
  io.to(userRoom).emit('message_delivered', {
    messageId,
    userId,
    userType,
    timestamp: new Date()
  });
};

/**
 * Handle message read status
 */
const handleMessageRead = (io) => (messageId, conversationId, userId, userType) => {
  const conversationRoom = getConversationRoom(conversationId);
  
  io.to(conversationRoom).emit('message_read', {
    messageId,
    conversationId,
    readBy: {
      userId,
      userType
    },
    timestamp: new Date()
  });
};

/**
 * Handle conversation read (all messages)
 */
const handleConversationRead = (io) => (conversationId, userId, userType) => {
  const conversationRoom = getConversationRoom(conversationId);
  
  io.to(conversationRoom).emit('conversation_read', {
    conversationId,
    readBy: {
      userId,
      userType
    },
    timestamp: new Date()
  });
};

// ============ ERROR HANDLING ============

/**
 * Handle socket errors
 */
const handleSocketError = (socket, error, context = '') => {
  console.error(`Socket error for ${socket.userKey} in ${context}:`, error);
  
  socket.emit('error', {
    message: 'An error occurred',
    context,
    timestamp: new Date()
  });
};

/**
 * Validate socket authorization
 */
const validateSocketAuth = (socket) => {
  return socket.userId && socket.userType && socket.userKey;
};

// ============ ADMIN SPECIFIC UTILITIES ============

/**
 * Broadcast system message to all admins
 */
const broadcastToAdmins = (io) => (message, data = {}) => {
  io.to('presence_admin').emit('admin_broadcast', {
    message,
    data,
    timestamp: new Date()
  });
};

/**
 * Notify available admins for new support ticket
 */
const notifyAvailableAdmins = (io) => (ticketData, category) => {
  // This could be enhanced to only notify admins in specific departments
  io.to('presence_admin').emit('new_support_ticket', {
    ...ticketData,
    category,
    timestamp: new Date()
  });
};

// ============ RATE LIMITING UTILITIES ============

/**
 * Simple rate limiting for socket events
 */
const createRateLimit = (maxRequests = 10, windowMs = 60000) => {
  const requests = new Map();
  
  return (socket, eventType) => {
    const key = `${socket.userKey}_${eventType}`;
    const now = Date.now();
    
    if (!requests.has(key)) {
      requests.set(key, []);
    }
    
    const userRequests = requests.get(key);
    
    // Remove old requests outside window
    const validRequests = userRequests.filter(timestamp => 
      now - timestamp < windowMs
    );
    
    if (validRequests.length >= maxRequests) {
      return false; // Rate limit exceeded
    }
    
    validRequests.push(now);
    requests.set(key, validRequests);
    
    return true; // Request allowed
  };
};

// ============ EXPORTS ============

module.exports = {
  // Connection management
  initializeSocketConnection,
  cleanupSocketConnection,
  
  // Room management
  getUserRoom,
  getConversationRoom,
  getTypingRoom,
  getSupportRoom,
  getPresenceRoom,
  joinConversationRoom,
  leaveConversationRoom,
  joinSupportRoom,
  leaveSupportRoom,
  
  // Message delivery
  deliverMessage,
  deliverSupportMessage,
  sendDirectNotification,
  getMessagePreview,
  
  // Typing indicators
  handleTypingStart,
  handleTypingStop,
  handleSupportTyping,
  
  // Presence management
  updateUserPresence,
  joinPresenceRoom,
  leavePresenceRoom,
  
  // Message status
  handleMessageDelivered,
  handleMessageRead,
  handleConversationRead,
  
  // Error handling
  handleSocketError,
  validateSocketAuth,
  
  // Admin utilities
  broadcastToAdmins,
  notifyAvailableAdmins,
  
  // Rate limiting
  createRateLimit
};