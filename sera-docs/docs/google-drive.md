---
sidebar_position: 9
---

# Google Drive Integration (Second Brain)

SERA OS integrates with Google Drive as a **persistent external memory layer** a "Second Brain" that lives outside the server. This integration allows SERA to store documents, export memory snapshots, create spreadsheets, and bridge media assets to social platforms like Meta Threads.

## Architecture

```
┌─────────────────────────────────────────┐
│           SERA Agent Runtime            │
│   Memory · Dialogue · GoalBridge        │
├──────────────┬──────────────────────────┤
│  GoogleDrive │ MemoryConsolidation      │
│  Capability  │ Worker                   │
│  (CRUD)      │ (Weekly Export)          │
├──────────────┴──────────────────────────┤
│     GoogleDriveConnectionRepository     │
│     (OAuth Tokens · Vault Folder ID)    │
├─────────────────────────────────────────┤
│         Google Drive API v3             │
│     User's "SERA Vault" Folder          │
└─────────────────────────────────────────┘
```

The integration is organized into three components:

1. **`GoogleDriveCapability`** Low-level CRUD operations (read, write, list, create spreadsheet) scoped to the user's SERA Vault folder.
2. **`MemoryConsolidationWorker`** Automated weekly export of agent memory and profile data to Drive.
3. **`GoogleDriveConnectionRepository`** Stores per-user OAuth refresh tokens and Vault folder IDs in Supabase.

## Connecting Google Drive

### Step 1 Open the SERA Dashboard

Navigate to [app.seraos.xyz](https://app.seraos.xyz) and connect your wallet. Go to the **Connections** page.

### Step 2 Click "Connect Google Drive"

SERA will redirect you to Google's OAuth consent screen. The requested permission scope is:

| Scope | Purpose |
|-------|---------|
| `drive.file` | Access only files created by or explicitly opened with SERA. SERA **cannot** see your existing Drive files. |

### Step 3 Authorize and Return

After granting consent, Google redirects back to SERA. The system automatically:

1. Exchanges the authorization code for a **long-lived refresh token**.
2. Creates a dedicated **`SERA Vault`** folder in your Drive root.
3. Stores the refresh token encrypted in the database never in application memory.

You'll see the Google Drive card change to **Connected** with a green indicator.

## SERA Vault Folder

All SERA operations are **sandboxed** inside a single folder named `SERA Vault` in your Google Drive root. SERA will never read, modify, or access any files outside this folder.

```
📁 My Drive
└── 📁 SERA Vault
    ├── 📄 SERA_Profile.json
    ├── 📄 SERA_Memory_Snapshot.json
    ├── 📄 SERA_Journal_2026_W35.md
    ├── 📄 trading_preferences.md
    ├── 📄 sales_report_august.csv
    └── 🖼️ product_photo.jpg
```

## Features

### 1. Document Storage (MCP Tools)

SERA exposes four Google Drive tools available through the MCP protocol and the chat interface:

| Tool | Description |
|------|-------------|
| `sera_gdrive_write` | Create or update a text file (Markdown, plain text, CSV) in the SERA Vault. |
| `sera_gdrive_read` | Read the contents of a file by name or file ID. |
| `sera_gdrive_list` | List files in the SERA Vault, with optional name or MIME type filters. |
| `sera_gdrive_create_sheet` | Create a structured spreadsheet (CSV) with column headers and data rows. |

**Example usage via chat:**

> "Save my trading notes to Google Drive."  
> "Create a spreadsheet of this month's expenses."  
> "What files do I have in my SERA Vault?"

### 2. Weekly Memory Consolidation

Every **Sunday at 00:00 UTC**, the `MemoryConsolidationWorker` automatically exports three files to every connected user's SERA Vault:

| File | Contents |
|------|----------|
| `SERA_Profile.json` | The agent's current profile: name, preferences, communication style, and personality parameters. |
| `SERA_Memory_Snapshot.json` | All confirmed long-term beliefs and facts from SERA's Working Memory. |
| `SERA_Journal_YYYY_WNN.md` | A weekly Markdown journal summarizing key interactions, decisions, and reflections for that week. |

This ensures that even if the server is reset or data is purged, the user's agent state is preserved externally in their own Google Drive.

### 3. Pre-Purge Archive (90-Day Retention)

SERA's `HygieneDaemon` enforces a **90-day data retention policy** for conversation logs and session data. Before any data is permanently deleted, the daemon triggers a pre-purge archive:

1. All conversation memories about to expire are serialized.
2. The archive is uploaded to the user's SERA Vault as a timestamped file.
3. Only then does the daemon proceed with deletion.

This guarantees **zero data loss** the user always has a copy in their Drive.

### 4. Media Bridge to Meta Threads

Users can upload images to their SERA Vault on Google Drive and reference them when publishing to Meta Threads. When publishing a Threads post, the user (or Claude via MCP) can specify a `driveFileName`:

```
"Post this photo to Threads" → sera_threads_publish({ text: "New drop!", driveFileName: "product_photo.jpg" })
```

SERA will:
1. Fetch the image from the SERA Vault folder.
2. Generate a temporary public download link.
3. Pass the link to the Threads Media Container API.
4. Publish the post with the attached image.

This eliminates the need for external image hosting your Google Drive doubles as a media library.

## Security & Privacy

- **Minimal Scope**: SERA requests only `drive.file`, the most restrictive Google Drive scope. It can only access files it created or that were explicitly shared with it.
- **Encrypted Token Storage**: OAuth refresh tokens are stored encrypted in Supabase, never in application memory or logs.
- **Automatic Token Refresh**: Access tokens are refreshed on every API call. SERA never stores long-lived access tokens.
- **User Ownership**: The SERA Vault folder and all files within it belong entirely to the user's Google account. Disconnecting SERA does not delete the folder or its contents.
- **Revocation**: Users can disconnect Google Drive at any time from the SERA dashboard, or revoke access directly from their [Google Account permissions](https://myaccount.google.com/permissions).
