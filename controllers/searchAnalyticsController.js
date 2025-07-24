const  SearchAnalytics  = require('../models/SearchAnalytics');
const  Product  = require('../models/Product');

// @desc    Record search query
// @route   POST /api/search/track
// @access  Public
const trackSearch = async (req, res) => {
  try {
    const {
      query,
      filters,
      resultsCount,
      clickedResults
    } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }
    
    // Normalize query (lowercase, trim, remove special chars)
    const normalizedQuery = query.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
    
    const searchData = {
      query,
      normalizedQuery,
      user: req.user?.id || null,
      filters: filters || {},
      resultsCount: resultsCount || 0,
      clickedResults: clickedResults || [],
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
      sessionId: req.sessionID || null,
      searchDuration: req.body.searchDuration || null,
      successful: resultsCount > 0
    };
    
    await SearchAnalytics.create(searchData);
    
    res.status(201).json({
      success: true,
      message: 'Search tracked successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Get search suggestions
// @route   GET /api/search/suggestions
// @access  Public
const getSearchSuggestions = async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(200).json({
        success: true,
        suggestions: []
      });
    }
    
    const normalizedQuery = query.toLowerCase().trim();
    
    // Get popular search terms that start with the query
    const suggestions = await SearchAnalytics.aggregate([
      {
        $match: {
          normalizedQuery: { $regex: `^${normalizedQuery}`, $options: 'i' },
          successful: true,
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
        }
      },
      {
        $group: {
          _id: '$normalizedQuery',
          count: { $sum: 1 },
          avgResults: { $avg: '$resultsCount' },
          lastSearched: { $max: '$createdAt' }
        }
      },
      {
        $sort: { count: -1, lastSearched: -1 }
      },
      {
        $limit: parseInt(limit)
      },
      {
        $project: {
          query: '$_id',
          popularity: '$count',
          avgResults: { $round: ['$avgResults', 0] }
        }
      }
    ]);
    
    // Also get product titles that match
    const productSuggestions = await Product.find({
      $or: [
        { title: { $regex: normalizedQuery, $options: 'i' } },
        { tags: { $in: [new RegExp(normalizedQuery, 'i')] } }
      ],
      status: 'active'
    })
    .select('title')
    .limit(5);
    
    const productTitles = productSuggestions.map(p => ({
      query: p.title,
      type: 'product',
      popularity: 0
    }));
    
    // Combine and deduplicate
    const allSuggestions = [...suggestions, ...productTitles];
    const uniqueSuggestions = allSuggestions.filter((suggestion, index, self) =>
      index === self.findIndex(s => s.query === suggestion.query)
    );
    
    res.status(200).json({
      success: true,
      suggestions: uniqueSuggestions.slice(0, limit)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Get popular searches
// @route   GET /api/search/popular
// @access  Public
const getPopularSearches = async (req, res) => {
  try {
    const { period = 'week', limit = 20 } = req.query;
    
    let dateFilter;
    switch (period) {
      case 'day':
        dateFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }
    
    const popularSearches = await SearchAnalytics.aggregate([
      {
        $match: {
          createdAt: { $gte: dateFilter },
          successful: true
        }
      },
      {
        $group: {
          _id: '$normalizedQuery',
          count: { $sum: 1 },
          avgResults: { $avg: '$resultsCount' },
          uniqueUsers: { $addToSet: '$user' },
          lastSearched: { $max: '$createdAt' }
        }
      },
      {
        $addFields: {
          uniqueUserCount: { $size: '$uniqueUsers' }
        }
      },
      {
        $sort: { count: -1, uniqueUserCount: -1 }
      },
      {
        $limit: parseInt(limit)
      },
      {
        $project: {
          query: '$_id',
          searchCount: '$count',
          uniqueUsers: '$uniqueUserCount',
          avgResults: { $round: ['$avgResults', 0] },
          lastSearched: '$lastSearched'
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      count: popularSearches.length,
      period,
      popularSearches
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Get search analytics (Admin)
// @route   GET /api/search/analytics
// @access  Admin only
const getSearchAnalytics = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id);
    if (!admin.hasPermission('analytics', 'view')) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }
    
    const { period = 'month' } = req.query;
    
    let dateFilter;
    switch (period) {
      case 'week':
        dateFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        dateFilter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }
    
    // Overall search statistics
    const overallStats = await SearchAnalytics.aggregate([
      { $match: { createdAt: { $gte: dateFilter } } },
      {
        $group: {
          _id: null,
          totalSearches: { $sum: 1 },
          successfulSearches: { $sum: { $cond: ['$successful', 1, 0] } },
          uniqueUsers: { $addToSet: '$user' },
          avgResultsCount: { $avg: '$resultsCount' },
          totalClicks: { $sum: { $size: { $ifNull: ['$clickedResults', []] } } }
        }
      },
      {
        $addFields: {
          uniqueUserCount: { $size: '$uniqueUsers' },
          successRate: { $multiply: [{ $divide: ['$successfulSearches', '$totalSearches'] }, 100] },
          avgClicksPerSearch: { $divide: ['$totalClicks', '$totalSearches'] }
        }
      }
    ]);
    
    // Daily search trends
    const dailyTrends = await SearchAnalytics.aggregate([
      { $match: { createdAt: { $gte: dateFilter } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          totalSearches: { $sum: 1 },
          successfulSearches: { $sum: { $cond: ['$successful', 1, 0] } },
          uniqueUsers: { $addToSet: '$user' }
        }
      },
      {
        $addFields: {
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          },
          uniqueUserCount: { $size: '$uniqueUsers' },
          successRate: { $multiply: [{ $divide: ['$successfulSearches', '$totalSearches'] }, 100] }
        }
      },
      { $sort: { date: 1 } }
    ]);
    
    // Top search queries
    const topQueries = await SearchAnalytics.aggregate([
      { $match: { createdAt: { $gte: dateFilter } } },
      {
        $group: {
          _id: '$normalizedQuery',
          count: { $sum: 1 },
          successRate: { $avg: { $cond: ['$successful', 1, 0] } },
          avgResults: { $avg: '$resultsCount' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
      {
        $project: {
          query: '$_id',
          searchCount: '$count',
          successRate: { $multiply: ['$successRate', 100] },
          avgResults: { $round: ['$avgResults', 0] }
        }
      }
    ]);
    
    // Queries with no results (failed searches)
    const failedQueries = await SearchAnalytics.aggregate([
      {
        $match: {
          createdAt: { $gte: dateFilter },
          successful: false
        }
      },
      {
        $group: {
          _id: '$normalizedQuery',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $project: {
          query: '$_id',
          failedCount: '$count'
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      period,
      overallStats: overallStats[0] || {},
      dailyTrends,
      topQueries,
      failedQueries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

module.exports = {
  trackSearch,
  getSearchSuggestions,
  getPopularSearches,
  getSearchAnalytics
};
