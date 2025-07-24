// routes/authGoogle.js
const express = require("express");
const passport = require("passport");
const { generateTokens } = require("../controllers/authController");

const router = express.Router();

// Response formatter (matching your existing pattern)
const formatResponse = (success, data, message = null, statusCode = 200) => ({
  success,
  data,
  message,
  statusCode,
});

// Error handling wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Functional approach for setting refresh token cookie
const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

// Functional approach for auth response
const sendAuthResponse = (
  res,
  user,
  userType,
  message = "Authentication successful"
) => {
  // Generate tokens using your existing function
  const { accessToken, refreshToken } = generateTokens(user, userType);

  // Set refresh token in httpOnly cookie
  setRefreshTokenCookie(res, refreshToken);

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
    message
  );

  return res.status(response.statusCode).json(response);
};

// Functional approach for auth error response
const sendAuthError = (
  res,
  message = "Authentication failed",
  statusCode = 401
) => {
  const response = formatResponse(false, null, message, statusCode);
  return res.status(response.statusCode).json(response);
};

// Google OAuth Routes

// Initiate Google Auth with userType
const initiateGoogleAuth = (req, res, next) => {
  const { userType = "buyer" } = req.query;

  // Validate userType
  const validUserTypes = ["buyer", "seller", "admin"];
  if (!validUserTypes.includes(userType)) {
    return sendAuthError(res, "Invalid user type specified", 400);
  }

  // Store userType in session for callback
  req.session.userType = userType;

  passport.authenticate("google", {
    scope: ["profile", "email"],
  })(req, res, next);
};

// Handle Google OAuth callback
const handleGoogleCallback = asyncHandler(async (req, res, next) => {
  passport.authenticate(
    "google",
    {
      failureRedirect: `${process.env.CLIENT_URL}/login?error=auth_failed`,
      session: false,
    },
    (err, result) => {
      if (err) {
        console.error("Google OAuth error:", err);
        const errorType = err.message.includes("Invalid user type")
          ? "invalid_user_type"
          : "server_error";
        return res.redirect(
          `${process.env.CLIENT_URL}/login?error=${errorType}`
        );
      }

      if (!result || !result.user) {
        return res.redirect(
          `${process.env.CLIENT_URL}/login?error=auth_failed`
        );
      }

      const { user, userType } = result;

      // Check if user is active
      if (!user.isActive) {
        return res.redirect(
          `${process.env.CLIENT_URL}/login?error=account_deactivated`
        );
      }

      try {
        // Generate tokens using your existing function
        const { accessToken, refreshToken } = generateTokens(user, userType);

        // Create URL with tokens and userType for frontend
        const redirectUrl = new URL(`${process.env.CLIENT_URL}/auth/callback`);
        redirectUrl.searchParams.set("token", accessToken);
        redirectUrl.searchParams.set("userType", userType);

        // Set refresh token cookie before redirect
        setRefreshTokenCookie(res, refreshToken);

        return res.redirect(redirectUrl.toString());
      } catch (tokenError) {
        console.error("Token generation error:", tokenError);
        return res.redirect(
          `${process.env.CLIENT_URL}/login?error=token_error`
        );
      }
    }
  )(req, res, next);
});

// Verify token endpoint (compatible with your existing verifyToken)
const verifyGoogleToken = asyncHandler(async (req, res) => {
  const { token, userType } = req.body;

  if (!token) {
    return sendAuthError(res, "Token is required", 400);
  }

  if (!userType) {
    return sendAuthError(res, "User type is required", 400);
  }

  try {
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify userType matches token
    if (decoded.userType !== userType) {
      return sendAuthError(res, "User type mismatch", 401);
    }

    const { userTypes } = require("../config/passport");
    const user = await userTypes[userType]
      .findById(decoded.id)
      .select("-password");

    if (!user || !user.isActive) {
      return sendAuthError(res, "Invalid token or inactive account", 401);
    }

    const response = formatResponse(
      true,
      {
        user,
        tokenValid: true,
        userType,
        expiresAt: new Date(decoded.exp * 1000),
      },
      "Token verified successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Token verification error:", error);

    let message = "Invalid or expired token";
    if (error.name === "TokenExpiredError") {
      message = "Token has expired";
    } else if (error.name === "JsonWebTokenError") {
      message = "Invalid token format";
    }

    return sendAuthError(res, message, 401);
  }
});

// Get current user (for frontend state management)
const getCurrentUser = asyncHandler(async (req, res) => {
  try {
    // This assumes you have middleware that sets req.user
    if (!req.user) {
      return sendAuthError(res, "Not authenticated", 401);
    }

    const { userTypes } = require("../config/passport");
    const user = await userTypes[req.user.userType]
      .findById(req.user.id)
      .select("-password");

    if (!user || !user.isActive) {
      return sendAuthError(res, "User not found or inactive", 401);
    }

    const response = formatResponse(
      true,
      {
        user,
        userType: req.user.userType,
      },
      "User retrieved successfully"
    );

    return res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Get current user error:", error);
    return sendAuthError(res, "Failed to retrieve user", 500);
  }
});

module.exports = {
  initiateGoogleAuth,
  handleGoogleCallback,
  verifyGoogleToken,
  getCurrentUser,
};
