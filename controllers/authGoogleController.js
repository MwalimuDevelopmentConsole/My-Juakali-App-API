// controllers/authGoogleController.js
const { OAuth2Client } = require("google-auth-library");
const bcrypt = require("bcryptjs");
const { userTypes } = require("../config/passport");

// Import your existing auth functions
const { generateTokens, formatResponse } = require("./authController");

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);

const googleAuth = async (req, res) => {
  try {
    const { code, userType: requestUserType, state } = req.body;

    if (!code) {
      const response = formatResponse(
        false,
        null,
        "Authorization code is required",
        400
      );
      return res.status(response.statusCode).json(response);
    }

    // Decode state parameter to extract userType and platform
    let userType = requestUserType || "buyer"; // Fallback to request userType
    let platform = "web"; // Default platform

    if (state) {
      try {
        // Decode the Base64 encoded state
        const decodedState = Buffer.from(state, 'base64').toString('utf-8');
        const stateData = JSON.parse(decodedState);
        
        userType = stateData.userType || "buyer";
        platform = stateData.platform || "web";
        
        console.log("Decoded state:", { userType, platform });
      } catch (decodeError) {
        console.warn("Failed to decode state, using fallback:", decodeError);
        // Fallback: treat state as plain string (backward compatibility)
        userType = state || requestUserType || "buyer";
      }
    }

    // Validate userType
    if (!["buyer", "seller"].includes(userType)) {
      const response = formatResponse(
        false,
        null,
        "Invalid user type",
        400
      );
      return res.status(response.statusCode).json(response);
    }

    // Only allow buyers for Google auth
    if (userType !== "buyer") {
      const response = formatResponse(
        false,
        null,
        "Google authentication is only available for buyers",
        400
      );
      return res.status(response.statusCode).json(response);
    }

    // Exchange authorization code for tokens
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user info from Google
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const {
      email,
      given_name: firstName,
      family_name: lastName,
      email_verified,
      picture,
    } = payload;

    if (!email_verified) {
      const response = formatResponse(
        false,
        null,
        "Google account email is not verified",
        400
      );
      return res.status(response.statusCode).json(response);
    }

    const UserModel = userTypes[userType];
    const formattedEmail = email.trim().toLowerCase();
    let user = await UserModel.findOne({ email: formattedEmail });

    if (user) {
      // Update existing user
      user.lastLogin = new Date();
      if (user.loginCount !== undefined) {
        user.loginCount += 1;
      }
      user.isEmailVerified = true;
      
      // Optionally update profile picture if not set
      if (!user.profilePicture && picture) {
        user.profilePicture = picture;
      }
      
      await user.save();
    } else {
      // Create new user
      const randomPassword = Math.random().toString(36).slice(-12);
      const hashedPassword = await bcrypt.hash(randomPassword, 12);

      user = new UserModel({
        email: formattedEmail,
        firstName: firstName || "",
        lastName: lastName || "",
        password: hashedPassword,
        profilePicture: picture || "",
        isEmailVerified: true,
        isActive: true,
        lastLogin: new Date(),
        loginCount: 1,
        authProvider: "google", // Track that this user signed up via Google
      });

      await user.save();
    }

    console.log("User authenticated:", {
      userId: user._id,
      email: user.email,
      userType,
      platform,
      loginCount: user.loginCount
    });

    // Generate tokens using your existing function
    const { accessToken, refreshToken } = await generateTokens(user, userType);

    // Set refresh token cookie with appropriate settings
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // Only secure in production
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    res.cookie("refreshToken", refreshToken, cookieOptions);

    // Remove sensitive data from response
    const userResponse = user.toObject();
    delete userResponse.password;

    const response = formatResponse(
      true,
      {
        user: userResponse,
        accessToken,
        refreshToken, // Include in response for native apps
        userType,
        platform, // Include platform info in response
      },
      user.loginCount === 1
        ? "Account created successfully"
        : "Login successful"
    );

    res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Google OAuth error:", error);

    let message = "Google authentication failed";
    let statusCode = 500;

    if (error.message.includes("invalid_grant")) {
      message = "Authorization code has expired or is invalid. Please try again.";
      statusCode = 400;
    } else if (error.message.includes("invalid_client")) {
      message = "Google authentication configuration error";
      statusCode = 500;
    } else if (error.message.includes("redirect_uri_mismatch")) {
      message = "Redirect URI configuration error";
      statusCode = 500;
    } else if (error.code === 11000) {
      // Duplicate key error
      message = "An account with this email already exists";
      statusCode = 409;
    }

    const response = formatResponse(false, null, message, statusCode);
    res.status(response.statusCode).json(response);
  }
};

module.exports = {
  googleAuth,
};
