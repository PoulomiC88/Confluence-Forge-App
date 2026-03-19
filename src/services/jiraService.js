const api = require('@forge/api');

/**
 * Jira Service - Handles all Jira API interactions
 */

/**
 * Validates that an assignee exists in Jira by checking user details.
 * @param {string} accountId - The Jira account ID of the assignee
 * @returns {Promise<{valid: boolean, error?: string, user?: object}>}
 */
async function validateAssignee(accountId) {
  if (!accountId || typeof accountId !== 'string' || accountId.trim() === '') {
    return { valid: false, error: 'Assignee account ID is required' };
  }

  try {
    const response = await api.asApp().requestJira(
      `/rest/api/3/user?accountId=${encodeURIComponent(accountId.trim())}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 404) {
        return { valid: false, error: 'User not found' };
      }
      return { valid: false, error: `Failed to validate assignee: ${errorBody}` };
    }

    const user = await response.json();
    return { valid: true, user };
  } catch (err) {
    return { valid: false, error: `Error validating assignee: ${err.message}` };
  }
}

/**
 * Creates a Jira issue with the given fields.
 * @param {object} params
 * @param {string} params.projectKey - The Jira project key (e.g., "PROJ")
 * @param {string} params.summary - Issue summary
 * @param {string} params.assigneeAccountId - The assignee's Jira account ID
 * @param {string} [params.issueType="Task"] - Issue type name
 * @param {string} [params.description] - Optional issue description
 * @param {string} [params.priority] - Optional priority name
 * @returns {Promise<{success: boolean, issueKey?: string, issueId?: string, error?: string}>}
 */
async function createIssue({ projectKey, summary, assigneeAccountId, issueType = 'Task', description, priority }) {
  // Validate required fields
  if (!projectKey || typeof projectKey !== 'string' || projectKey.trim() === '') {
    return { success: false, error: 'Project key is required' };
  }

  if (!summary || typeof summary !== 'string' || summary.trim() === '') {
    return { success: false, error: 'Summary is required' };
  }

  if (!assigneeAccountId || typeof assigneeAccountId !== 'string' || assigneeAccountId.trim() === '') {
    return { success: false, error: 'Assignee account ID is required' };
  }

  // Build the issue payload
  const fields = {
    project: {
      key: projectKey.trim(),
    },
    summary: summary.trim(),
    issuetype: {
      name: issueType,
    },
    assignee: {
      accountId: assigneeAccountId.trim(),
    },
  };

  if (description) {
    fields.description = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: description,
            },
          ],
        },
      ],
    };
  }

  if (priority) {
    fields.priority = {
      name: priority,
    };
  }

  try {
    const response = await api.asApp().requestJira('/rest/api/3/issue', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = `Jira API error (${response.status})`;

      try {
        const errorJson = JSON.parse(errorBody);
        if (errorJson.errors) {
          errorMessage = Object.values(errorJson.errors).join(', ');
        } else if (errorJson.errorMessages && errorJson.errorMessages.length > 0) {
          errorMessage = errorJson.errorMessages.join(', ');
        }
      } catch (e) {
        errorMessage = errorBody || errorMessage;
      }

      return { success: false, error: errorMessage };
    }

    const result = await response.json();
    return {
      success: true,
      issueKey: result.key,
      issueId: result.id,
    };
  } catch (err) {
    return { success: false, error: `Failed to create Jira issue: ${err.message}` };
  }
}

/**
 * Searches for Jira users by query string (email or display name).
 * @param {string} query - Search query
 * @returns {Promise<{success: boolean, users?: Array, error?: string}>}
 */
async function searchUsers(query) {
  if (!query || typeof query !== 'string' || query.trim() === '') {
    return { success: false, error: 'Search query is required' };
  }

  try {
    const response = await api.asApp().requestJira(
      `/rest/api/3/user/search?query=${encodeURIComponent(query.trim())}&maxResults=10`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, error: `Failed to search users: ${errorBody}` };
    }

    const users = await response.json();
    return {
      success: true,
      users: users.map((u) => ({
        accountId: u.accountId,
        displayName: u.displayName,
        emailAddress: u.emailAddress,
        avatarUrl: u.avatarUrls?.['48x48'],
      })),
    };
  } catch (err) {
    return { success: false, error: `Error searching users: ${err.message}` };
  }
}

/**
 * Fetches available projects from Jira.
 * @returns {Promise<{success: boolean, projects?: Array, error?: string}>}
 */
async function getProjects() {
  try {
    const response = await api.asApp().requestJira('/rest/api/3/project/search?maxResults=50', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { success: false, error: `Failed to fetch projects: ${errorBody}` };
    }

    const data = await response.json();
    return {
      success: true,
      projects: data.values.map((p) => ({
        key: p.key,
        name: p.name,
        id: p.id,
      })),
    };
  } catch (err) {
    return { success: false, error: `Error fetching projects: ${err.message}` };
  }
}

module.exports = {
  validateAssignee,
  createIssue,
  searchUsers,
  getProjects,
};
