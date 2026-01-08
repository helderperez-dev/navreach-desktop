# Reavion API: Desktop Agent Integration Guide

This document provides the standard instructions, endpoints, and code examples for integration with the Reavion Web API via external agents, scrapers, or custom tools.

## 1. Credentials & Authorization

Access to the API is authorized via a unique API Key (UUID) assigned to each user.

- **Auth Header**: `x-api-key: <USER_API_KEY>`
- **Database Location**: 
  - **Table**: `public.profiles`
  - **Column**: `api_key` (UUID)
- **Status Toggle**: The user must have **External Target Collection** enabled in their Integrations Settings.
- **Base URL**: `https://reavion.com/api` (Default Production)

### Local Configuration (.env)
If you are developing an integration, you should store the API URL and Key in environment variables:

```env
REAVION_API_URL=https://reavion.com/api
REAVION_API_KEY=your-uuid-api-key
```

---

## 2. API Endpoints

### Target Groups (Lists)
Used to organize leads into folders/groups.

| Action | Endpoint | Method | Description |
| :--- | :--- | :--- | :--- |
| **List Groups** | `/target-lists` | `GET` | Fetch all folders for the user |
| **Create Group** | `/target-lists` | `POST` | Create a new folder |
| **Delete Group** | `/target-lists/{id}` | `DELETE` | Removes group and all child targets |

**Create Group Example:**
```json
{
  "name": "B2B SaaS Leads",
  "description": "Captured via Desktop Agent"
}
```

### Targets (Leads)
Full CRUD access to individual leads.

| Action | Endpoint | Method | Description |
| :--- | :--- | :--- | :--- |
| **List Targets** | `/targets?list_id={uuid}` | `GET` | Filter by folder ID |
| **Update Target** | `/targets/{id}` | `PATCH` | Update status, metadata, or info |
| **Delete Target** | `/targets/{id}` | `DELETE` | Remove a single lead |

---

## 3. Recommended Workflow: The "Event" Endpoint

For agents performing web scraping or background data collection, the `/targets/event` endpoint is the primary tool. It handles creation and **deduplication** in one step.

### `POST /api/targets/event`

**Body Structure:**
```json
{
  "name": "Full Name",
  "type": "x_profile", 
  "url": "https://x.com/username",
  "email": "user@example.com",
  "list_id": "optional-uuid",
  "tags": ["desktop-agent", "priority"],
  "metadata": {
    "bio": "Building in public",
    "followers": 1200
  }
}
```

**Note on Types**: Recommended values for `type` are `x_profile`, `linkedin_profile`, or `landing_page`.

**Deduplication Logic**: 
The API automatically prevents duplicate entries for the same user. It checks for hits on:
1. The `url` field
2. The `email` field
If a match is found, it returns `200 OK` with the existing ID instead of creating a new row.

---

## 4. Implementation Example (JavaScript)

```javascript
/**
 * Save a discovered lead to Reavion
 * @param {Object} data - { name, url, email, metadata }
 */
async function syncLeadToNavreach(data) {
  const API_KEY = process.env.REAVION_API_KEY;
  const BASE_URL = process.env.REAVION_API_URL || "https://reavion.com/api";

  try {
    const response = await fetch(`${BASE_URL}/api/targets/event`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...data,
        type: 'x_profile', // or automation logic for type
        tags: ['synced-from-desktop']
      })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'API Request failed');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Reavion Sync Error:", error);
    throw error;
  }
}
```

## 5. Error Codes

- **401 Unauthorized**: Missing/invalid API key or "External Collection" is disabled for the account.
- **403 Forbidden**: External target collection is disabled in user settings.
- **405 Method Not Allowed**: Usually indicates you are using a `POST` on a path that only supports `GET`.
- **400 Bad Request**: Missing required fields or invalid JSON.
- **500 Server Error**: Internal system failure.
