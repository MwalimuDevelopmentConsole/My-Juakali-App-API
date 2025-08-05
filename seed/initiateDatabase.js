const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Admin = require("../models/Admin");



const MONGO_URI = "mongodb://localhost:27017/my-juakali";
const SALT_ROUNDS = 10;

mongoose.set('strictQuery', true);


async function seedAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: "admin@gmail.com" });
    if (existingAdmin) {
      console.log("Admin already exists!");
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash("123456", SALT_ROUNDS);

    // Create admin
    const admin = new Admin({
      email: "admin@gmail.com",
      password: hashedPassword,
      firstName: "Super",
      lastName: "Admin",
      phone: "+254712345678",
      role: "super_admin",
      department: "tech",
      isActive: true,
      status: "active",
      security: {
        lastPasswordChange: new Date(),
        loginAttempts: 0,
        twoFactorEnabled: false
      },
      activity: {
        loginCount: 0,
        actionsPerformed: 0,
        lastAction: "Account Created",
        lastActionAt: new Date()
      },
      workingHours: {
        start: "08:00",
        end: "17:00",
        timezone: "Africa/Nairobi"
      },
      preferences: {
        notifications: {
          email: {
            urgent: true,
            daily_summary: true,
            system_alerts: true
          },
          sms: {
            urgent: true,
            system_down: true
          }
        }
      }
    });

    await admin.save();
    console.log("✅ Admin created successfully!");
    console.log(`Email: ${admin.email}`);
    console.log(`Name: ${admin.fullName}`);
    console.log(`Role: ${admin.role}`);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

seedAdmin();