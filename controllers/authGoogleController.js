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
    const { code, userType = "buyer" } = req.body;

    if (!code) {
      const response = formatResponse(
        false,
        null,
        "Authorization code is required",
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
      await user.save();
    } else {
      // Create new user
      const randomPassword = Math.random().toString(36).slice(-12);
      const hashedPassword = await bcrypt.hash(randomPassword, 12);

      user = new UserModel({
        email,
        firstName: firstName || "",
        lastName: lastName || "",
        password: hashedPassword,
        isEmailVerified: true,
        isActive: true,
        lastLogin: new Date(),
        loginCount: 1,
      });

      await user.save();
    }

    console.log(user);

    // Generate tokens using your existing function
    const { accessToken, refreshToken } = await generateTokens(user, userType);

    // Set refresh token cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
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
      user.loginCount === 1
        ? "Account created successfully"
        : "Login successful"
    );

    res.status(response.statusCode).json(response);
  } catch (error) {
    console.error("Google OAuth error:", error);

    let message = "Google authentication failed";
    if (error.message.includes("invalid_grant")) {
      message = "Authorization code has expired. Please try again.";
    } else if (error.message.includes("invalid_client")) {
      message = "Google authentication configuration error";
    }

    const response = formatResponse(false, null, message, 500);
    res.status(response.statusCode).json(response);
  }
};

module.exports = {
  googleAuth,
};
