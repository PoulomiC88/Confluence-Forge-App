import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@forge/bridge';

function FormRenderer({ form, onBack, onSuccess }) {
  const [fieldValues, setFieldValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [jiraIssueKey, setJiraIssueKey] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // User picker state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    // Initialize field values
    const initial = {};
    form.fields.forEach((field) => {
      initial[field.name] = field.type === 'checkbox' ? false : '';
    });
    setFieldValues(initial);
  }, [form]);

  const handleUserSearch = async (query) => {
    setUserSearchQuery(query);
    setFieldValues({ ...fieldValues, assignee: query });

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (query.length < 2) {
      setUserSearchResults([]);
      setShowUserDropdown(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await invoke('searchJiraUsers', { query });
        if (result.success) {
          setUserSearchResults(result.users);
          setShowUserDropdown(true);
        }
      } catch (err) {
        console.error('User search failed:', err);
      }
    }, 300);
  };

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setFieldValues({ ...fieldValues, assignee: user.accountId });
    setUserSearchQuery('');
    setShowUserDropdown(false);
  };

  const handleClearUser = () => {
    setSelectedUser(null);
    setFieldValues({ ...fieldValues, assignee: '' });
    setUserSearchQuery('');
  };

  const validate = () => {
    const errs = {};
    form.fields.forEach((field) => {
      if (field.required) {
        const value = fieldValues[field.name];
        if (value === undefined || value === null || value.toString().trim() === '') {
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
        setSelectedUser(null);
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
    setFieldValues({ ...fieldValues, [fieldName]: value });
    if (fieldErrors[fieldName]) {
      setFieldErrors({ ...fieldErrors, [fieldName]: null });
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

      case 'user_picker':
        return (
          <div className="form-group" key={field.name}>
            <label htmlFor={field.name}>
              {field.label} {field.required && <span style={{ color: '#de350b' }}>*</span>}
            </label>
            {selectedUser ? (
              <div className="user-selected">
                {selectedUser.avatarUrl && (
                  <img src={selectedUser.avatarUrl} alt="" className="user-avatar" />
                )}
                <span>{selectedUser.displayName}</span>
                <button className="clear-user" onClick={handleClearUser} title="Clear selection">×</button>
              </div>
            ) : (
              <div className="user-picker">
                <input
                  id={field.name}
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => handleUserSearch(e.target.value)}
                  onBlur={() => setTimeout(() => setShowUserDropdown(false), 200)}
                  placeholder="Search for a user or enter account ID..."
                  className={fieldError ? 'error' : ''}
                />
                {showUserDropdown && userSearchResults.length > 0 && (
                  <div className="user-picker-results">
                    {userSearchResults.map((user) => (
                      <div
                        key={user.accountId}
                        className="user-picker-item"
                        onClick={() => handleSelectUser(user)}
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

      default:
        return (
          <div className="form-group" key={field.name}>
            <label htmlFor={field.name}>
              {field.label} {field.required && <span style={{ color: '#de350b' }}>*</span>}
            </label>
            <input
              id={field.name}
              type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : 'text'}
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
          <a
            className="jira-link"
            href={`/browse/${jiraIssueKey}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {jiraIssueKey}
          </a>
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
