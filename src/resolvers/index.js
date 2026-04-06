const Resolver = require('@forge/resolver').default;
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
 * Determines whether a custom/dynamic field should be visible based on its
 * conditional-visibility rule (visibleWhen) and the current field values.
 * @param {object} field - A field definition that may contain a visibleWhen rule
 * @param {object} fieldValues - Current map of fieldId/name → value
 * @returns {boolean} true when the field should be visible (and therefore validated/sent)
 */
function isFieldVisible(field, fieldValues) {
  if (!field.visibleWhen) return true;
  const { fieldId: depField, equals } = field.visibleWhen;
  if (!depField) return true;
  return fieldValues[depField] === equals;
}

/**
 * Submits form data and optionally creates a Jira issue.
 * Supports both standard fields and JSON-configured custom fields with
 * conditional visibility logic.
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

    // Combine standard fields with any JSON-configured custom fields
    const allFields = [...(form.fields || [])];
    const customFieldDefs = form.settings?.customFieldsConfig || [];
    if (Array.isArray(customFieldDefs)) {
      allFields.push(...customFieldDefs);
    }

    // Validate required fields (respecting conditional visibility)
    for (const field of allFields) {
      const key = field.fieldId || field.name;
      const visible = isFieldVisible(field, fieldValues);

      // Skip validation for hidden conditional fields
      if (!visible) continue;

      if (field.required) {
        const value = fieldValues[key];
        if (value === undefined || value === null) {
          return { success: false, error: `Field "${field.label || key}" is required` };
        }
        // user_picker stores { accountId, displayName } — check accountId is present
        if (field.type === 'user_picker') {
          const acctId = typeof value === 'object' ? value.accountId : value;
          if (!acctId || (typeof acctId === 'string' && acctId.trim() === '')) {
            return { success: false, error: `Field "${field.label || key}" is required` };
          }
        } else if (field.type === 'checkbox' ? value === false : value.toString().trim() === '') {
          return { success: false, error: `Field "${field.label || key}" is required` };
        }
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
      const assigneeValue = fieldValues.assignee;
      // user_picker fields store { accountId, displayName }; plain strings are also accepted
      const assignee = typeof assigneeValue === 'object' && assigneeValue !== null
        ? assigneeValue.accountId
        : assigneeValue;

      if (!summary || (typeof summary === 'string' && summary.trim() === '')) {
        return { success: false, error: 'Summary is required for Jira issue creation' };
      }

      if (!assignee || (typeof assignee === 'string' && assignee.trim() === '')) {
        return { success: false, error: 'Assignee is required for Jira issue creation' };
      }

      // Validate assignee
      const assigneeValidation = await jiraService.validateAssignee(assignee);
      if (!assigneeValidation.valid) {
        return { success: false, error: `Invalid assignee: ${assigneeValidation.error}` };
      }

      // Build custom fields map from JSON-configured fields for the Jira payload.
      // Only include fields that are currently visible (conditional logic).
      const customFields = {};
      for (const cfDef of customFieldDefs) {
        if (!cfDef.fieldId) continue;
        const visible = isFieldVisible(cfDef, fieldValues);
        if (!visible) continue;
        const val = fieldValues[cfDef.fieldId];
        if (val !== undefined && val !== null && val !== '') {
          customFields[cfDef.fieldId] = cfDef.type === 'number' ? Number(val) : val;
        }
      }

      // Create the Jira issue with standard + custom fields
      const jiraResult = await jiraService.createIssue({
        projectKey,
        summary: typeof summary === 'string' ? summary : String(summary),
        assigneeAccountId: assignee,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
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
 * Supports an optional customFields map for dynamic field values.
 */
resolver.define('createJiraIssue', async ({ payload }) => {
  try {
    const { projectKey, summary, assigneeAccountId, issueType, description, priority, customFields } = payload;

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

    // Sanitize customFields: only allow keys matching customfield_NNNNN pattern
    // to prevent overwriting standard Jira fields (project, summary, etc.).
    let sanitizedCustomFields;
    if (customFields && typeof customFields === 'object') {
      sanitizedCustomFields = {};
      for (const [key, val] of Object.entries(customFields)) {
        if ((/^customfield_\d+$/).test(key)) {
          sanitizedCustomFields[key] = val;
        }
      }
      if (Object.keys(sanitizedCustomFields).length === 0) {
        sanitizedCustomFields = undefined;
      }
    }

    // Create the issue with standard + custom fields
    const result = await jiraService.createIssue({
      projectKey,
      summary,
      assigneeAccountId,
      issueType,
      description,
      priority,
      customFields: sanitizedCustomFields,
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
