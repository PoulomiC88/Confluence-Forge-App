import React, { useState, useEffect, useRef } from 'react';
import { invoke, router } from '@forge/bridge';

/**
 * Evaluates whether a field should be visible based on its visibleWhen rule.
 * Used for JSON-configured custom fields with conditional visibility.
 * @param {object} field - Field definition (may contain visibleWhen)
 * @param {object} fieldValues - Current values keyed by fieldId/name
 * @returns {boolean}
 */
function isFieldVisible(field, fieldValues) {
  if (!field.visibleWhen) return true;
  const { fieldId: depField, equals } = field.visibleWhen;
  if (!depField) return true;
  return fieldValues[depField] === equals;
}

function FormRenderer({ form, onBack, onSuccess }) {
  const [fieldValues, setFieldValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [jiraIssueKey, setJiraIssueKey] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // User picker state (per-field to support multiple user_picker fields)
  const [userPickerState, setUserPickerState] = useState({});
  const searchTimeoutRef = useRef({});

  // Merge standard fields with JSON-configured custom fields for rendering
  const customFieldDefs = form.settings?.customFieldsConfig || [];
  const allFields = [
    ...form.fields,
    ...(Array.isArray(customFieldDefs) ? customFieldDefs : []),
  ];

  useEffect(() => {
    // Initialize field values for both standard and custom fields
    const initial = {};
    form.fields.forEach((field) => {
      initial[field.name] = field.type === 'checkbox' ? false : '';
    });
    const cfDefs = form.settings?.customFieldsConfig || [];
    if (Array.isArray(cfDefs)) {
      cfDefs.forEach((field) => {
        initial[field.fieldId] = field.type === 'checkbox' ? false : '';
      });
    }
    setFieldValues(initial);
  }, [form]);

  const defaultPickerState = { query: '', results: [], selectedUser: null, showDropdown: false };

  const handleUserSearch = async (fieldName, query) => {
    setUserPickerState((prev) => ({ ...prev, [fieldName]: { ...(prev[fieldName] || defaultPickerState), query } }));
    setFieldValues((prev) => ({ ...prev, [fieldName]: query }));
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => ({ ...prev, [fieldName]: null }));
    }

    if (searchTimeoutRef.current[fieldName]) {
      clearTimeout(searchTimeoutRef.current[fieldName]);
    }

    if (query.length < 2) {
      setUserPickerState((prev) => ({ ...prev, [fieldName]: { ...(prev[fieldName] || defaultPickerState), query, results: [], showDropdown: false } }));
      return;
    }

    searchTimeoutRef.current[fieldName] = setTimeout(async () => {
      try {
        const result = await invoke('searchJiraUsers', { query });
        if (result.success) {
          setUserPickerState((prev) => ({ ...prev, [fieldName]: { ...prev[fieldName], results: result.users, showDropdown: true } }));
        }
      } catch (err) {
        console.error('User search failed:', err);
      }
    }, 300);
  };

  const handleSelectUser = (fieldName, user) => {
    setUserPickerState((prev) => ({ ...prev, [fieldName]: { query: '', results: [], selectedUser: user, showDropdown: false } }));
    setFieldValues((prev) => ({ ...prev, [fieldName]: { accountId: user.accountId, displayName: user.displayName } }));
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => ({ ...prev, [fieldName]: null }));
    }
  };

  const handleClearUser = (fieldName) => {
    setUserPickerState((prev) => ({ ...prev, [fieldName]: { query: '', results: [], selectedUser: null, showDropdown: false } }));
    setFieldValues((prev) => ({ ...prev, [fieldName]: '' }));
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => ({ ...prev, [fieldName]: null }));
    }
  };

  /**
   * Validates all visible fields (standard + custom) before submission.
   * Conditional fields that are hidden are skipped.
   */
  const validate = () => {
    const errs = {};
    allFields.forEach((field) => {
      const key = field.fieldId || field.name;

      // Skip validation for conditionally hidden fields
      if (!isFieldVisible(field, fieldValues)) return;

      if (field.required) {
        const value = fieldValues[key];
        if (value === undefined || value === null) {
          errs[key] = `${field.label || key} is required`;
        } else if (field.type === 'user_picker') {
          const acctId = typeof value === 'object' ? value.accountId : value;
          if (!acctId || (typeof acctId === 'string' && acctId.trim() === '')) {
            errs[key] = `${field.label || key} is required`;
          }
        } else if (field.type === 'checkbox' ? value === false : value.toString().trim() === '') {
          errs[key] = `${field.label || key} is required`;
        }
      }
      if (field.type === 'email' && fieldValues[key]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(fieldValues[key])) {
          errs[key] = 'Please enter a valid email address';
        }
      }
    });
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    setError(null);
    setJiraIssueKey(null);

    try {
      // Build the submission payload, excluding values for hidden conditional fields
      const submissionValues = { ...fieldValues };
      const cfDefs = form.settings?.customFieldsConfig || [];
      if (Array.isArray(cfDefs)) {
        cfDefs.forEach((cfDef) => {
          if (!isFieldVisible(cfDef, fieldValues)) {
            delete submissionValues[cfDef.fieldId];
          }
        });
      }

      const result = await invoke('submitForm', {
        formId: form.id,
        fieldValues: submissionValues,
        createJiraIssue: form.settings?.enableJira || false,
        projectKey: form.settings?.projectKey || '',
      });

      if (result.success) {
        if (result.submission.jiraIssueKey) {
          setJiraIssueKey(result.submission.jiraIssueKey);
          onSuccess(`Issue created: ${result.submission.jiraIssueKey}`);
        } else {
          onSuccess('Form submitted successfully!');
        }

        // Reset form (standard + custom fields)
        const initial = {};
        form.fields.forEach((field) => {
          initial[field.name] = field.type === 'checkbox' ? false : '';
        });
        if (Array.isArray(cfDefs)) {
          cfDefs.forEach((field) => {
            initial[field.fieldId] = field.type === 'checkbox' ? false : '';
          });
        }
        setFieldValues(initial);
        setUserPickerState({});
      } else {
        setError(result.error || 'Submission failed');
      }
    } catch (err) {
      setError('Failed to submit form: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFieldChange = (fieldName, value) => {
    setFieldValues((prev) => ({ ...prev, [fieldName]: value }));
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => ({ ...prev, [fieldName]: null }));
    }
  };

  /**
   * Renders a single form field. Supports both standard fields (keyed by name)
   * and JSON-configured custom fields (keyed by fieldId). The fieldKey is the
   * identifier used in fieldValues and fieldErrors maps.
   */
  const renderField = (field) => {
    const fieldKey = field.fieldId || field.name;
    const value = fieldValues[fieldKey] || '';
    const fieldError = fieldErrors[fieldKey];

    switch (field.type) {
      case 'textarea':
        return (
          <div className="form-group" key={fieldKey}>
            <label htmlFor={fieldKey}>
              {field.label} {field.required && <span style={{ color: '#de350b' }}>*</span>}
            </label>
            <textarea
              id={fieldKey}
              value={value}
              onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
              rows={4}
              className={fieldError ? 'error' : ''}
            />
            {fieldError && <div className="error-text">{fieldError}</div>}
          </div>
        );

      case 'select':
        return (
          <div className="form-group" key={fieldKey}>
            <label htmlFor={fieldKey}>
              {field.label} {field.required && <span style={{ color: '#de350b' }}>*</span>}
            </label>
            <select
              id={fieldKey}
              value={value}
              onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
              className={fieldError ? 'error' : ''}
            >
              <option value="">Select...</option>
              {(field.options || []).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {fieldError && <div className="error-text">{fieldError}</div>}
          </div>
        );

      case 'checkbox':
        return (
          <div className="form-group" key={fieldKey}>
            <div className="checkbox-group">
              <input
                type="checkbox"
                id={fieldKey}
                checked={!!fieldValues[fieldKey]}
                onChange={(e) => handleFieldChange(fieldKey, e.target.checked)}
              />
              <label htmlFor={fieldKey}>{field.label}</label>
            </div>
            {fieldError && <div className="error-text">{fieldError}</div>}
          </div>
        );

      case 'user_picker': {
        const pickerState = userPickerState[fieldKey] || defaultPickerState;
        return (
          <div className="form-group" key={fieldKey}>
            <label htmlFor={fieldKey}>
              {field.label} {field.required && <span style={{ color: '#de350b' }}>*</span>}
            </label>
            {pickerState.selectedUser ? (
              <div className="user-selected">
                {pickerState.selectedUser.avatarUrl && (
                  <img src={pickerState.selectedUser.avatarUrl} alt="" className="user-avatar" width={24} height={24} />
                )}
                <span>{pickerState.selectedUser.displayName}</span>
                <button className="clear-user" onClick={() => handleClearUser(fieldKey)} title="Clear selection">×</button>
              </div>
            ) : (
              <div className="user-picker">
                <input
                  id={fieldKey}
                  type="text"
                  value={pickerState.query}
                  onChange={(e) => handleUserSearch(fieldKey, e.target.value)}
                  onBlur={() => setTimeout(() => setUserPickerState((prev) => ({ ...prev, [fieldKey]: { ...prev[fieldKey], showDropdown: false } })), 200)}
                  placeholder="Search for a user or enter account ID..."
                  className={fieldError ? 'error' : ''}
                />
                {pickerState.showDropdown && pickerState.results.length > 0 && (
                  <div className="user-picker-results">
                    {pickerState.results.map((user) => (
                      <div
                        key={user.accountId}
                        className="user-picker-item"
                        onMouseDown={(e) => { e.preventDefault(); handleSelectUser(fieldKey, user); }}
                      >
                        {user.avatarUrl && (
                          <img src={user.avatarUrl} alt="" className="user-avatar" />
                        )}
                        <div>
                          <div className="user-name">{user.displayName}</div>
                          {user.emailAddress && (
                            <div className="user-email">{user.emailAddress}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="help-text">Search by name or email, or paste an account ID directly</div>
            {fieldError && <div className="error-text">{fieldError}</div>}
          </div>
        );
      }

      default:
        return (
          <div className="form-group" key={fieldKey}>
            <label htmlFor={fieldKey}>
              {field.label} {field.required && <span style={{ color: '#de350b' }}>*</span>}
            </label>
            <input
              id={fieldKey}
              type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : 'text'}
              value={value}
              onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
              className={fieldError ? 'error' : ''}
            />
            {fieldError && <div className="error-text">{fieldError}</div>}
          </div>
        );
    }
  };

  return (
    <div className="form-renderer">
      <div className="form-renderer-header">
        <h2>{form.title}</h2>
        <button className="btn btn-secondary" onClick={onBack}>
          Back to Forms
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="alert-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {jiraIssueKey && (
        <div className="jira-success">
          Issue created:{' '}
          <span
            className="jira-link"
            style={{ cursor: 'pointer' }}
            onClick={() => router.open(`/browse/${jiraIssueKey}`)}
          >
            {jiraIssueKey}
          </span>
        </div>
      )}

      {form.settings?.enableJira && (
        <div className="jira-section" style={{ marginBottom: '16px' }}>
          <h3>Jira Integration Enabled</h3>
          <p style={{ fontSize: '13px', color: '#6b778c' }}>
            A Jira issue will be created in project <strong>{form.settings.projectKey}</strong> when this form is submitted.
          </p>
        </div>
      )}

      {/* Render standard fields + JSON-configured custom fields with conditional visibility */}
      {allFields.map((field) => {
        if (!isFieldVisible(field, fieldValues)) return null;
        return renderField(field);
      })}

      <div className="form-actions">
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
        <button className="btn btn-secondary" onClick={onBack}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default FormRenderer;
