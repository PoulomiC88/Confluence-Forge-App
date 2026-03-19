import React, { useState, useEffect, useRef } from 'react';
import { invoke, router } from '@forge/bridge';

function FormRenderer({ form, onBack, onSuccess }) {
  const [fieldValues, setFieldValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [jiraIssueKey, setJiraIssueKey] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // User picker state (per-field to support multiple user_picker fields)
  const [userPickerState, setUserPickerState] = useState({});
  const searchTimeoutRef = useRef({});

  useEffect(() => {
    // Initialize field values
    const initial = {};
    form.fields.forEach((field) => {
      initial[field.name] = field.type === 'checkbox' ? false : '';
    });
    setFieldValues(initial);
  }, [form]);

  const defaultPickerState = { query: '', results: [], selectedUser: null, showDropdown: false };

  const handleUserSearch = async (fieldName, query) => {
    setUserPickerState((prev) => ({ ...prev, [fieldName]: { ...(prev[fieldName] || defaultPickerState), query } }));
    setFieldValues((prev) => ({ ...prev, [fieldName]: query }));

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
    setFieldValues((prev) => ({ ...prev, [fieldName]: user.accountId }));
  };

  const handleClearUser = (fieldName) => {
    setUserPickerState((prev) => ({ ...prev, [fieldName]: { query: '', results: [], selectedUser: null, showDropdown: false } }));
    setFieldValues((prev) => ({ ...prev, [fieldName]: '' }));
  };

  const validate = () => {
    const errs = {};
    form.fields.forEach((field) => {
      if (field.required) {
        const value = fieldValues[field.name];
        if (value === undefined || value === null || (field.type === 'checkbox' ? value === false : value.toString().trim() === '')) {
          errs[field.name] = `${field.label || field.name} is required`;
        }
      }
      if (field.type === 'email' && fieldValues[field.name]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(fieldValues[field.name])) {
          errs[field.name] = 'Please enter a valid email address';
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
      const result = await invoke('submitForm', {
        formId: form.id,
        fieldValues,
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

        // Reset form
        const initial = {};
        form.fields.forEach((field) => {
          initial[field.name] = field.type === 'checkbox' ? false : '';
        });
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

  const renderField = (field) => {
    const value = fieldValues[field.name] || '';
    const fieldError = fieldErrors[field.name];

    switch (field.type) {
      case 'textarea':
        return (
          <div className="form-group" key={field.name}>
            <label htmlFor={field.name}>
              {field.label} {field.required && <span style={{ color: '#de350b' }}>*</span>}
            </label>
            <textarea
              id={field.name}
              value={value}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              rows={4}
              className={fieldError ? 'error' : ''}
            />
            {fieldError && <div className="error-text">{fieldError}</div>}
          </div>
        );

      case 'select':
        return (
          <div className="form-group" key={field.name}>
            <label htmlFor={field.name}>
              {field.label} {field.required && <span style={{ color: '#de350b' }}>*</span>}
            </label>
            <select
              id={field.name}
              value={value}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
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
          <div className="form-group" key={field.name}>
            <div className="checkbox-group">
              <input
                type="checkbox"
                id={field.name}
                checked={!!fieldValues[field.name]}
                onChange={(e) => handleFieldChange(field.name, e.target.checked)}
              />
              <label htmlFor={field.name}>{field.label}</label>
            </div>
            {fieldError && <div className="error-text">{fieldError}</div>}
          </div>
        );

      case 'user_picker': {
        const pickerState = userPickerState[field.name] || defaultPickerState;
        return (
          <div className="form-group" key={field.name}>
            <label htmlFor={field.name}>
              {field.label} {field.required && <span style={{ color: '#de350b' }}>*</span>}
            </label>
            {pickerState.selectedUser ? (
              <div className="user-selected">
                {pickerState.selectedUser.avatarUrl && (
                  <img src={pickerState.selectedUser.avatarUrl} alt="" className="user-avatar" />
                )}
                <span>{pickerState.selectedUser.displayName}</span>
                <button className="clear-user" onClick={() => handleClearUser(field.name)} title="Clear selection">×</button>
              </div>
            ) : (
              <div className="user-picker">
                <input
                  id={field.name}
                  type="text"
                  value={pickerState.query}
                  onChange={(e) => handleUserSearch(field.name, e.target.value)}
                  onBlur={() => setTimeout(() => setUserPickerState((prev) => ({ ...prev, [field.name]: { ...prev[field.name], showDropdown: false } })), 200)}
                  placeholder="Search for a user or enter account ID..."
                  className={fieldError ? 'error' : ''}
                />
                {pickerState.showDropdown && pickerState.results.length > 0 && (
                  <div className="user-picker-results">
                    {pickerState.results.map((user) => (
                      <div
                        key={user.accountId}
                        className="user-picker-item"
                        onClick={() => handleSelectUser(field.name, user)}
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
          <div className="form-group" key={field.name}>
            <label htmlFor={field.name}>
              {field.label} {field.required && <span style={{ color: '#de350b' }}>*</span>}
            </label>
            <input
              id={field.name}
              type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : 'text'}
              value={value}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
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

      {form.fields.map((field) => renderField(field))}

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
