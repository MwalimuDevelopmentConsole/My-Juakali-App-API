const { default: mongoose } = require("mongoose");
const Account = require("../models/Account");
const SubAccountCategory = require("../models/SubAccountCategory");

// Helper function to generate account numbers for sellers and marketers
const generateAccountNumber = async (userType) => {
  try {
    let prefix = '';
    switch (userType.toLowerCase()) {
      case 'seller':
        prefix = 'SEL';
        break;
      case 'buyer':
        prefix = 'BUY';
        break;
      case 'admin':
        prefix = 'ADM';
        break;
      default:
        prefix = 'USR';
    }

    // Find the latest account for this user type
    const latestAccount = await Account.findOne({
      'user.userType': userType,
      accountNo: { $regex: `^${prefix}` }
    })
      .sort({ createdAt: -1 })
      .exec();

    const nextSequence = latestAccount
      ? parseInt(latestAccount.accountNo.replace(prefix, ""), 10) + 1
      : 1;

    const accountNo = `${prefix}${nextSequence.toString().padStart(4, "0")}`;
    return accountNo;
  } catch (error) {
    throw new Error(`Error generating account number: ${error.message}`);
  }
};

const createUserAccount = async (req, res) => {
  try {
    const {
      userId,
      userType,
      accountType,
      accountName,
      description,
    } = req.body;

    // Validate required fields
    if (!req.user.id || !accountType || !userId || !userType) {
      return res.status(400).json({
        message: "Required fields: userId, userType, accountType, and createdBy.",
      });
    }

    // Validate userType
    const validUserTypes = ["Buyer", "Seller", "Admin"];
    if (!validUserTypes.includes(userType)) {
      return res.status(400).json({
        message: "Invalid userType. Must be one of: Buyer, Seller, Admin",
      });
    }

    const subCategory = await SubAccountCategory.findOne({
      subCategoryName: { $regex: /^(current assets|current asset)$/i },
    });

    if (!subCategory) {
      return res.status(400).json({
        message:
          "No category named current asset/assets found, add one then register account",
      });
    }

    const filters = {
      accountType,
      'user.userId': mongoose.Types.ObjectId(userId),
      'user.userType': userType,
    };

    const accountDup = await Account.findOne(filters);

    if (accountDup) {
      return res.status(400).json({ 
        message: `${userType} already has an account of this type` 
      });
    }

    // Generate the account number
    const accountNo = await generateAccountNumber(userType);

    // Create a new account
    const newAccount = new Account({
      user: {
        userId,
        userType,
      },
      accountNo,
      accountCategory: subCategory._id,
      createdBy: req.user.id,
      accountType,
      accountName: accountName || `${userType} Account`,
      description,
      status: "Active",
    });

    await newAccount.save();

    res.status(201).json({
      message: "User account created successfully.",
      accountNo,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message,
      message: "Something went wrong.",
    });
  }
};

const createSystemAccount = async (req, res) => {
  try {
    const {
      accountName,
      accountCategory,
      accountNo,
      isPaymentOption = false,
      description,
    } = req.body;

    // Validate required fields
    if (!accountName || !accountCategory || !req.user.id) {
      return res.status(400).json({
        message:
          "Required fields: accountName, accountCategory, and createdBy.",
      });
    }

    // Verify if the account name is a valid system account
    const validSystemAccounts = [
      "Rent Collection",
      "Deposit Collection",
      "Garbage Collection",
      "Operating Bank Account",
      "Agreement Fee Collection",
      "Service Fee Collection",
      "Penalty Fee Collection",
      "Water Bill Collection",
      "Security Fee Collection",
      "Withdraw Charges",
      "Booking Fee Collection Account",
      "Commission Account",
      "Marketing Fee Account",
    ];

    if (!validSystemAccounts.includes(accountName) && !isPaymentOption) {
      return res.status(400).json({
        message: "Invalid system account name.",
      });
    }

    // Check if the system account already exists
    const [existingSystemAccount, dupAccountNo] = await Promise.all([
      Account.findOne({
        accountName,
        isSystemAccount: true,
      }),
      Account.findOne({
        accountNo: accountNo?.trim()?.toLowerCase(),
      }),
    ]);

    if (existingSystemAccount) {
      return res.status(400).json({
        message: "System account name already exists.",
      });
    }

    if (dupAccountNo) {
      return res.status(400).json({
        message: "Account number already exists.",
      });
    }

    // Create a new system account
    const newSystemAccount = new Account({
      accountName,
      accountCategory,
      createdBy:req.user.id,
      accountNo: accountNo?.trim()?.toLowerCase(),
      isSystemAccount: true,
      accountType: "system",
      isPaymentOption,
      description,
      status: "Active",
    });

    const savedSystemAccount = await newSystemAccount.save();

    res.status(201).json({
      message: "System account created successfully.",
      data: savedSystemAccount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message,
      message: "Something went wrong while creating the system account.",
    });
  }
};

const createBusinessAccount = async (req, res) => {
  try {
    const { accountName, accountCategory, accountNo, description } =
      req.body;

    // Validate required fields
    if (!accountName || !accountCategory || !req.user.id) {
      return res.status(400).json({
        message:
          "Required fields: accountName, accountCategory, and createdBy.",
      });
    }

    // Check if the account already exists
    const [existingAccount, dupAccountNo] = await Promise.all([
      Account.findOne({
        accountName,
        accountType: "business",
      }),
      Account.findOne({
        accountNo: accountNo?.trim()?.toLowerCase(),
      }),
    ]);

    if (existingAccount) {
      return res.status(400).json({
        message: "Business account name already exists.",
      });
    }

    if (dupAccountNo) {
      return res.status(400).json({
        message: "Account number already exists.",
      });
    }

    // Create a new business account
    const newBusinessAccount = new Account({
      accountName,
      accountCategory,
      createdBy: req.user.id,
      accountNo: accountNo?.trim()?.toLowerCase(),
      accountType: "business",
      description,
      status: "Active",
    });

    await newBusinessAccount.save();

    res.status(201).json({
      message: "Business account created successfully.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message,
      message: "Something went wrong while creating the business account.",
    });
  }
};

const getAccounts = async (req, res) => {
  const page = req?.query?.page || 1;
  const perPage = req?.query?.perPage || 200;
  const skip = (page - 1) * parseInt(perPage);

  let {
    status,
    userId,
    accountType,
    isSystemAccount,
    isPaymentOption,
    userType,
    searchTerm,
  } = req.query;

  try {
    if (userId === "undefined") {
      userId = "";
    }

    const filters = {
      isDeleted: false,
    };

    // Add other filters
    if (accountType) filters.accountType = accountType;
    if (status) filters.status = status;
    if (isSystemAccount === "yes") filters.isSystemAccount = true;
    if (isSystemAccount === "no") filters.isSystemAccount = false;
    if (isPaymentOption === "yes") filters.isPaymentOption = true;
    if (isPaymentOption === "no") filters.isPaymentOption = false;
    if (userId) filters['user.userId'] = mongoose.Types.ObjectId(userId);
    if (userType) filters['user.userType'] = userType;

    // Aggregation pipeline to handle searchTerm, pagination, and population
    const aggregationPipeline = [
      { $match: filters },
      {
        $lookup: {
          from: "subaccountcategories",
          localField: "accountCategory",
          foreignField: "_id",
          as: "accountCategory",
        },
      },
      {
        $unwind: { path: "$accountCategory", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "admins", // Assuming createdBy references Admin model
          localField: "createdBy",
          foreignField: "_id",
          as: "createdBy",
        },
      },
      { $unwind: { path: "$createdBy", preserveNullAndEmptyArrays: true } },
    ];

    // Add user lookup based on userType
    aggregationPipeline.push({
      $lookup: {
        from: function() {
          // This will be replaced in the actual aggregation
          return "users"; // Default collection name
        },
        let: { userId: "$user.userId", userType: "$user.userType" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$_id", "$$userId"] },
                  // Add additional matching logic based on userType if needed
                ]
              }
            }
          }
        ],
        as: "userDetails"
      }
    });

    // For simplicity, let's use a more straightforward approach for user lookup
    aggregationPipeline.splice(-1, 1); // Remove the complex lookup
    
    // Add separate lookups for each user type
    aggregationPipeline.push(
      {
        $lookup: {
          from: "buyers",
          let: { userId: "$user.userId", userType: "$user.userType" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$userId"] },
                    { $eq: ["$$userType", "Buyer"] }
                  ]
                }
              }
            }
          ],
          as: "buyerDetails"
        }
      },
      {
        $lookup: {
          from: "sellers",
          let: { userId: "$user.userId", userType: "$user.userType" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$userId"] },
                    { $eq: ["$$userType", "Seller"] }
                  ]
                }
              }
            }
          ],
          as: "sellerDetails"
        }
      },
      {
        $lookup: {
          from: "admins",
          let: { userId: "$user.userId", userType: "$user.userType" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$userId"] },
                    { $eq: ["$$userType", "Admin"] }
                  ]
                }
              }
            }
          ],
          as: "adminDetails"
        }
      },
      {
        $addFields: {
          userDetails: {
            $concatArrays: ["$buyerDetails", "$sellerDetails", "$adminDetails"]
          }
        }
      },
      {
        $addFields: {
          userDetails: { $arrayElemAt: ["$userDetails", 0] }
        }
      }
    );

    // Add searchTerm filter to the pipeline if it exists
    if (searchTerm) {
      aggregationPipeline.push({
        $match: {
          $or: [
            { accountNo: { $regex: searchTerm, $options: "i" } },
            { accountName: { $regex: searchTerm, $options: "i" } },
            { "userDetails.firstName": { $regex: searchTerm, $options: "i" } },
            { "userDetails.lastName": { $regex: searchTerm, $options: "i" } },
            { "userDetails.email": { $regex: searchTerm, $options: "i" } },
            { "userDetails.phoneNo": { $regex: searchTerm, $options: "i" } },
          ],
        },
      });
    }

    // Add pagination and sorting
    aggregationPipeline.push(
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: parseInt(perPage) },
      {
        $project: {
          accountNo: 1,
          accountName: 1,
          description: 1,
          accountType: 1,
          status: 1,
          balance: 1,
          isSystemAccount: 1,
          isPaymentOption: 1,
          createdAt: 1,
          updatedAt: 1,
          remark: 1,
          "user.userType": 1,
          "userDetails.firstName": 1,
          "userDetails.lastName": 1,
          "userDetails.email": 1,
          "userDetails.phoneNo": 1,
          "accountCategory.subCategoryName": 1,
          "createdBy.userName": 1,
        },
      }
    );

    // Execute the aggregation pipeline
    const accounts = await Account.aggregate(aggregationPipeline);

    // Get the total count of filtered records (for pagination)
    const countPipeline = [...aggregationPipeline];
    countPipeline.splice(countPipeline.length - 3, 3); // Remove $sort, $skip, and $limit stages
    const countResult = await Account.aggregate([
      ...countPipeline,
      { $count: "total" },
    ]);
    const count = countResult[0]?.total || 0;

    if (!accounts?.length) {
      return res.status(200).json({ message: "No accounts found" });
    }

    res.status(200).json({ accounts, count });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Something went wrong!!" });
  }
};

const getAccountById = async (req, res) => {
  try {
    const { accountId } = req.params;
    if (!accountId) {
      return res.status(400).json({ message: "Account id is required." });
    }

    const account = await Account.findById(accountId)
      .populate('accountCategory', 'subCategoryName')
      .populate('createdBy', 'userName');

    if (!account) {
      return res.status(404).json({ message: "No account found!" });
    }

    res.status(200).json(account);
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      error: error.message, 
      message: "Something went wrong while fetching account." 
    });
  }
};

const searchAccounts = async (req, res) => {
  let { searchTerm = "", accountType, isPaymentOption, userType } = req.query;

  try {
    const filters = {
      isDeleted: false,
      status: "Active",
    };

    if (isPaymentOption === "yes") filters.isPaymentOption = true;
    if (isPaymentOption === "no") filters.isPaymentOption = false;
    if (accountType) filters.accountType = accountType;
    if (userType) filters['user.userType'] = userType;

    // Build the search conditions
    const searchConditions = [
      { accountName: { $regex: searchTerm, $options: "i" } },
      { accountNo: { $regex: searchTerm, $options: "i" } },
      { "userDetails.firstName": { $regex: searchTerm, $options: "i" } },
      { "userDetails.lastName": { $regex: searchTerm, $options: "i" } },
      { "userDetails.email": { $regex: searchTerm, $options: "i" } },
      { "userDetails.phoneNo": { $regex: searchTerm, $options: "i" } },
    ];

    const searchMatch = {
      $or: searchConditions,
    };

    const accounts = await Account.aggregate([
      { $match: filters },
      {
        $lookup: {
          from: "buyers",
          let: { userId: "$user.userId", userType: "$user.userType" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$userId"] },
                    { $eq: ["$$userType", "Buyer"] }
                  ]
                }
              }
            }
          ],
          as: "buyerDetails"
        }
      },
      {
        $lookup: {
          from: "sellers",
          let: { userId: "$user.userId", userType: "$user.userType" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$userId"] },
                    { $eq: ["$$userType", "Seller"] }
                  ]
                }
              }
            }
          ],
          as: "sellerDetails"
        }
      },
      {
        $lookup: {
          from: "admins",
          let: { userId: "$user.userId", userType: "$user.userType" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$_id", "$$userId"] },
                    { $eq: ["$$userType", "Admin"] }
                  ]
                }
              }
            }
          ],
          as: "adminDetails"
        }
      },
      {
        $addFields: {
          userDetails: {
            $concatArrays: ["$buyerDetails", "$sellerDetails", "$adminDetails"]
          }
        }
      },
      {
        $addFields: {
          userDetails: { $arrayElemAt: ["$userDetails", 0] }
        }
      },
      { $match: searchMatch },
      { $limit: 100 },
      {
        $project: {
          accountName: 1,
          description: 1,
          accountNo: 1,
          accountType: 1,
          isPaymentOption: 1,
          "user.userType": 1,
          "userDetails.firstName": 1,
          "userDetails.lastName": 1,
          "userDetails.email": 1,
        },
      },
    ]);

    res.status(200).json({ accounts });
  } catch (error) {
    console.error("Error searching accounts:", error);
    return res.status(500).json({ message: "Something went wrong!!" });
  }
};

const updateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { accountNo, status, updatedBy, accountName, description } = req.body;

    // Validate required fields
    if (!accountNo || !accountName || !updatedBy) {
      return res.status(400).json({ message: "Required fields are missing." });
    }

    const updatedAccount = await Account.findByIdAndUpdate(
      id,
      { accountNo, accountName, status, description },
      { new: true }
    );

    if (!updatedAccount) {
      return res.status(404).json({ message: "Account not found." });
    }

    res.status(200).json({
      message: "Account updated successfully.",
      data: updatedAccount,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: error.message, message: "Something went wrong." });
  }
};

const updateAccountRemark = async (req, res) => {
  try {
    const { remark, updatedBy, accountId } = req.body;

    // Validate required fields
    if (!updatedBy || !accountId) {
      return res
        .status(400)
        .json({ message: "Required fields are missing." });
    }

    const account = await Account.findByIdAndUpdate(
      accountId,
      { remark },
      { new: true }
    );

    if (!account) {
      return res.status(404).json({ message: "Account not found." });
    }

    res.status(200).json({
      message: "Account remark updated successfully.",
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: error.message, message: "Something went wrong." });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const { id, deletedById } = req.params;

    // Validate required fields
    if (!deletedById) {
      return res.status(400).json({ message: "DeletedById is required." });
    }

    const deletedAccount = await Account.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedById },
      { new: true }
    );

    if (!deletedAccount) {
      return res.status(404).json({ message: "Account not found." });
    }

    res.status(200).json({
      message: "Account deleted successfully.",
      data: deletedAccount,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: error.message, message: "Something went wrong." });
  }
};

// Additional utility functions for account management
const getAccountsByUserType = async (req, res) => {
  try {
    const { userType } = req.params;
    const { status = "Active" } = req.query;

    const validUserTypes = ["Buyer", "Seller", "Admin"];
    if (!validUserTypes.includes(userType)) {
      return res.status(400).json({
        message: "Invalid userType. Must be one of: Buyer, Seller, Admin",
      });
    }

    const accounts = await Account.find({
      'user.userType': userType,
      status,
      isDeleted: false,
    }).populate('accountCategory', 'subCategoryName');

    res.status(200).json({
      accounts,
      count: accounts.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message,
      message: "Something went wrong while fetching accounts.",
    });
  }
};

const generateAccountNumberForUser = async (req, res) => {
  try {
    const { userType } = req.body;

    if (!userType) {
      return res.status(400).json({
        message: "userType is required",
      });
    }

    const accountNo = await generateAccountNumber(userType);

    res.status(200).json({
      accountNo,
      message: "Account number generated successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message,
      message: "Something went wrong while generating account number.",
    });
  }
};

module.exports = {
  createUserAccount,
  getAccounts,
  updateAccount,
  deleteAccount,
  createSystemAccount,
  searchAccounts,
  createBusinessAccount,
  updateAccountRemark,
  getAccountById,
  getAccountsByUserType,
  generateAccountNumberForUser,
  generateAccountNumber, 
};