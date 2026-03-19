const Resolver = require('@forge/resolver');
const { v4: uuidv4 } = require('uuid');
const jiraService = require('../services/jiraService');
const storageService = require('../services/storageService');

const resolver = new Resolver();

// ─── Form Management Resolvers ────────────────────────────────────

/**
 * Creates a new form definition for a Confluence page.
 */
resolver.define('createForm', async ({ payload, context }) => {
  try {
    const { title, fields, settings, pageId } = payload;

    if (!title || !fields || !Array.isArray(fields)) {
      return { success: false, error: 'Title and fields array are required' };
    }

    const form = {
      id: uuidv4(),
      pageId: pageId || context.extension?.content?.id,
      title,
      fields,
      settings: settings || {},
      createdBy: context.accountId,
      createdAt: new Date().toISOString(),
    };

    await storageService.saveForm(form);

    return { success: true, form };
  } catch (err) {
    return { success: false, error: `Failed to create form: ${err.message}` };
  }
});

/**
 * Retrieves a form by ID.
 */
resolver.define('getForm', async ({ payload }) => {
  try {
    const { formId } = payload;
    if (!formId) {
      return { success: false, error: 'Form ID is required' };
    }

    const form = await storageService.getForm(formId);
    if (!form) {
      return { success: false, error: 'Form not found' };
    }

    return { success: true, form };
  } catch (err) {
    return { success: false, error: `Failed to get form: ${err.message}` };
  }
});

/**
 * Retrieves all forms for a Confluence page.
 */
resolver.define('getFormsByPage', async ({ payload, context }) => {
  try {
    const pageId = payload.pageId || context.extension?.content?.id;
    if (!pageId) {
      return { success: false, error: 'Page ID is required' };
    }

    const forms = await storageService.getFormsByPage(pageId);
    return { success: true, forms };
  } catch (err) {
    return { success: false, error: `Failed to get forms: ${err.message}` };
  }
});

/**
 * Updates an existing form definition.
 */
resolver.define('updateForm', async ({ payload }) => {
  try {
    const { formId, title, fields, settings } = payload;
    if (!formId) {
      return { success: false, error: 'Form ID is required' };
    }

    const existing = await storageService.getForm(formId);
    if (!existing) {
      return { success: false, error: 'Form not found' };
    }

    const updated = {
      ...existing,
      title: title || existing.title,
      fields: fields || existing.fields,
      settings: settings ? { ...existing.settings, ...settings } : existing.settings,
    };

    await storageService.saveForm(updated);
    return { success: true, form: updated };
  } catch (err) {
    return { success: false, error: `Failed to update form: ${err.message}` };
  }
});

/**
 * Deletes a form and all its submissions.
 */
resolver.define('deleteForm', async ({ payload }) => {
  try {
    const { formId } = payload;
    if (!formId) {
      return { success: false, error: 'Form ID is required' };
    }

    // Look up the form's pageId from storage for proper cleanup
    const form = await storageService.getForm(formId);
    const pageId = form ? form.pageId : null;

    await storageService.deleteForm(formId, pageId);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to delete form: ${err.message}` };
  }
});

// ─── Submission Resolvers ─────────────────────────────────────────

/**
 * Submits form data and optionally creates a Jira issue.
 */
resolver.define('submitForm', async ({ payload, context }) => {
  try {
    const { formId, fieldValues, createJiraIssue: shouldCreateJira, projectKey } = payload;

    if (!formId || !fieldValues) {
      return { success: false, error: 'Form ID and field values are required' };
    }

    // Validate the form exists
    const form = await storageService.getForm(formId);
    if (!form) {
      return { success: false, error: 'Form not found' };
    }

    // Validate required fields
    for (const field of form.fields) {
      if (field.required && (fieldValues[field.name] === undefined || fieldValues[field.name] === null || fieldValues[field.name].toString().trim() === '')) {
        return { success: false, error: `Field "${field.label || field.name}" is required` };
      }
    }

    // Create submission record
    const submission = {
      id: uuidv4(),
      formId,
      pageId: form.pageId,
      userId: context.accountId,
      timestamp: new Date().toISOString(),
      fieldValues,
      jiraIssueKey: null,
    };

    // Optionally create a Jira issue
    if (shouldCreateJira && projectKey) {
      const summary = fieldValues.summary;
      const assignee = fieldValues.assignee;

      if (!summary || summary.trim() === '') {
        return { success: false, error: 'Summary is required for Jira issue creation' };
      }

      if (!assignee || assignee.trim() === '') {
        return { success: false, error: 'Assignee is required for Jira issue creation' };
      }

      // Validate assignee
      const assigneeValidation = await jiraService.validateAssignee(assignee);
      if (!assigneeValidation.valid) {
        return { success: false, error: `Invalid assignee: ${assigneeValidation.error}` };
      }

      // Create the Jira issue
      const jiraResult = await jiraService.createIssue({
        projectKey,
        summary,
        assigneeAccountId: assignee,
      });

      if (!jiraResult.success) {
        return { success: false, error: `Jira issue creation failed: ${jiraResult.error}` };
      }

      submission.jiraIssueKey = jiraResult.issueKey;
    }

    await storageService.saveSubmission(submission);

    return {
      success: true,
      submission: {
        id: submission.id,
        jiraIssueKey: submission.jiraIssueKey,
        timestamp: submission.timestamp,
      },
    };
  } catch (err) {
    return { success: false, error: `Failed to submit form: ${err.message}` };
  }
});

/**
 * Retrieves all submissions for a form.
 */
resolver.define('getSubmissions', async ({ payload }) => {
  try {
    const { formId } = payload;
    if (!formId) {
      return { success: false, error: 'Form ID is required' };
    }

    const submissions = await storageService.getSubmissionsByForm(formId);
    return { success: true, submissions };
  } catch (err) {
    return { success: false, error: `Failed to get submissions: ${err.message}` };
  }
});

/**
 * Deletes a submission.
 */
resolver.define('deleteSubmission', async ({ payload }) => {
  try {
    const { submissionId, formId } = payload;
    if (!submissionId) {
      return { success: false, error: 'Submission ID is required' };
    }

    await storageService.deleteSubmission(submissionId, formId);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to delete submission: ${err.message}` };
  }
});

// ─── Jira Integration Resolvers ───────────────────────────────────

/**
 * Creates a Jira issue directly from form data.
 * This is the standalone resolver for Jira issue creation.
 */
resolver.define('createJiraIssue', async ({ payload }) => {
  try {
    const { projectKey, summary, assigneeAccountId, issueType, description, priority } = payload;

    // Validate required fields
    if (!projectKey || projectKey.trim() === '') {
      return { success: false, error: 'Project key is required' };
    }

    if (!summary || summary.trim() === '') {
      return { success: false, error: 'Summary is required' };
    }

    if (!assigneeAccountId || assigneeAccountId.trim() === '') {
      return { success: false, error: 'Assignee is required' };
    }

    // Validate the assignee exists
    const assigneeValidation = await jiraService.validateAssignee(assigneeAccountId);
    if (!assigneeValidation.valid) {
      return { success: false, error: assigneeValidation.error };
    }

    // Create the issue
    const result = await jiraService.createIssue({
      projectKey,
      summary,
      assigneeAccountId,
      issueType,
      description,
      priority,
    });

    return result;
  } catch (err) {
    return { success: false, error: `Failed to create Jira issue: ${err.message}` };
  }
});

/**
 * Searches for Jira users (for user picker functionality).
 */
resolver.define('searchJiraUsers', async ({ payload }) => {
  try {
    const { query } = payload;
    if (!query) {
      return { success: false, error: 'Search query is required' };
    }

    return await jiraService.searchUsers(query);
  } catch (err) {
    return { success: false, error: `Failed to search users: ${err.message}` };
  }
});

/**
 * Fetches available Jira projects.
 */
resolver.define('getJiraProjects', async () => {
  try {
    return await jiraService.getProjects();
  } catch (err) {
    return { success: false, error: `Failed to fetch projects: ${err.message}` };
  }
});

exports.handler = resolver.getDefinitions();
