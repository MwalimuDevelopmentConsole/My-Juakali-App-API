const ActivityLog = require("../models/ActivityLog");
const { formatResponse } = require("./authController");

const getActivities = async (req, res) => {
  try {
    const { page = 1, limit = 10, userId = "" } = req.query;
    const query = userId ? { "user.userId": userId } : {};
    const [activities, count] = await Promise.all([
      ActivityLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .lean()
        .exec(),
      ActivityLog.countDocuments(query),
    ]);

    const totalPages = Math.ceil(count / limit);

    const response = formatResponse(
      true,
      { activities, totalPages, count },
      "Activities fetched successfully",
      200
    );
    res.status(response.statusCode).json(response);
  } catch (error) {
    console.log(error);
    const response = formatResponse(
      false,
      null,
      "Failed to fetch activities",
      500
    );
    res.status(response.statusCode).json(response);
  }
};

async function logActivity(user, action, details = {}) {
  try {
    const activity = new ActivityLog({
      user: {
        userType: user.userType,
        userId: user._id,
      },
      action,
      details,
    });
    await activity.save();
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
}

module.exports = {
  getActivities,
  logActivity,
};
