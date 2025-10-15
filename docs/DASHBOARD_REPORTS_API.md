# Dashboard & Reports API Documentation

**Version:** 1.0.0
**Base URL:** `https://api.myjuakali.com/api` (or your actual API URL)
**Date:** 2025-10-15

---

## Table of Contents

1. [Authentication](#authentication)
2. [Dashboard Endpoints](#dashboard-endpoints)
   - [Admin Dashboard](#1-admin-dashboard)
   - [Seller Dashboard](#2-seller-dashboard)
   - [Marketer Dashboard](#3-marketer-dashboard)
   - [Platform Statistics](#4-platform-statistics)
3. [Report Endpoints](#report-endpoints)
   - [Revenue Report](#1-revenue-report)
   - [User Growth Report](#2-user-growth-report)
   - [Product Performance Report](#3-product-performance-report)
   - [Subscription Report](#4-subscription-report)
   - [Marketer Performance Report](#5-marketer-performance-report)
   - [Search Analytics Report](#6-search-analytics-report)
   - [Financial Summary Report](#7-financial-summary-report)
4. [Common Query Parameters](#common-query-parameters)
5. [Error Responses](#error-responses)

---

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

### User Roles
- **Admin**: Full access to all dashboards and reports
- **Seller**: Access to seller dashboard only
- **Marketer**: Access to marketer dashboard only
- **Public**: Access to platform statistics only

---

## Dashboard Endpoints

### 1. Admin Dashboard

Get comprehensive admin dashboard overview with platform-wide statistics.

**Endpoint:** `GET /api/dashboard/admin`

**Authentication:** Required (Admin only)

**Response:**

```json
{
  "success": true,
  "data": {
    "overview": {
      "totalSellers": 1250,
      "totalBuyers": 5800,
      "totalMarketers": 45,
      "totalProducts": 3200,
      "activeProducts": 2850,
      "pendingProducts": 120,
      "activeSubscriptions": 890,
      "totalRevenue": 4500000
    },
    "growth": {
      "sellers": {
        "current": 85,
        "previous": 62,
        "percentage": "37.10"
      },
      "buyers": {
        "current": 320,
        "previous": 285,
        "percentage": "12.28"
      },
      "products": {
        "current": 210,
        "previous": 185,
        "percentage": "13.51"
      }
    },
    "recentActivities": {
      "recentSellers": [
        {
          "_id": "652abc123def456789012345",
          "firstName": "John",
          "lastName": "Kamau",
          "businessInfo": {
            "businessName": "Kamau Welding Services"
          },
          "createdAt": "2025-10-14T10:30:00Z",
          "status": "active"
        }
      ],
      "recentProducts": [
        {
          "_id": "652abc456def789012345678",
          "title": "Custom Metal Gates",
          "status": "active",
          "createdAt": "2025-10-14T15:20:00Z",
          "pricing": {
            "basePrice": 15000
          },
          "seller": {
            "_id": "652abc123def456789012345",
            "firstName": "John",
            "lastName": "Kamau",
            "businessInfo": {
              "businessName": "Kamau Welding Services"
            }
          }
        }
      ]
    },
    "topPerformers": {
      "topSellers": [
        {
          "_id": "652abc789def012345678901",
          "firstName": "Mary",
          "lastName": "Wanjiku",
          "businessInfo": {
            "businessName": "Wanjiku Tailoring"
          },
          "activity": {
            "totalRevenue": 250000,
            "totalProducts": 45
          },
          "ratings": {
            "average": 4.8
          }
        }
      ]
    },
    "trends": {
      "revenue": [
        {
          "_id": { "year": 2025, "month": 5 },
          "revenue": 620000,
          "count": 85
        },
        {
          "_id": { "year": 2025, "month": 6 },
          "revenue": 750000,
          "count": 102
        }
      ],
      "subscriptions": [
        {
          "_id": "Basic Plan",
          "count": 320,
          "revenue": 960000
        },
        {
          "_id": "Premium Plan",
          "count": 180,
          "revenue": 1800000
        },
        {
          "_id": "Pro Plan",
          "count": 95,
          "revenue": 1900000
        }
      ]
    }
  }
}
```

---

### 2. Seller Dashboard

Get seller-specific dashboard with their products and performance metrics.

**Endpoint:** `GET /api/dashboard/seller`

**Authentication:** Required (Seller only)

**Response:**

```json
{
  "success": true,
  "data": {
    "seller": {
      "id": "652abc123def456789012345",
      "name": "John Kamau",
      "businessName": "Kamau Welding Services",
      "rating": 4.5,
      "totalReviews": 28,
      "verificationScore": 70,
      "status": "active"
    },
    "overview": {
      "totalProducts": 12,
      "activeProducts": 10,
      "draftProducts": 1,
      "pendingProducts": 1,
      "profileViews": 1250,
      "totalRevenue": 85000
    },
    "monthlyStats": {
      "views": 450,
      "inquiries": 38
    },
    "recentProducts": [
      {
        "_id": "652abc456def789012345678",
        "title": "Custom Metal Gates",
        "status": "active",
        "createdAt": "2025-10-10T15:20:00Z",
        "pricing": {
          "basePrice": 15000
        },
        "stats": {
          "views": 125,
          "inquiries": 8,
          "favorites": 12
        },
        "media": {
          "images": [
            {
              "url": "https://cloudinary.com/image1.jpg",
              "isPrimary": true
            }
          ]
        }
      }
    ],
    "topProducts": [
      {
        "_id": "652abc789def012345678902",
        "title": "Metal Security Doors",
        "stats": {
          "views": 320,
          "inquiries": 25,
          "favorites": 35
        },
        "ratings": {
          "average": 4.7,
          "count": 15
        },
        "pricing": {
          "basePrice": 12000
        }
      }
    ],
    "recentReviews": [
      {
        "_id": "652abc012def345678901234",
        "reviewer": {
          "_id": "652abc345def678901234567",
          "firstName": "Peter",
          "lastName": "Omondi",
          "avatar": {
            "url": "https://cloudinary.com/avatar1.jpg"
          }
        },
        "ratings": {
          "overall": 5,
          "quality": 5,
          "communication": 4,
          "timeliness": 5
        },
        "title": "Excellent Work!",
        "comment": "Very professional and quality work. Highly recommended.",
        "createdAt": "2025-10-12T14:30:00Z"
      }
    ],
    "subscription": {
      "plan": "Premium Plan",
      "status": "active",
      "startDate": "2025-09-01T00:00:00Z",
      "endDate": "2025-12-01T00:00:00Z",
      "daysRemaining": 47,
      "features": {
        "maxListings": 50,
        "featuredAds": 5,
        "topAds": 2,
        "prioritySupport": true
      },
      "usage": {
        "listingsUsed": 12,
        "featuredAdsUsed": 2,
        "topAdsUsed": 0
      }
    },
    "trends": {
      "monthlyStats": [
        {
          "_id": { "year": 2025, "month": 8 },
          "products": 10,
          "views": 850,
          "inquiries": 65
        },
        {
          "_id": { "year": 2025, "month": 9 },
          "products": 11,
          "views": 1120,
          "inquiries": 82
        },
        {
          "_id": { "year": 2025, "month": 10 },
          "products": 12,
          "views": 450,
          "inquiries": 38
        }
      ]
    }
  }
}
```

---

### 3. Marketer Dashboard

Get marketer-specific dashboard with referrals and commission data.

**Endpoint:** `GET /api/dashboard/marketer`

**Authentication:** Required (Marketer only)

**Response:**

```json
{
  "success": true,
  "data": {
    "marketer": {
      "id": "652abc987def654321098765",
      "name": "Jane Muthoni",
      "referralCode": "MUTH2025",
      "status": "active",
      "commissionRate": 15
    },
    "overview": {
      "totalReferrals": 48,
      "activeReferrals": 35,
      "monthlyReferrals": 8,
      "pendingCommissions": 12,
      "paidCommissions": 36,
      "totalEarnings": 185000,
      "pendingEarnings": 42000
    },
    "performance": {
      "totalReferrals": 48,
      "activeReferrals": 35,
      "successfulConversions": 35,
      "conversionRate": 72.92,
      "totalCommissionsEarned": 227000,
      "totalCommissionsPaid": 185000,
      "pendingCommissions": 42000
    },
    "recentReferrals": [
      {
        "_id": "652abc234def567890123456",
        "firstName": "David",
        "lastName": "Otieno",
        "businessInfo": {
          "businessName": "Otieno Carpentry"
        },
        "status": "active",
        "createdAt": "2025-10-08T11:20:00Z",
        "currentSubscription": {
          "plan": "652abc567def890123456789",
          "status": "active",
          "billing": {
            "amount": 5000
          }
        }
      }
    ],
    "commissions": {
      "breakdown": [
        {
          "_id": "pending",
          "count": 12,
          "amount": 42000
        },
        {
          "_id": "paid",
          "count": 36,
          "amount": 185000
        },
        {
          "_id": "approved",
          "count": 5,
          "amount": 18500
        }
      ],
      "pending": [
        {
          "_id": "652abc678def901234567890",
          "referredSeller": {
            "_id": "652abc234def567890123456",
            "firstName": "David",
            "lastName": "Otieno",
            "businessInfo": {
              "businessName": "Otieno Carpentry"
            }
          },
          "subscription": {
            "_id": "652abc890def123456789012",
            "plan": "652abc567def890123456789",
            "billing": {
              "amount": 5000
            }
          },
          "commissionAmount": 750,
          "commissionRate": 0.15,
          "subscriptionAmount": 5000,
          "status": "pending",
          "earnedDate": "2025-10-08T11:20:00Z"
        }
      ]
    },
    "trends": {
      "earnings": [
        {
          "_id": { "year": 2025, "month": 7 },
          "earnings": 32000,
          "count": 8
        },
        {
          "_id": { "year": 2025, "month": 8 },
          "earnings": 45000,
          "count": 11
        },
        {
          "_id": { "year": 2025, "month": 9 },
          "earnings": 52000,
          "count": 13
        },
        {
          "_id": { "year": 2025, "month": 10 },
          "earnings": 18000,
          "count": 4
        }
      ]
    }
  }
}
```

---

### 4. Platform Statistics

Get public platform statistics for marketing and landing pages.

**Endpoint:** `GET /api/dashboard/stats`

**Authentication:** Not required (Public)

**Response:**

```json
{
  "success": true,
  "data": {
    "totalSellers": 1250,
    "totalProducts": 2850,
    "totalServices": 1420,
    "averageRating": "4.6",
    "topCategories": [
      {
        "name": "Welding & Metalwork",
        "count": 450
      },
      {
        "name": "Tailoring & Fashion",
        "count": 380
      },
      {
        "name": "Carpentry & Woodwork",
        "count": 320
      },
      {
        "name": "Plumbing Services",
        "count": 285
      },
      {
        "name": "Electrical Services",
        "count": 265
      }
    ]
  }
}
```

---

## Report Endpoints

All report endpoints support the following query parameters:

### Common Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `period` | string | No | `month` | Time period: `today`, `week`, `month`, `quarter`, `year`, `custom` |
| `startDate` | string (ISO 8601) | No* | - | Start date for custom period (required if period=custom) |
| `endDate` | string (ISO 8601) | No* | - | End date for custom period (required if period=custom) |

*Required only when `period=custom`

**Example Usage:**
```
GET /api/reports/revenue?period=month
GET /api/reports/revenue?period=quarter
GET /api/reports/revenue?period=custom&startDate=2025-09-01&endDate=2025-10-15
```

---

### 1. Revenue Report

Get detailed revenue analysis with breakdowns by plan and time period.

**Endpoint:** `GET /api/reports/revenue`

**Authentication:** Required (Admin only)

**Query Parameters:** See [Common Query Parameters](#common-query-parameters)

**Response:**

```json
{
  "success": true,
  "data": {
    "period": "month",
    "dateRange": {
      "startDate": "2025-10-01T00:00:00.000Z",
      "endDate": "2025-10-15T23:59:59.999Z"
    },
    "summary": {
      "totalRevenue": 850000,
      "totalCommissions": 127500,
      "netRevenue": 722500,
      "totalSubscriptions": 102,
      "profitMargin": "85.00"
    },
    "revenueByPlan": [
      {
        "_id": "Pro Plan",
        "revenue": 400000,
        "count": 20,
        "avgAmount": 20000
      },
      {
        "_id": "Premium Plan",
        "revenue": 300000,
        "count": 30,
        "avgAmount": 10000
      },
      {
        "_id": "Basic Plan",
        "revenue": 150000,
        "count": 52,
        "avgAmount": 2884.62
      }
    ],
    "dailyRevenue": [
      {
        "_id": { "year": 2025, "month": 10, "day": 1 },
        "revenue": 45000,
        "count": 5
      },
      {
        "_id": { "year": 2025, "month": 10, "day": 2 },
        "revenue": 62000,
        "count": 8
      },
      {
        "_id": { "year": 2025, "month": 10, "day": 3 },
        "revenue": 38000,
        "count": 4
      }
    ],
    "commissions": {
      "total": 127500,
      "count": 48
    }
  }
}
```

---

### 2. User Growth Report

Get user growth analytics with breakdowns by role, status, and location.

**Endpoint:** `GET /api/reports/user-growth`

**Authentication:** Required (Admin only)

**Query Parameters:** See [Common Query Parameters](#common-query-parameters)

**Response:**

```json
{
  "success": true,
  "data": {
    "period": "month",
    "dateRange": {
      "startDate": "2025-10-01T00:00:00.000Z",
      "endDate": "2025-10-15T23:59:59.999Z"
    },
    "summary": {
      "totalSellers": 85,
      "totalBuyers": 320,
      "totalMarketers": 8
    },
    "growth": {
      "sellers": [
        {
          "_id": { "year": 2025, "month": 10, "day": 1 },
          "count": 3
        },
        {
          "_id": { "year": 2025, "month": 10, "day": 2 },
          "count": 5
        },
        {
          "_id": { "year": 2025, "month": 10, "day": 3 },
          "count": 7
        }
      ],
      "buyers": [
        {
          "_id": { "year": 2025, "month": 10, "day": 1 },
          "count": 15
        },
        {
          "_id": { "year": 2025, "month": 10, "day": 2 },
          "count": 22
        },
        {
          "_id": { "year": 2025, "month": 10, "day": 3 },
          "count": 18
        }
      ],
      "marketers": [
        {
          "_id": { "year": 2025, "month": 10, "day": 5 },
          "count": 2
        },
        {
          "_id": { "year": 2025, "month": 10, "day": 12 },
          "count": 1
        }
      ]
    },
    "sellerAnalysis": {
      "byStatus": [
        {
          "_id": "active",
          "count": 62
        },
        {
          "_id": "pending",
          "count": 18
        },
        {
          "_id": "suspended",
          "count": 5
        }
      ],
      "byLocation": [
        {
          "_id": "Nairobi",
          "count": 35
        },
        {
          "_id": "Mombasa",
          "count": 18
        },
        {
          "_id": "Kisumu",
          "count": 12
        },
        {
          "_id": "Nakuru",
          "count": 10
        }
      ],
      "verification": {
        "emailVerified": 78,
        "phoneVerified": 72,
        "identityVerified": 45,
        "businessVerified": 38,
        "total": 85
      }
    }
  }
}
```

---

### 3. Product Performance Report

Get product performance analytics with views, inquiries, and category breakdowns.

**Endpoint:** `GET /api/reports/product-performance`

**Authentication:** Required (Admin only)

**Query Parameters:** See [Common Query Parameters](#common-query-parameters)

**Response:**

```json
{
  "success": true,
  "data": {
    "period": "month",
    "dateRange": {
      "startDate": "2025-10-01T00:00:00.000Z",
      "endDate": "2025-10-15T23:59:59.999Z"
    },
    "summary": {
      "totalProducts": 210,
      "totalViews": 15680,
      "totalInquiries": 1250,
      "totalFavorites": 890,
      "avgViews": 74.67,
      "avgInquiries": 5.95
    },
    "breakdown": {
      "byStatus": [
        {
          "_id": "active",
          "count": 185
        },
        {
          "_id": "pending_approval",
          "count": 20
        },
        {
          "_id": "draft",
          "count": 5
        }
      ],
      "byType": [
        {
          "_id": "product",
          "count": 125,
          "totalViews": 9850
        },
        {
          "_id": "service",
          "count": 85,
          "totalViews": 5830
        }
      ],
      "byCategory": [
        {
          "name": "Welding & Metalwork",
          "count": 45,
          "views": 3850,
          "inquiries": 320
        },
        {
          "name": "Tailoring & Fashion",
          "count": 38,
          "views": 3200,
          "inquiries": 285
        },
        {
          "name": "Carpentry & Woodwork",
          "count": 32,
          "views": 2680,
          "inquiries": 220
        }
      ]
    },
    "topPerformers": {
      "byViews": [
        {
          "_id": "652abc456def789012345678",
          "title": "Custom Metal Gates",
          "stats": {
            "views": 520,
            "inquiries": 45,
            "favorites": 65
          },
          "ratings": {
            "average": 4.8,
            "count": 22
          },
          "pricing": {
            "basePrice": 15000
          },
          "seller": {
            "_id": "652abc123def456789012345",
            "firstName": "John",
            "lastName": "Kamau",
            "businessInfo": {
              "businessName": "Kamau Welding Services"
            }
          }
        }
      ],
      "byInquiries": [
        {
          "_id": "652abc789def012345678902",
          "title": "Wedding Dress Tailoring",
          "stats": {
            "views": 380,
            "inquiries": 52,
            "favorites": 48
          },
          "ratings": {
            "average": 4.9,
            "count": 18
          },
          "pricing": {
            "basePrice": 8000
          },
          "seller": {
            "_id": "652abc789def012345678901",
            "firstName": "Mary",
            "lastName": "Wanjiku",
            "businessInfo": {
              "businessName": "Wanjiku Tailoring"
            }
          }
        }
      ]
    },
    "trends": {
      "dailyCreation": [
        {
          "_id": { "year": 2025, "month": 10, "day": 1 },
          "count": 12
        },
        {
          "_id": { "year": 2025, "month": 10, "day": 2 },
          "count": 15
        },
        {
          "_id": { "year": 2025, "month": 10, "day": 3 },
          "count": 18
        }
      ]
    }
  }
}
```

---

### 4. Subscription Report

Get subscription analytics with churn analysis and renewal statistics.

**Endpoint:** `GET /api/reports/subscriptions`

**Authentication:** Required (Admin only)

**Query Parameters:** See [Common Query Parameters](#common-query-parameters)

**Response:**

```json
{
  "success": true,
  "data": {
    "period": "month",
    "dateRange": {
      "startDate": "2025-10-01T00:00:00.000Z",
      "endDate": "2025-10-15T23:59:59.999Z"
    },
    "summary": {
      "total": 102,
      "totalRevenue": 850000,
      "byStatus": [
        {
          "_id": "active",
          "count": 95,
          "totalRevenue": 820000
        },
        {
          "_id": "cancelled",
          "count": 5,
          "totalRevenue": 25000
        },
        {
          "_id": "expired",
          "count": 2,
          "totalRevenue": 5000
        }
      ]
    },
    "breakdown": {
      "byPlan": [
        {
          "_id": "Pro Plan",
          "count": 20,
          "revenue": 400000,
          "activeCount": 19
        },
        {
          "_id": "Premium Plan",
          "count": 30,
          "revenue": 300000,
          "activeCount": 28
        },
        {
          "_id": "Basic Plan",
          "count": 52,
          "revenue": 150000,
          "activeCount": 48
        }
      ],
      "byCycle": [
        {
          "_id": "monthly",
          "count": 65,
          "revenue": 325000
        },
        {
          "_id": "quarterly",
          "count": 25,
          "revenue": 275000
        },
        {
          "_id": "yearly",
          "count": 12,
          "revenue": 250000
        }
      ]
    },
    "churnAnalysis": {
      "reasons": [
        {
          "_id": "Too expensive",
          "count": 3
        },
        {
          "_id": "Not enough features",
          "count": 1
        },
        {
          "_id": "Business closed",
          "count": 1
        }
      ],
      "total": 5
    },
    "renewals": {
      "totalAutoRenewEnabled": 87,
      "totalAutoRenewDisabled": 15,
      "avgRenewalAttempts": 0.5
    },
    "trials": {
      "total": 15,
      "converted": 12,
      "conversionRate": "80.00"
    }
  }
}
```

---

### 5. Marketer Performance Report

Get marketer performance analytics with commission and referral data.

**Endpoint:** `GET /api/reports/marketer-performance`

**Authentication:** Required (Admin only)

**Query Parameters:** See [Common Query Parameters](#common-query-parameters)

**Response:**

```json
{
  "success": true,
  "data": {
    "period": "month",
    "dateRange": {
      "startDate": "2025-10-01T00:00:00.000Z",
      "endDate": "2025-10-15T23:59:59.999Z"
    },
    "summary": {
      "totalCommissions": 127500,
      "totalReferrals": 48,
      "activeReferrals": 35,
      "conversionRate": "72.92"
    },
    "topPerformers": [
      {
        "_id": "652abc987def654321098765",
        "firstName": "Jane",
        "lastName": "Muthoni",
        "marketerInfo": {
          "referralCode": "MUTH2025",
          "performance": {
            "totalReferrals": 48,
            "activeReferrals": 35,
            "totalCommissionsEarned": 227000,
            "totalCommissionsPaid": 185000
          }
        },
        "location": {
          "county": "Nairobi"
        }
      }
    ],
    "commissions": {
      "byStatus": [
        {
          "_id": "paid",
          "count": 36,
          "totalAmount": 82000
        },
        {
          "_id": "approved",
          "count": 5,
          "totalAmount": 18500
        },
        {
          "_id": "pending",
          "count": 12,
          "totalAmount": 27000
        }
      ],
      "byMarketer": [
        {
          "marketer": {
            "id": "652abc987def654321098765",
            "name": "Jane Muthoni",
            "referralCode": "MUTH2025"
          },
          "totalCommissions": 52000,
          "count": 18
        },
        {
          "marketer": {
            "id": "652abc654def321098765432",
            "name": "Peter Kariuki",
            "referralCode": "KARI2025"
          },
          "totalCommissions": 38000,
          "count": 14
        }
      ]
    }
  }
}
```

---

### 6. Search Analytics Report

Get search behavior analytics with top queries and trends.

**Endpoint:** `GET /api/reports/search-analytics`

**Authentication:** Required (Admin only)

**Query Parameters:** See [Common Query Parameters](#common-query-parameters)

**Response:**

```json
{
  "success": true,
  "data": {
    "period": "month",
    "dateRange": {
      "startDate": "2025-10-01T00:00:00.000Z",
      "endDate": "2025-10-15T23:59:59.999Z"
    },
    "topQueries": [
      {
        "_id": "welding services nairobi",
        "count": 285,
        "avgResults": 42.5
      },
      {
        "_id": "custom furniture",
        "count": 220,
        "avgResults": 38.2
      },
      {
        "_id": "wedding dress tailoring",
        "count": 195,
        "avgResults": 28.8
      },
      {
        "_id": "metal gates",
        "count": 178,
        "avgResults": 52.3
      }
    ],
    "noResultSearches": [
      {
        "_id": "drone photography services",
        "count": 15
      },
      {
        "_id": "3d printing services",
        "count": 12
      },
      {
        "_id": "custom motorcycle parts",
        "count": 8
      }
    ],
    "trends": [
      {
        "_id": { "year": 2025, "month": 10, "day": 1 },
        "searchCount": 320,
        "avgResults": 35.8
      },
      {
        "_id": { "year": 2025, "month": 10, "day": 2 },
        "searchCount": 385,
        "avgResults": 38.2
      },
      {
        "_id": { "year": 2025, "month": 10, "day": 3 },
        "searchCount": 410,
        "avgResults": 40.5
      }
    ],
    "searchesByCategory": [
      {
        "_id": "652abc111def222333444555",
        "count": 520
      },
      {
        "_id": "652abc222def333444555666",
        "count": 385
      }
    ]
  }
}
```

---

### 7. Financial Summary Report

Get comprehensive financial overview with income, expenses, and profit analysis.

**Endpoint:** `GET /api/reports/financial-summary`

**Authentication:** Required (Admin only)

**Query Parameters:** See [Common Query Parameters](#common-query-parameters)

**Response:**

```json
{
  "success": true,
  "data": {
    "period": "month",
    "dateRange": {
      "startDate": "2025-10-01T00:00:00.000Z",
      "endDate": "2025-10-15T23:59:59.999Z"
    },
    "summary": {
      "totalIncome": 850000,
      "totalExpenses": 127500,
      "netProfit": 722500,
      "profitMargin": "85.00"
    },
    "income": {
      "subscriptions": {
        "amount": 850000,
        "count": 102
      }
    },
    "expenses": {
      "commissions": {
        "amount": 127500,
        "count": 48
      }
    },
    "ledgerEntries": [
      {
        "_id": "subscription_payment",
        "totalDebit": 0,
        "totalCredit": 850000,
        "count": 102
      },
      {
        "_id": "commission_payment",
        "totalDebit": 127500,
        "totalCredit": 0,
        "count": 48
      },
      {
        "_id": "platform_fee",
        "totalDebit": 0,
        "totalCredit": 12500,
        "count": 5
      }
    ]
  }
}
```

---

## Error Responses

All endpoints return consistent error responses:

### 400 Bad Request
```json
{
  "success": false,
  "message": "Invalid date range provided",
  "statusCode": 400
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Authentication required",
  "statusCode": 401
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Access denied. Admin privileges required.",
  "statusCode": 403
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Seller not found",
  "statusCode": 404
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Error fetching dashboard data",
  "error": "Detailed error message (development only)",
  "statusCode": 500
}
```

---

## Integration Examples

### JavaScript/Axios

```javascript
// Get Admin Dashboard
const getAdminDashboard = async () => {
  try {
    const response = await axios.get('https://api.myjuakali.com/api/dashboard/admin', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log(response.data);
  } catch (error) {
    console.error('Error:', error.response.data);
  }
};

// Get Revenue Report with Custom Date Range
const getRevenueReport = async (startDate, endDate) => {
  try {
    const response = await axios.get('https://api.myjuakali.com/api/reports/revenue', {
      params: {
        period: 'custom',
        startDate: startDate,
        endDate: endDate
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log(response.data);
  } catch (error) {
    console.error('Error:', error.response.data);
  }
};
```

### React Example

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

function SellerDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await axios.get(
          'https://api.myjuakali.com/api/dashboard/seller',
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          }
        );
        setDashboard(response.data.data);
      } catch (error) {
        console.error('Error fetching dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>{dashboard.seller.businessName}</h1>
      <div className="stats">
        <div>Total Products: {dashboard.overview.totalProducts}</div>
        <div>Active Products: {dashboard.overview.activeProducts}</div>
        <div>Total Revenue: KES {dashboard.overview.totalRevenue.toLocaleString()}</div>
      </div>
    </div>
  );
}
```

---

## Notes for Frontend Team

1. **Authentication**: All protected endpoints require a valid JWT token. Store the token securely (e.g., localStorage or httpOnly cookies).

2. **Date Handling**: All dates are in ISO 8601 format (UTC). Convert to local timezone in the frontend as needed.

3. **Currency**: All monetary values are in Kenyan Shillings (KES) and represented as numbers (not formatted strings).

4. **Pagination**: Currently, reports return all data. Future versions may implement pagination for large datasets.

5. **Caching**: Consider implementing client-side caching for dashboard data (e.g., 5-minute cache) to reduce API calls.

6. **Error Handling**: Always implement proper error handling for API calls. Check the `success` field in responses.

7. **Loading States**: Dashboard and report data can take 1-3 seconds to load. Implement loading indicators.

8. **Rate Limiting**: API may implement rate limiting in the future. Handle 429 status codes appropriately.

9. **Real-time Updates**: For real-time dashboard updates, consider implementing polling (every 30-60 seconds) or WebSocket connections.

10. **Charts & Visualizations**: The trend data is provided in a format suitable for charting libraries like Chart.js, Recharts, or D3.js.

---

## Support

For questions or issues with the API, contact:
- **API Team**: api-support@myjuakali.com
- **Documentation**: https://docs.myjuakali.com
- **Slack Channel**: #api-integration

**Last Updated:** October 15, 2025
