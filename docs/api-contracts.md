# Custva API Contracts (MVP)

## Standards

- Base path: `/api/v1`
- Auth: `Authorization: Bearer <access_token>`
- Content type: `application/json`
- Time format: ISO-8601 UTC
- Pagination default: `page=1`, `limit=20`, max `limit=100`

## Standard response envelope

### Success

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input validation failed",
    "details": [
      {
        "field": "mobile",
        "issue": "Invalid phone number format"
      }
    ]
  },
  "meta": {
    "requestId": "uuid"
  }
}
```

## Error code catalog

- `AUTH_INVALID_CREDENTIALS` (401)
- `AUTH_TOKEN_EXPIRED` (401)
- `AUTH_FORBIDDEN` (403)
- `RESOURCE_NOT_FOUND` (404)
- `CONFLICT` (409)
- `VALIDATION_ERROR` (422)
- `RATE_LIMITED` (429)
- `INTERNAL_ERROR` (500)
- `PROVIDER_ERROR` (502)

## Authentication endpoints

### `POST /auth/register`

Request:

```json
{
  "businessName": "Sunrise Cafe",
  "merchantName": "Asha Verma",
  "email": "owner@sunrisecafe.in",
  "password": "StrongPass@123",
  "mobile": "+919999999999"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "merchantId": "uuid",
    "userId": "uuid",
    "verificationRequired": true
  }
}
```

### `POST /auth/login`

Request:

```json
{
  "email": "owner@sunrisecafe.in",
  "password": "StrongPass@123"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "accessToken": "jwt",
    "refreshToken": "jwt",
    "expiresIn": 900,
    "user": {
      "id": "uuid",
      "merchantId": "uuid",
      "role": "merchant_admin"
    }
  }
}
```

### `POST /auth/forgot-password`

Request:

```json
{
  "email": "owner@sunrisecafe.in"
}
```

### `POST /auth/reset-password`

Request:

```json
{
  "token": "reset-token",
  "newPassword": "AnotherStrongPass@123"
}
```

### `POST /auth/refresh`

Request:

```json
{
  "refreshToken": "jwt"
}
```

## Merchant profile

### `GET /merchants/me`

Returns shop profile: `shopName`, `shopAddress`, `pincode`, `shopLogo`, `ownerName`, `email`, `subscriptionStatus`, `itemCategories`.

### `PATCH /merchants/me`

Updatable: `shopName`, `ownerName`, `shopAddress`, `pincode`, `shopLogo`, `email`, `currentRevenue`. Email change returns `emailVerificationRequired: true`.

### `POST /merchants/me/password/request-otp`

Merchant admin only. Returns `{ sent: true, email: "masked@..." }`. OTP email is delivered via the merchant web BFF.

### `POST /merchants/me/password/confirm`

Merchant admin only. Body: `{ newPassword }` (min 8 chars). Called by BFF after email OTP verification.

## Customer endpoints

### `POST /customers`

Request:

```json
{
  "name": "Rohan Gupta",
  "mobile": "9900000001",
  "billingAmount": 650,
  "pincode": "400001",
  "age": 28,
  "notes": "Prefers sugar-free options"
}
```

`pincode` is optional (6 digits when provided).

Behavior:
- Normalizes mobile to E.164 (`+91...`).
- Creates customer if mobile does not exist for merchant.
- Inserts `customer_visits` row and updates aggregates.
- **Lifecycle automation** (if `whatsapp_opt_in`): cancels pending schedules from prior visits, enrolls customer in visit tier (`first_visit`–`fourth_visit` by `total_visits`), schedules Day 0 (+5 min), Day 3/7/14 (+3/7/14 days from visit) WhatsApp jobs on `lifecycle_dispatch_queue`.

### `GET /customers/lookup`

Prefix match on mobile for POS typeahead.

Query: `mobilePrefix` (digits only, min 1), `limit` (default 5, max 10).

Returns up to 5 items: `{ id, name, mobile, pincode, age, totalSpend, totalVisits, lastVisit, autoTags }`.

### `GET /customers/recent`

Returns last 10 newly created customers for dashboard widget.

### `GET /customers`

Query params:
- `page`, `limit`, `q`
- `pincode`, `minSpend`, `maxSpend`, `minVisits`, `maxVisits`, `inactiveDays`, `inactiveDaysExact`, `exactVisits`
- `minAge`, `maxAge`, `createdFrom`, `createdTo`, `lastVisitFrom`, `lastVisitTo`
- `tag` (`New`, `Repeat`, `High-value`, `Inactive`)
- `birthdayMonth`, `campaignEngagement` (`delivered`, `read`, `none`)
- `sortBy` (`name`, `totalSpend`, `totalVisits`, `lastVisit`, `createdAt`, `updatedAt`)

Filter notes:
- `inactiveDays` — last visit at least N days ago (≥).
- `inactiveDaysExact` — last visit exactly N calendar days before today.
- `exactVisits` — `total_visits` equals N.

Response:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "Rohan Gupta",
        "mobile": "+919900000001",
        "totalSpend": 2450,
        "totalVisits": 4,
        "lastVisit": "2026-05-28T10:00:00Z",
        "location": "Bandra"
      }
    ]
  },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 184
  }
}
```

### `GET /customers/:id`

Returns profile and timeline blocks:
- personal info
- aggregate stats
- recent visits
- campaign history
- communication events

### `PUT /customers/:id`

Updatable fields:
- `name`
- `location`
- `notes`

### `DELETE /customers/:id`

Soft-delete preferred for auditability (`deleted_at` strategy) if adopted.

## Campaign endpoints

### `POST /campaigns`

Request:

```json
{
  "campaignName": "Weekend Comeback Offer",
  "templateId": "uuid",
  "audienceRules": {
    "minSpend": 500,
    "inactiveDays": 15,
    "locations": ["Bandra"]
  },
  "ctaLink": "https://custva.in/offer",
  "scheduledAt": "2026-05-30T04:30:00Z"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "campaignId": "uuid",
    "targetCount": 392,
    "status": "scheduled"
  }
}
```

### `GET /campaigns`

Filters:
- `status`
- `fromDate`, `toDate`
- `templateId`

### `GET /campaigns/:id`

Returns campaign summary + delivery counters + conversion snapshot.

### `POST /campaigns/:id/schedule`

Request:

```json
{
  "scheduledAt": "2026-05-30T04:30:00Z"
}
```

### `POST /campaigns/:id/preview-audience`

Returns `{ count, sample[] }` for resolved audience without sending.

### `POST /campaigns/:id/send`

Behavior:
- validates campaign eligibility
- materializes audience from `audienceRules` + manual include/exclude
- snapshots `campaign_audiences`
- enqueues batch jobs in BullMQ
- transitions status to `sending`

## Template endpoints (merchant)

### `POST /templates`

Creates merchant-local template (`approval_status=approved`, `category=cafe`). Template `name` must match Meta-approved template name.

## Analytics endpoints

### `GET /analytics/dashboard`

Response fields include `todayVisits`, `todayRevenue`, `todayRetentionRevenue`, `repeatCustomers`, aggregate totals, and 30-day `series` from `daily_merchant_metrics`.

Today stats are computed live from `customer_visits`:
- `todayRevenue` — sum of all billing today
- `todayRetentionRevenue` — sum of billing today where `is_repeat_visit = true` (customer's 2nd+ visit ever; set at write time on `POST /customers`)

### `GET /analytics/customers`

Top customers, inactive buckets, new vs repeat breakdown.

### `GET /analytics/retention`

Time series with delivery rate and visit metrics.

### `GET /analytics/campaigns`

Campaign send/delivery/failure stats.

### `GET /analytics/templates`

Template usage performance.

### `GET /analytics/segments`

Pincode and age band breakdown.

### `GET /analytics/export?type=customers|metrics`

CSV export stream.

## Admin endpoints

### `GET /admin/merchants`

List merchants with status, subscription, usage stats.

### `PATCH /admin/merchants/:id/status`

Request:

```json
{
  "status": "suspended",
  "reason": "Payment overdue"
}
```

### `GET /admin/analytics/overview`

Platform metrics:
- total merchants
- active campaigns
- total messages sent
- monthly recurring revenue
- platform-wide customer growth
