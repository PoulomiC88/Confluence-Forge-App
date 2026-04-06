const { storage } = require('@forge/api');

/**
 * Storage Service - Handles all Forge Storage operations for forms and submissions
 *
 * Storage key patterns:
 *   form:{formId}           → Form definition
 *   forms:page:{pageId}     → List of form IDs for a page
 *   submission:{submissionId} → Individual submission
 *   submissions:form:{formId} → List of submission IDs for a form
 */

// ─── Form Operations ──────────────────────────────────────────────

/**
 * Saves a form definition to storage.
 * @param {object} form - Form object with id, pageId, title, fields, settings
 * @returns {Promise<void>}
 */
async function saveForm(form) {
  if (!form || !form.id) {
    throw new Error('Form must have an id');
  }

  const formData = {
    ...form,
    updatedAt: new Date().toISOString(),
  };

  await storage.set(`form:${form.id}`, formData);

  // Update the page's form list
  if (form.pageId) {
    const pageFormsKey = `forms:page:${form.pageId}`;
    const pageForms = (await storage.get(pageFormsKey)) || [];
    if (!pageForms.includes(form.id)) {
      pageForms.push(form.id);
      await storage.set(pageFormsKey, pageForms);
    }
  }
}

/**
 * Retrieves a form definition by ID.
 * @param {string} formId
 * @returns {Promise<object|null>}
 */
async function getForm(formId) {
  if (!formId) return null;
  return await storage.get(`form:${formId}`);
}

/**
 * Retrieves all forms for a given Confluence page.
 * @param {string} pageId
 * @returns {Promise<Array>}
 */
async function getFormsByPage(pageId) {
  if (!pageId) return [];

  const formIds = (await storage.get(`forms:page:${pageId}`)) || [];
  const forms = await Promise.all(formIds.map((id) => getForm(id)));
  return forms.filter(Boolean);
}

/**
 * Deletes a form and all its submissions.
 * @param {string} formId
 * @param {string} pageId
 * @returns {Promise<void>}
 */
async function deleteForm(formId, pageId) {
  if (!formId) return;

  // Delete all submissions for this form
  const submissionIds = (await storage.get(`submissions:form:${formId}`)) || [];
  await Promise.all(submissionIds.map((id) => storage.delete(`submission:${id}`)));
  await storage.delete(`submissions:form:${formId}`);

  // Remove from page's form list
  if (pageId) {
    const pageFormsKey = `forms:page:${pageId}`;
    const pageForms = (await storage.get(pageFormsKey)) || [];
    const updated = pageForms.filter((id) => id !== formId);
    await storage.set(pageFormsKey, updated);
  }

  // Delete the form itself
  await storage.delete(`form:${formId}`);
}

// ─── Submission Operations ────────────────────────────────────────

/**
 * Saves a form submission to storage.
 * @param {object} submission - Submission with id, formId, pageId, userId, fieldValues, etc.
 * @returns {Promise<void>}
 */
async function saveSubmission(submission) {
  if (!submission || !submission.id) {
    throw new Error('Submission must have an id');
  }

  const data = {
    ...submission,
    timestamp: submission.timestamp || new Date().toISOString(),
  };

  await storage.set(`submission:${submission.id}`, data);

  // Update the form's submission list
  if (submission.formId) {
    const formSubmissionsKey = `submissions:form:${submission.formId}`;
    const submissionIds = (await storage.get(formSubmissionsKey)) || [];
    if (!submissionIds.includes(submission.id)) {
      submissionIds.push(submission.id);
      await storage.set(formSubmissionsKey, submissionIds);
    }
  }
}

/**
 * Retrieves a submission by ID.
 * @param {string} submissionId
 * @returns {Promise<object|null>}
 */
async function getSubmission(submissionId) {
  if (!submissionId) return null;
  return await storage.get(`submission:${submissionId}`);
}

/**
 * Retrieves all submissions for a given form.
 * @param {string} formId
 * @returns {Promise<Array>}
 */
async function getSubmissionsByForm(formId) {
  if (!formId) return [];

  const submissionIds = (await storage.get(`submissions:form:${formId}`)) || [];
  const submissions = await Promise.all(submissionIds.map((id) => getSubmission(id)));
  return submissions.filter(Boolean);
}

/**
 * Deletes a single submission.
 * @param {string} submissionId
 * @param {string} formId
 * @returns {Promise<void>}
 */
async function deleteSubmission(submissionId, formId) {
  if (!submissionId) return;

  await storage.delete(`submission:${submissionId}`);

  // Remove from form's submission list
  if (formId) {
    const formSubmissionsKey = `submissions:form:${formId}`;
    const submissionIds = (await storage.get(formSubmissionsKey)) || [];
    const updated = submissionIds.filter((id) => id !== submissionId);
    await storage.set(formSubmissionsKey, updated);
  }
}

/**
 * Updates a submission (e.g., to add jiraIssueKey after issue creation).
 * @param {string} submissionId
 * @param {object} updates - Fields to update
 * @returns {Promise<object|null>}
 */
async function updateSubmission(submissionId, updates) {
  const existing = await getSubmission(submissionId);
  if (!existing) return null;

  const updated = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await storage.set(`submission:${submissionId}`, updated);
  return updated;
}

module.exports = {
  saveForm,
  getForm,
  getFormsByPage,
  deleteForm,
  saveSubmission,
  getSubmission,
  getSubmissionsByForm,
  deleteSubmission,
  updateSubmission,
};
