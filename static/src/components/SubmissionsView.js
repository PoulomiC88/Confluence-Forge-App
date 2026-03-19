import React, { useState, useEffect, useCallback } from 'react';
import { invoke, router } from '@forge/bridge';

function SubmissionsView({ form, onBack }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'list'

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke('getSubmissions', { formId: form.id });
      if (result.success) {
        setSubmissions(result.submissions);
      } else {
        setError(result.error || 'Failed to load submissions');
      }
    } catch (err) {
      setError('Failed to load submissions: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [form.id]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const handleDeleteSubmission = async (submissionId) => {
    if (!window.confirm('Are you sure you want to delete this submission?')) return;

    try {
      const result = await invoke('deleteSubmission', { submissionId, formId: form.id });
      if (result.success) {
        await loadSubmissions();
      } else {
        setError(result.error || 'Failed to delete submission');
      }
    } catch (err) {
      setError('Failed to delete submission: ' + err.message);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    try {
      return new Date(timestamp).toLocaleString();
    } catch (e) {
      return timestamp;
    }
  };

  const renderTableView = () => {
    if (submissions.length === 0) {
      return (
        <div className="empty-state">
          <p>No submissions yet.</p>
        </div>
      );
    }

    const fieldNames = form.fields.map((f) => f.name);

    return (
      <div style={{ overflowX: 'auto' }}>
        <table className="submissions-table">
          <thead>
            <tr>
              <th>Date</th>
              {form.fields.map((f) => (
                <th key={f.name}>{f.label}</th>
              ))}
              <th>Jira Issue</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((sub) => (
              <tr key={sub.id}>
                <td>{formatDate(sub.timestamp)}</td>
                {fieldNames.map((name) => (
                  <td key={name}>
                    {typeof sub.fieldValues[name] === 'boolean'
                      ? sub.fieldValues[name] ? 'Yes' : 'No'
                      : sub.fieldValues[name] || '-'}
                  </td>
                ))}
                <td>
                  {sub.jiraIssueKey ? (
                    <span
                      className="jira-link"
                      style={{ cursor: 'pointer' }}
                      onClick={() => router.open(`/browse/${sub.jiraIssueKey}`)}
                    >
                      {sub.jiraIssueKey}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
                <td>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDeleteSubmission(sub.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderListView = () => {
    if (submissions.length === 0) {
      return (
        <div className="empty-state">
          <p>No submissions yet.</p>
        </div>
      );
    }

    return (
      <div className="submissions-list">
        {submissions.map((sub) => (
          <div key={sub.id} className="submission-card">
            <div className="submission-card-header">
              <span className="timestamp">{formatDate(sub.timestamp)}</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {sub.jiraIssueKey && (
                  <span
                    className="jira-link"
                    style={{ cursor: 'pointer' }}
                    onClick={() => router.open(`/browse/${sub.jiraIssueKey}`)}
                  >
                    {sub.jiraIssueKey}
                  </span>
                )}
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDeleteSubmission(sub.id)}
                >
                  Delete
                </button>
              </div>
            </div>
            {form.fields.map((field) => (
              <div key={field.name} className="submission-field">
                <div className="field-label">{field.label}</div>
                <div className="field-value">
                  {typeof sub.fieldValues[field.name] === 'boolean'
                    ? sub.fieldValues[field.name] ? 'Yes' : 'No'
                    : sub.fieldValues[field.name] || '-'}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="submissions-view">
      <div className="submissions-header">
        <h2>Submissions: {form.title}</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="view-toggle">
            <button
              className={viewMode === 'table' ? 'active' : ''}
              onClick={() => setViewMode('table')}
            >
              Table
            </button>
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
          </div>
          <button className="btn btn-secondary" onClick={loadSubmissions}>
            Refresh
          </button>
          <button className="btn btn-secondary" onClick={onBack}>
            Back
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="alert-close" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {loading ? (
        <div className="loading">Loading submissions...</div>
      ) : viewMode === 'table' ? (
        renderTableView()
      ) : (
        renderListView()
      )}

      <div style={{ marginTop: '16px', fontSize: '13px', color: '#6b778c' }}>
        Total submissions: {submissions.length}
      </div>
    </div>
  );
}

export default SubmissionsView;
