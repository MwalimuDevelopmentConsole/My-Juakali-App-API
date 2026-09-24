// controllers/authController.js
const Buyer = require("../models/Buyer");
const Seller = require("../models/Seller");
const Admin = require("../models/Admin");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Marketer = require("../models/Marketer");

const userTypes = {
  buyer: Buyer,
  client: Buyer,
  seller: Seller,
  admin: Admin,
  marketer: Marketer,
  agent: Marketer,
};

// Error handling wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Response formatter
const formatResponse = (success, data, message = null, statusCode = 200) => ({
  success,
  data,
  message,
  statusCode,
});

// Pure function for user validation
const validateUserData = (userData) => {
  const errors = [];

  if (!userData.email) {
    errors.push("Email is required");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
    errors.push("Valid email is required");
  }

  if (!userData.password) {
    errors.push("Password is required");
  } else if (userData.password.length < 6) {
    errors.push("Password must be at least 6 characters long");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Generate JWT tokens
const generateTokens = (user, userType) => {
  const payload = {
    id: user._id,
    email: user.email,
    role: user.role,
    userType,
  };

  const accessToken = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: "365d" } // Short-lived access token
  );

  const refreshToken = jwt.sign(
    payload,
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: "365d" } // Long-lived refresh token
  );

  return { accessToken, refreshToken };
};

// Helper to build search queries for either email or phone
const buildIdentifierQuery = (input) => {
  const trimmed = (input || "").trim();
  const lower = trimmed.toLowerCase();
  const queries = [{ email: lower }, { phone: trimmed }, { phone: lower }];

  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits) {
    queries.push({ phone: digits });
    if (digits.startsWith("0") && digits.length === 10) {
      queries.push({ phone: `+254${digits.substring(1)}` });
      queries.push({ phone: `254${digits.substring(1)}` });
    } else if (digits.startsWith("+254") && digits.length === 13) {
      queries.push({ phone: `0${digits.substring(4)}` });
      queries.push({ phone: digits.substring(1) });
    } else if (digits.startsWith("254") && digits.length === 12) {
      queries.push({ phone: `0${digits.substring(3)}` });
      queries.push({ phone: `+${digits}` });
    }
  }
  return { $or: queries };
};

// ================================
// AUTHENTICATION ENDPOINTS
// ================================

// Login
const sellerBuyerAgentLogin = asyncHandler(async (req, res) => {
  const { email, phone, identifier, password, platform = "web" } = req.body;
  const input = email || phone || identifier;

  if (!input || !password) {
    const response = formatResponse(
      false,
      null,
      "Email/Phone and password are required",
      400
    );
    return res.status(response.statusCode).json(response);
  }

  const query = buildIdentifierQuery(input);

  // Find user
  let user = await Marketer.findOne(query);

  if (!user) {
    user = await Seller.findOne(query);
  }

  if (!user) {
    user = await Buyer.findOne(query);
  }

  if (!user) {
    const response = formatResponse(false, null, "Invalid credentials", 401);
    return res.status(response.statusCode).json(response);
  }

  const userType = user.role;

  if (!user.isActive) {
    const response = formatResponse(false, null, "Account is deactivated", 403);
    return res.status(response.statusCode).json(response);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    const response = formatResponse(false, null, "Invalid credentials", 401);
    return res.status(response.statusCode).json(response);
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user, userType);

  // Set refresh token in httpOnly cookie
  if (platform === "mobile") {
    // Return tokens in response for mobile
    const response = formatResponse(
      true,
      {
        user,
        accessToken: accessToken,
        refreshToken: refreshToken,
        userType: userType,
      },
      "Token refreshed successfully"
    );
    return res.status(response.statusCode).json(response);
  } else {
    // Update refresh token cookie for web
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const response = formatResponse(
      true,
      {
        user,
        accessToken: accessToken,
        userType: userType,
      },
      "Token refreshed successfully"
    );

    return res.status(response.statusCode).json(response);
  }
});

const login = asyncHandler(async (req, res) => {
  const { email, phone, identifier, password, userType } = req.body;
  const input = email || phone || identifier;
  const normalizedUserType = userType ? userType.toLowerCase() : "";

  if (!input || !password || !normalizedUserType || !userTypes[normalizedUserType]) {
    const response = formatResponse(
      false,
      null,
      "Email/Phone and password are required",
      400
    );
    return res.status(response.statusCode).json(response);
  }

  // Find user
  const query = buildIdentifierQuery(input);
  const user = await userTypes[normalizedUserType].findOne(query);

  if (!user) {
    const response = formatResponse(false, null, "Invalid credentials", 401);
    return res.status(response.statusCode).json(response);
  }

  if (!user.isActive) {
    const response = formatResponse(false, null, "Account is deactivated", 403);
    return res.status(response.statusCode).json(response);
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    const response = formatResponse(false, null, "Invalid credentials", 401);
    return res.status(response.statusCode).json(response);
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user, normalizedUserType);

  // Set refresh token in httpOnly cookie
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: true, // Use secure cookies in production
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  // Remove password from response
  const userResponse = user.toObject();
  delete userResponse.password;

  const response = formatResponse(
    true,
    {
      user: userResponse,
      accessToken,
      userType,
    },
    "Login successful"
  );

  res.status(response.statusCode).json(response);
});

// Refresh Token
const refreshToken = asyncHandler(async (req, res) => {
  const { platform = "web" } = req.body;

  let refreshToken;
  if (platform == "web") {
    refreshToken = req.cookies.refreshToken;
  } else {
    refreshToken = req.body.refreshToken;
  }

  if (!refreshToken) {
    const response = formatResponse(
      false,
      null,
      "Refresh token not found",
      401
    );
    return res.status(response.statusCode).json(response);
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );

    // Get user from database to ensure they still exist and are active
    const user = await userTypes[decoded.userType]
      .findById(decoded.id)
      .select("-password");

    if (!user) {
      // Clear the invalid refresh token cookie
      res.clearCookie("refreshToken");
      const response = formatResponse(false, null, "User not found", 401);
      return res.status(response.statusCode).json(response);
    }

    if (!user.isActive) {
      // Clear the refresh token cookie for inactive user
      res.clearCookie("refreshToken");
      const response = formatResponse(
        false,
        null,
        "Account is deactivated",
        401
      );
      return res.status(response.statusCode).json(response);
    }

    // Generate new tokens
    const tokens = generateTokens(user, decoded.userType);

    // Update refresh token cookie
    if (platform === "mobile") {
      // Return tokens in response for mobile
      const response = formatResponse(
        true,
        {
          user,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          userType: decoded.userType,
        },
        "Token refreshed successfully"
      );
      return res.status(response.statusCode).json(response);
    } else {
      // Update refresh token cookie for web
      res.cookie("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const response = formatResponse(
        true,
        {
          user,
          accessToken: tokens.accessToken,
          userType: decoded.userType,
        },
        "Token refreshed successfully"
      );

      return res.status(response.statusCode).json(response);
    }
  } catch (error) {
    // Clear invalid refresh token cookie
    res.clearCookie("refreshToken");

    let message = "Invalid or expired refresh token";
    if (error.name === "TokenExpiredError") {
      message = "Refresh token has expired";
    } else if (error.name === "JsonWebTokenError") {
      message = "Invalid refresh token format";
    }

    const response = formatResponse(false, null, message, 401);
    res.status(response.statusCode).json(response);
  }
});

// Logout
const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.cookies;

  if (!refreshToken) {
    const response = formatResponse(false, null, "No refresh token found", 200);
    return res.status(response.statusCode).json(response);
  }

  // Clear refresh token cookie
  res.clearCookie("refreshToken");

  const response = formatResponse(true, null, "Logged out successfully");
  res.status(response.statusCode).json(response);
});

// Verify Token (for debugging or frontend token validation)
const verifyToken = asyncHandler(async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    const response = formatResponse(false, null, "Access token required", 401);
    return res.status(response.statusCode).json(response);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await userTypes[decoded.userType]
      .findById(decoded.id)
      .select("-password");

    if (!user || !user.isActive) {
      const response = formatResponse(
        false,
        null,
        "Invalid or inactive user",
        401
      );
      return res.status(response.statusCode).json(response);
    }

    const response = formatResponse(
      true,
      {
        user,
        tokenValid: true,
        expiresAt: new Date(decoded.exp * 1000),
      },
      "Token is valid"
    );

    res.status(response.statusCode).json(response);
  } catch (error) {
    let message = "Invalid or expired token";
    if (error.name === "TokenExpiredError") {
      message = "Token has expired";
    } else if (error.name === "JsonWebTokenError") {
      message = "Invalid token format";
    }

    const response = formatResponse(false, null, message, 401);
    res.status(response.statusCode).json(response);
  }
});

// Change password with current password verification
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, password, newPassword } = req.body;
  const targetPassword = password || newPassword;

  if (!currentPassword || !targetPassword) {
    const response = formatResponse(
      false,
      null,
      "Current and new passwords are required",
      400
    );
    return res.status(response.statusCode).json(response);
  }

  if (targetPassword.length < 6) {
    const response = formatResponse(
      false,
      null,
      "New password must be at least 6 characters long",
      400
    );
    return res.status(response.statusCode).json(response);
  }

  const userTypeKey = (req.user?.userType || req.user?.role || "").toLowerCase();
  const Model = userTypes[userTypeKey] || userTypes[req.user?.userType];

  if (!Model) {
    const response = formatResponse(false, null, "User type not supported", 400);
    return res.status(response.statusCode).json(response);
  }

  const user = await Model.findById(req.user.id);

  if (!user) {
    const response = formatResponse(false, null, "User not found", 404);
    return res.status(response.statusCode).json(response);
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(
    currentPassword,
    user.password
  );
  if (!isCurrentPasswordValid) {
    const response = formatResponse(
      false,
      null,
      "Current password is incorrect",
      400
    );
    return res.status(response.statusCode).json(response);
  }

  // Hash and update new password
  user.password = await bcrypt.hash(targetPassword, 12);
  await user.save();

  const response = formatResponse(true, null, "Password changed successfully");
  res.status(response.statusCode).json(response);
});

module.exports = {
  login,
  refreshToken,
  logout,
  verifyToken,
  changePassword,
  generateTokens,
  sellerBuyerAgentLogin,
  formatResponse,
};
