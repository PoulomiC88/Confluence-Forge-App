# ConfiForms for Confluence (Forge App)

A production-ready Atlassian Forge app for Confluence that replicates core capabilities of the ConfiForms plugin, with Jira integration for creating issues from form submissions.

## Features

- **Dynamic Form Builder** - Create customizable forms with multiple field types (text, textarea, number, email, dropdown, user picker, date, checkbox)
- **Data Storage** - Store submitted form data using Forge Storage API
- **Configurable Views** - Display submission data in table or list views
- **Jira Integration** - Automatically create Jira issues (with Summary + Assignee) from form submissions
- **User Picker** - Search and select Jira users as assignees
- **Form Validation** - Client-side and server-side validation for all required fields
- **Error Handling** - Structured error responses for all API interactions

## Architecture

```
├── manifest.yml                 # Forge app manifest with permissions
├── package.json                 # Root package with backend dependencies
├── src/
│   ├── resolvers/
│   │   └── index.js             # Forge resolver functions
│   └── services/
│       ├── jiraService.js       # Jira REST API service
│       └── storageService.js    # Forge Storage service
├── static/                      # Custom UI (React)
│   ├── src/
│   │   ├── App.js               # Main application component
│   │   └── components/
│   │       ├── FormBuilder.js   # Form creation/editing UI
│   │       ├── FormRenderer.js  # Form filling UI with user picker
│   │       └── SubmissionsView.js # Data display (table/list views)
│   └── public/
│       └── index.html
└── tests/                       # Unit tests
    ├── resolvers/
    │   └── index.test.js
    └── services/
        ├── jiraService.test.js
        └── storageService.test.js
```

## Permissions

The app requires the following Forge scopes:

- `storage:app` - For Forge Storage (forms and submissions)
- `read:confluence-content.summary` - Read Confluence page content
- `write:jira-work` - Create Jira issues
- `read:jira-user` - Search and validate Jira users
- `read:jira-work` - Read Jira project/issue data

## Development

### Install Dependencies

```bash
npm install
cd static && npm install
```

### Run Tests

```bash
npm test
```

### Build Frontend

```bash
cd static && npm run build
```

### Deploy

```bash
forge deploy
forge install
```

## Jira Integration Flow

1. User creates a form with Jira integration enabled and specifies a project key
2. When submitting the form, the app:
   - Validates required fields (summary, assignee)
   - Validates the assignee exists in Jira
   - Creates a Jira issue via `POST /rest/api/3/issue`
   - Stores the issue key with the submission
   - Displays a clickable link to the created issue

## Data Storage Schema

```json
{
  "formId": "uuid",
  "pageId": "confluence-page-id",
  "userId": "atlassian-account-id",
  "timestamp": "ISO-8601",
  "fieldValues": { "summary": "...", "assignee": "..." },
  "jiraIssueKey": "PROJ-123"
}
```
