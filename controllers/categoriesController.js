const Category = require("../models/Category");
const Product = require("../models/Product");
const cloudinary = require("cloudinary").v2;

const getCategories = async (req, res) => {
  try {
    const { level, parent, includeInactive = false, nested = true } = req.query;

    // If specific parent or level is requested, use flat structure
    if (parent || (level !== undefined && level !== "0")) {
      return getSingleLevelCategories(req, res);
    }

    // For nested response (default behavior)
    if (nested === "true" || nested === true) {
      return getNestedCategories(req, res, includeInactive);
    }

    // Fallback to flat structure
    return getSingleLevelCategories(req, res);
  } catch (error) {
    console.error("Error in getCategories:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

/**
 * Calculate product counts for categories
 * Counts products where category is primaryCategory OR in secondaryCategories
 */
const calculateProductCounts = async (categoryIds) => {
  try {
    const counts = await Product.aggregate([
      {
        $match: {
          status: "active",
          $or: [
            { primaryCategory: { $in: categoryIds } },
            { secondaryCategories: { $in: categoryIds } },
          ],
        },
      },
      {
        $facet: {
          primaryCounts: [
            { $group: { _id: "$primaryCategory", count: { $sum: 1 } } },
          ],
          secondaryCounts: [
            { $unwind: "$secondaryCategories" },
            { $group: { _id: "$secondaryCategories", count: { $sum: 1 } } },
          ],
        },
      },
    ]);

    // Merge primary and secondary counts
    const countMap = {};

    counts[0].primaryCounts.forEach((item) => {
      const id = item._id.toString();
      countMap[id] = (countMap[id] || 0) + item.count;
    });

    counts[0].secondaryCounts.forEach((item) => {
      const id = item._id.toString();
      countMap[id] = (countMap[id] || 0) + item.count;
    });

    return countMap;
  } catch (error) {
    console.error("Error calculating product counts:", error);
    return {};
  }
};

/**
 * Get all descendant category IDs (subcategories, sub-subcategories, etc.)
 */
const getDescendantCategoryIds = async (categoryId) => {
  const descendants = [];
  const queue = [categoryId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = await Category.find({ parentCategory: currentId }).select(
      "_id"
    );

    children.forEach((child) => {
      descendants.push(child._id);
      queue.push(child._id);
    });
  }

  return descendants;
};

/**
 * Add product counts to categories (including subcategory counts for parents)
 */
const addProductCountsToCategories = async (categories, productCountMap) => {
  const categoriesWithCounts = await Promise.all(
    categories.map(async (category) => {
      const categoryObj = category.toObject ? category.toObject() : category;
      const categoryId = categoryObj._id.toString();

      // Direct product count for this category
      let directCount = productCountMap[categoryId] || 0;

      // If category has subcategories, add their product counts too
      if (categoryObj.subcategories && categoryObj.subcategories.length > 0) {
        // Get all descendant IDs
        const descendantIds = await getDescendantCategoryIds(categoryObj._id);

        // Sum up all descendant counts
        const descendantCount = descendantIds.reduce((sum, descId) => {
          return sum + (productCountMap[descId.toString()] || 0);
        }, 0);

        categoryObj.productCount = directCount + descendantCount;

        // Recursively add counts to subcategories
        if (categoryObj.subcategories.length > 0) {
          categoryObj.subcategories = await addProductCountsToCategories(
            categoryObj.subcategories,
            productCountMap
          );
        }
      } else {
        categoryObj.productCount = directCount;
      }

      return categoryObj;
    })
  );

  return categoriesWithCounts;
};

/**
 * Get categories in nested structure
 */
const getNestedCategories = async (req, res, includeInactive = false) => {
  try {
    const query = {
      level: 0,
      ...(includeInactive ? {} : { isActive: true }),
    };

    // Get parent categories and populate subcategories
    const categories = await Category.find(query)
      .populate({
        path: "subcategories",
        match: includeInactive ? {} : { isActive: true },
        options: { sort: { sortOrder: 1, name: 1 } },
        populate: {
          path: "subcategories",
          match: includeInactive ? {} : { isActive: true },
          options: { sort: { sortOrder: 1, name: 1 } },
        },
      })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    // Get all category IDs for product count calculation
    const allCategoryIds = [];
    const collectCategoryIds = (cats) => {
      cats.forEach((cat) => {
        allCategoryIds.push(cat._id);
        if (cat.subcategories && cat.subcategories.length > 0) {
          collectCategoryIds(cat.subcategories);
        }
      });
    };
    collectCategoryIds(categories);

    // Calculate product counts for all categories
    const productCountMap = await calculateProductCounts(allCategoryIds);

    // Add product counts to categories
    const categoriesWithCounts = await addProductCountsToCategories(
      categories,
      productCountMap
    );

    res.status(200).json({
      success: true,
      count: categoriesWithCounts.length,
      categories: categoriesWithCounts,
    });
  } catch (error) {
    console.error("Error in getNestedCategories:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

/**
 * Get categories in flat structure (single level)
 */
const getSingleLevelCategories = async (req, res) => {
  try {
    const { level, parent, includeInactive = false } = req.query;

    const query = {
      ...(includeInactive === "true" ? {} : { isActive: true }),
    };

    // Add level or parent filter
    if (level !== undefined) {
      query.level = parseInt(level);
    }
    if (parent) {
      query.parentCategory = parent === "null" ? null : parent;
    }

    const categories = await Category.find(query)
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    // Get category IDs for product count
    const categoryIds = categories.map((cat) => cat._id);

    // Calculate product counts
    const productCountMap = await calculateProductCounts(categoryIds);

    // Add product counts to categories
    const categoriesWithCounts = categories.map((category) => {
      const categoryId = category._id.toString();
      return {
        ...category,
        productCount: productCountMap[categoryId] || 0,
      };
    });

    res.status(200).json({
      success: true,
      count: categoriesWithCounts.length,
      categories: categoriesWithCounts,
    });
  } catch (error) {
    console.error("Error in getSingleLevelCategories:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Get single category with subcategories
const getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate("subcategories")
      .populate("parentCategory");

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Create new category
// @access  Admin only
const createCategory = async (req, res) => {
  try {
    const {
      name,
      description,
      parentCategory,
      dynamicFields,
      metaTitle,
      metaDescription,
      keywords,
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    // Generate slug
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Check if slug already exists
    const existingCategory = await Category.findOne({ slug });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists",
      });
    }

    // Determine level
    let level = 0;
    if (parentCategory) {
      const parent = await Category.findById(parentCategory);
      if (!parent) {
        return res.status(404).json({
          success: false,
          message: "Parent category not found",
        });
      }
      level = parent.level + 1;
    }

    // Handle image upload
    let imageData = {};
    if (req.file) {
      imageData = {
        url: `${process.env.API_DOMAIN}/${req.file.path}`,
        alt: req.file.originalname,
      };
    }

    const categoryData = {
      name,
      slug,
      description,
      image: imageData,
      parentCategory: parentCategory || null,
      level,
      dynamicFields: JSON.parse(dynamicFields) || [],
      metaTitle,
      metaDescription,
      keywords: keywords ? keywords.split(",").map((k) => k.trim()) : [],
    };

    const category = await Category.create(categoryData);

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Update category
// @access  Admin only
const updateCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const {
      name,
      description,
      dynamicFields,
      isActive,
      sortOrder,
      metaTitle,
      metaDescription,
      keywords,
    } = req.body;

    // Update slug if name changed
    if (name && name !== category.name) {
      const newSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const existingCategory = await Category.findOne({
        slug: newSlug,
        _id: { $ne: category._id },
      });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Category with this name already exists",
        });
      }
      category.slug = newSlug;
    }

    // Handle image upload or removal
    let imageData = {};
    if (req.file) {
      // If there was an old image, delete from cloudinary
      if (category.image && category.image.publicId) {
        await cloudinary.uploader.destroy(category.image.publicId);
      }

      imageData = {
        url: `${process.env.API_DOMAIN}/${req.file.path}`,
        alt: req.file.originalname,
      };

      category.image = imageData;
    } else if (req.body.removeImage === "true") {
      // If explicit removal requested
      if (category.image && category.image.publicId) {
        await cloudinary.uploader.destroy(category.image.publicId);
      }
      category.image = null;
    }

    // Update fields
    if (name) category.name = name;
    if (description) category.description = description;
    if (dynamicFields) {
      try {
        category.dynamicFields =
          typeof dynamicFields === "string"
            ? JSON.parse(dynamicFields)
            : dynamicFields;
      } catch (e) {
        console.error("Error parsing dynamicFields:", e);
        // Fallback or let Mongoose handle validation error if strictly needed
      }
    }
    if (isActive !== undefined) category.isActive = isActive;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;
    if (metaTitle) category.metaTitle = metaTitle;
    if (metaDescription) category.metaDescription = metaDescription;
    if (keywords) category.keywords = keywords.split(",").map((k) => k.trim());

    await category.save();

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Delete category
// @access  Admin only
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if category has subcategories
    const subcategories = await Category.find({ parentCategory: category._id });
    if (subcategories.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete category with subcategories. Delete subcategories first.",
      });
    }

    // Delete image from cloudinary
    if (category.image && category.image.publicId) {
      await cloudinary.uploader.destroy(category.image.publicId);
    }

    await category.deleteOne();

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
};
