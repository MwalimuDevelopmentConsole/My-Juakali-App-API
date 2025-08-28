const mongoose = require("mongoose");
const SubAccountCategory = require("../models/SubAccountCategory");

const createSubAccoutCategory = async (req, res) => {
  const { subCategoryName, createdBy, categoryId } = req.body;

  if (!subCategoryName || !categoryId || !createdBy)
    return res.status(400).json({ message: "All fields are required" });

  try {
    const dupAccountNameType = await SubAccountCategory.findOne({
      subCategoryName: { $regex: subCategoryName.trim(), $options: "i" },
      isDeleted: false,
    })
      .lean()
      .exec();

    if (dupAccountNameType)
      return res
        .status(409)
        .json({ message: "Sub account category already exists" });

    const accountType = await SubAccountCategory.create({
      subCategoryName: subCategoryName.trim().toLowerCase(),
      createdBy,
      categoryId,
    });
    if (!accountType) return res.status(400).json({ message: "Invalid data" });

    res
      .status(201)
      .json({ message: "Sub account category added successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ messag: "Something went wrong" });
  }
};

const editSubAccoutCategory = async (req, res) => {
  const { subCategoryName, subCategoryId } = req.body;

  if (!subCategoryName || !subCategoryId)
    return res.status(400).json({ message: "All fields are required" });

  try {
    const dupAccountNameType = await SubAccountCategory.findOne({
      subCategoryName: { $regex: subCategoryName.trim(), $options: "i" },
    })
      .lean()
      .exec();

    if (
      dupAccountNameType &&
      dupAccountNameType._id.toString() !== subCategoryId
    )
      return res
        .status(400)
        .json({ message: "Sub account category cannot be edited" });

    const accountType = await SubAccountCategory.findById(subCategoryId);
    if (!accountType)
      return res.status(400).json({ message: "No product type found" });

    accountType.subCategoryName = subCategoryName.trim().toLowerCase();
    await accountType.save();

    res
      .status(201)
      .json({ message: "Sub account category updated successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ messag: "Something went wrong" });
  }
};

const getAllSubAccoutCategories = async (req, res) => {
  try {
    const accountTypes = await SubAccountCategory.find({ isDeleted: false })
      .populate("categoryId")
      .lean()
      .exec();

    res.status(200).json(accountTypes);
  } catch (error) {
    console.log(error);
    res.status(500).json({ messag: "Something went wrong" });
  }
};

const deleteSubAccoutCategoryById = async (req, res) => {
  const { deleteType, deletedBy, subCategoryId } = req.params;
  if (!subCategoryId || !deletedBy || !deleteType)
    return res.status(400).json({ message: "Account Id is required" });

  try {
    const accountType = await SubAccountCategory.findById(subCategoryId).exec();
    if (!accountType)
      return res.status(400).json({ message: "No product type found" });

    if (deleteType === "permanent") {
      await SubAccountCategory.findByIdAndDelete(subCategoryId);
      return res
        .status(200)
        .json({ message: "Sub account category deleted successfully" });
    }
    accountType.isDeleted = true;
    accountType.deletedById = deletedBy;
    await accountType.save();

    res
      .status(200)
      .json({ message: "Sub account category deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ messag: "Something went wrong" });
  }
};

module.exports = {
  createSubAccoutCategory,
  editSubAccoutCategory,
  getAllSubAccoutCategories,
  deleteSubAccoutCategoryById,
};
