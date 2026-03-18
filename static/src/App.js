import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@forge/bridge';
import FormBuilder from './components/FormBuilder';
import FormRenderer from './components/FormRenderer';
import SubmissionsView from './components/SubmissionsView';
import './App.css';

const VIEWS = {
  LIST: 'list',
  BUILDER: 'builder',
  FILL: 'fill',
  SUBMISSIONS: 'submissions',
};

function App() {
  const [view, setView] = useState(VIEWS.LIST);
  const [forms, setForms] = useState([]);
  const [selectedForm, setSelectedForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const loadForms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke('getFormsByPage', { pageId: 'current' });
      if (result.success) {
        setForms(result.forms);
      } else {
        setError(result.error || 'Failed to load forms');
      }
    } catch (err) {
      setError('Failed to load forms: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const handleCreateForm = async (formData) => {
    try {
      const result = await invoke('createForm', {
        ...formData,
        pageId: 'current',
      });
      if (result.success) {
        setSuccessMessage('Form created successfully!');
        await loadForms();
        setView(VIEWS.LIST);
      } else {
        setError(result.error || 'Failed to create form');
      }
    } catch (err) {
      setError('Failed to create form: ' + err.message);
    }
  };

  const handleUpdateForm = async (formData) => {
    try {
      const result = await invoke('updateForm', formData);
      if (result.success) {
        setSuccessMessage('Form updated successfully!');
        await loadForms();
        setView(VIEWS.LIST);
      } else {
        setError(result.error || 'Failed to update form');
      }
    } catch (err) {
      setError('Failed to update form: ' + err.message);
    }
  };

  const handleDeleteForm = async (formId) => {
    if (!window.confirm('Are you sure you want to delete this form and all its submissions?')) {
      return;
    }
    try {
      const result = await invoke('deleteForm', { formId, pageId: 'current' });
      if (result.success) {
        setSuccessMessage('Form deleted successfully!');
        await loadForms();
      } else {
        setError(result.error || 'Failed to delete form');
      }
    } catch (err) {
      setError('Failed to delete form: ' + err.message);
    }
  };

  const handleSelectForm = (form, targetView) => {
    setSelectedForm(form);
    setView(targetView);
  };

  const renderView = () => {
    switch (view) {
      case VIEWS.BUILDER:
        return (
          <FormBuilder
            form={selectedForm}
            onSave={selectedForm ? handleUpdateForm : handleCreateForm}
            onCancel={() => {
              setSelectedForm(null);
              setView(VIEWS.LIST);
            }}
          />
        );

      case VIEWS.FILL:
        return (
          <FormRenderer
            form={selectedForm}
            onBack={() => {
              setSelectedForm(null);
              setView(VIEWS.LIST);
            }}
            onSuccess={(message) => {
              setSuccessMessage(message);
            }}
          />
        );

      case VIEWS.SUBMISSIONS:
        return (
          <SubmissionsView
            form={selectedForm}
            onBack={() => {
              setSelectedForm(null);
              setView(VIEWS.LIST);
            }}
          />
        );

      default:
        return renderFormList();
    }
  };

  const renderFormList = () => {
    if (loading) {
      return <div className="loading">Loading forms...</div>;
    }

    return (
      <div className="form-list">
        <div className="form-list-header">
          <h2>ConfiForms</h2>
          <button
            className="btn btn-primary"
            onClick={() => {
              setSelectedForm(null);
              setView(VIEWS.BUILDER);
            }}
          >
            + New Form
          </button>
        </div>

        {forms.length === 0 ? (
          <div className="empty-state">
            <p>No forms created yet.</p>
            <p>Click "New Form" to get started.</p>
          </div>
        ) : (
          <div className="form-cards">
            {forms.map((form) => (
              <div key={form.id} className="form-card">
                <div className="form-card-header">
                  <h3>{form.title}</h3>
                  <span className="field-count">{form.fields.length} fields</span>
                </div>
                <div className="form-card-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleSelectForm(form, VIEWS.FILL)}
                  >
                    Fill Form
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleSelectForm(form, VIEWS.SUBMISSIONS)}
                  >
                    View Data
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleSelectForm(form, VIEWS.BUILDER)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDeleteForm(form.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="app">
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
          <button className="alert-close" onClick={() => setError(null)}>×</button>
        </div>
      )}
      {successMessage && (
        <div className="alert alert-success">
          <span>{successMessage}</span>
          <button className="alert-close" onClick={() => setSuccessMessage(null)}>×</button>
        </div>
      )}
      {renderView()}
    </div>
  );
}

export default App;
