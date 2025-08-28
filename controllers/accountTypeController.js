const mongoose = require("mongoose");
const AccountType = require("../models/AccountType");

const accountCategoryArray = ["asset", "liability", "capital"];

const createAccountType = async (req, res) => {
  const { accountTypeName } = req.body;

  if (!accountTypeName)
    return res.status(400).json({ message: "All fields are required" });

  try {
    if (!accountCategoryArray.includes(accountTypeName.trim().toLowerCase()))
      return res
        .status(400)
        .json({
          message: "Account category can be only Asset, Liability or Capital",
        });

    const dupAccountNameType = await AccountType.findOne({
      accountTypeName: { $regex: accountTypeName.trim(), $options: "i" },
      isDeleted: false,
    })
      .lean()
      .exec();

    if (dupAccountNameType)
      return res.status(409).json({ message: "Account type already exists" });

    const accountType = await AccountType.create({
      accountTypeName: accountTypeName.trim().toLowerCase(),
    });
    if (!accountType) return res.status(400).json({ message: "Invalid data" });

    res.status(201).json({ message: "Account type added successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ messag: "Something went wrong" });
  }
};

const editAccountType = async (req, res) => {
  const { accountTypeName, accountTypeId } = req.body;

  if (!accountTypeName || !accountTypeId)
    return res.status(400).json({ message: "All fields are required" });

  try {
    const dupAccountNameType = await AccountType.findOne({
      accountTypeName: { $regex: accountTypeName.trim(), $options: "i" },
    })
      .lean()
      .exec();

    // if (dupAccountNameType && dupAccountNameType._id.toString() !== accountTypeId)
    return res.status(400).json({ message: "Account type cannot be edited" });

    const accountType = await AccountType.findById(accountTypeId);
    if (!accountType)
      return res.status(400).json({ message: "No product type found" });

    accountType.accountTypeName = accountTypeName.trim().toLowerCase();
    await accountType.save();

    res.status(201).json({ message: "Account type updated successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ messag: "Something went wrong" });
  }
};

const getAllAccountTypes = async (req, res) => {
  try {
    const accountTypes = await AccountType.find({ isDeleted: false })
      .lean()
      .exec();

    res.status(200).json(accountTypes);
  } catch (error) {
    console.log(error);
    res.status(500).json({ messag: "Something went wrong" });
  }
};

const deleteAccountTypeById = async (req, res) => {
  const { deleteType, deletedBy, accountTypeId } = req.params;
  if (!accountTypeId || !deletedBy || !deleteType)
    return res.status(400).json({ message: "Account Id is required" });

  try {
    const accountType = await AccountType.findById(accountTypeId).exec();
    if (!accountType)
      return res.status(400).json({ message: "No product type found" });

    if (deleteType === "permanent") {
      await AccountType.findByIdAndDelete(accountTypeId);
      return res
        .status(200)
        .json({ message: "Account type deleted successfully" });
    }
    accountType.isDeleted = true;
    accountType.deletedById = deletedBy;
    await accountType.save();

    res.status(200).json({ message: "Account type deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ messag: "Something went wrong" });
  }
};

module.exports = {
  createAccountType,
  editAccountType,
  getAllAccountTypes,
  deleteAccountTypeById,
};
