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

## Customer endpoints

### `POST /customers`

Request:

```json
{
  "name": "Rohan Gupta",
  "mobile": "+919900000001",
  "billingAmount": 650,
  "location": "Bandra",
  "visitDate": "2026-05-28T10:00:00Z",
  "notes": "Prefers sugar-free options"
}
```

Behavior:
- Creates customer if mobile does not exist for merchant.
- If customer exists, appends visit and recalculates aggregates.

### `GET /customers`

Query params:
- `page`, `limit`
- `q` (name/mobile search)
- `minSpend`, `maxSpend`
- `visitCountGte`, `visitCountLte`
- `inactiveDays`
- `location`
- `sortBy` (`lastVisit`, `totalSpend`, `totalVisits`, `createdAt`)
- `sortDir` (`asc`, `desc`)

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

### `POST /campaigns/:id/send`

Behavior:
- validates campaign eligibility
- materializes audience
- enqueues jobs in BullMQ
- transitions status to `sending`

## Analytics endpoints

### `GET /analytics/dashboard`

Response fields:
- `totalCustomers`
- `repeatCustomers`
- `retentionRate`
- `customerGrowth`
- `revenueGrowth`
- `activeCustomers`
- `inactiveCustomers`
- `campaignConversion`
- `revenueFromCampaigns`

### `GET /analytics/retention`

Query params:
- `range` (`7d`, `30d`, `90d`)
- `groupBy` (`day`, `week`)

Response includes trend series and summary delta.

### `GET /analytics/campaigns/:id`

Returns:
- sent/delivered/read/failure counts
- conversion counts
- revenue attributed to campaign

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
