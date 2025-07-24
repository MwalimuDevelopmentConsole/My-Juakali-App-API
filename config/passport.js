// config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Buyer = require('../models/Buyer');
const Seller = require('../models/Seller');
const Admin = require('../models/Admin');

// User type models mapping
const userTypes = {
  buyer: Buyer,
  seller: Seller,
  admin: Admin
};

// Functional approach for finding or creating user based on userType
const findOrCreateUser = async (profile, userType = 'buyer') => {
  try {
    const email = profile.emails[0].value;
    const UserModel = userTypes[userType];
    
    if (!UserModel) {
      throw new Error(`Invalid user type: ${userType}`);
    }
    
    // Check if user already exists
    let user = await UserModel.findOne({ email });
    
    if (user) {
      // Update last login and increment login count if user exists
      user.lastLogin = new Date();
      if (user.loginCount !== undefined) {
        user.loginCount += 1;
      }
      user.isEmailVerified = true; // Google accounts are pre-verified
      await user.save();
      return { user, userType };
    }
    
    // Create new user from Google profile
    const userData = {
      email,
      firstName: profile.name.givenName,
      lastName: profile.name.familyName,
      isEmailVerified: true,
      isActive: true,
      lastLogin: new Date(),
      // Generate a random password (user won't need it for Google login)
      password: Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8)
    };
    
    // Add loginCount for buyer model
    if (userType === 'buyer') {
      userData.loginCount = 1;
    }
    
    user = new UserModel(userData);
    await user.save();
    
    return { user, userType };
  } catch (error) {
    throw new Error(`Error in findOrCreateUser: ${error.message}`);
  }
};

// Configure Google OAuth Strategy with userType support
const configureGoogleStrategy = () => {
  passport.use('google', new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
    passReqToCallback: true // Enable access to req object
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      // Get userType from session or default to 'buyer'
      const userType = req.session?.userType || req.query?.userType || 'buyer';
      
      // Validate userType
      if (!userTypes[userType]) {
        return done(new Error(`Invalid user type: ${userType}`), null);
      }
      
      const result = await findOrCreateUser(profile, userType);
      return done(null, result);
    } catch (error) {
      return done(error, null);
    }
  }));
};

// Serialize/Deserialize user for session
const configurePassportSerialization = () => {
  passport.serializeUser((data, done) => {
    // Store user ID and userType in session
    done(null, { id: data.user._id, userType: data.userType });
  });

  passport.deserializeUser(async (data, done) => {
    try {
      const UserModel = userTypes[data.userType];
      const user = await UserModel.findById(data.id);
      done(null, { user, userType: data.userType });
    } catch (error) {
      done(error, null);
    }
  });
};

// Initialize passport configuration
const initializePassport = () => {
  configureGoogleStrategy();
  configurePassportSerialization();
};

module.exports = {
  initializePassport,
  findOrCreateUser,
  userTypes
};