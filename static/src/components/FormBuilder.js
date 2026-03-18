import React, { useState } from 'react';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'select', label: 'Dropdown' },
  { value: 'user_picker', label: 'User Picker' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
];

const DEFAULT_FIELDS = [
  { name: 'summary', label: 'Summary', type: 'text', required: true },
  { name: 'assignee', label: 'Assignee', type: 'user_picker', required: true },
];

function FormBuilder({ form, onSave, onCancel }) {
  const [title, setTitle] = useState(form ? form.title : '');
  const [fields, setFields] = useState(form ? form.fields : [...DEFAULT_FIELDS]);
  const [settings, setSettings] = useState(form ? form.settings : { enableJira: true, projectKey: '' });
  const [errors, setErrors] = useState({});

  // New field state
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldOptions, setNewFieldOptions] = useState('');

  const validate = () => {
    const errs = {};
    if (!title.trim()) errs.title = 'Form title is required';
    if (fields.length === 0) errs.fields = 'At least one field is required';
    if (settings.enableJira && !settings.projectKey?.trim()) {
      errs.projectKey = 'Project key is required when Jira integration is enabled';
    }

    // Validate field names are unique
    const names = fields.map((f) => f.name);
    if (new Set(names).size !== names.length) {
      errs.fields = 'Field names must be unique';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddField = () => {
    if (!newFieldName.trim() || !newFieldLabel.trim()) return;

    const field = {
      name: newFieldName.trim().toLowerCase().replace(/\s+/g, '_'),
      label: newFieldLabel.trim(),
      type: newFieldType,
      required: newFieldRequired,
    };

    if (newFieldType === 'select' && newFieldOptions.trim()) {
      field.options = newFieldOptions.split(',').map((o) => o.trim()).filter(Boolean);
    }

    setFields([...fields, field]);
    setNewFieldName('');
    setNewFieldLabel('');
    setNewFieldType('text');
    setNewFieldRequired(false);
    setNewFieldOptions('');
  };

  const handleRemoveField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
  };

  const handleMoveField = (index, direction) => {
    const newFields = [...fields];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newFields.length) return;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    setFields(newFields);
  };

  const handleSave = () => {
    if (!validate()) return;

    const formData = {
      title: title.trim(),
      fields,
      settings,
    };

    if (form) {
      formData.formId = form.id;
    }

    onSave(formData);
  };

  return (
    <div className="form-builder">
      <div className="form-builder-header">
        <h2>{form ? 'Edit Form' : 'Create New Form'}</h2>
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {/* Form Title */}
      <div className="form-section">
        <div className="form-group">
          <label htmlFor="form-title">Form Title</label>
          <input
            id="form-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter form title"
            className={errors.title ? 'error' : ''}
          />
          {errors.title && <div className="error-text">{errors.title}</div>}
        </div>
      </div>

      {/* Fields */}
      <div className="form-section">
        <h3>Fields</h3>
        {errors.fields && <div className="error-text" style={{ marginBottom: '8px' }}>{errors.fields}</div>}

        <div className="field-list">
          {fields.map((field, index) => (
            <div key={index} className="field-item">
              <div className="field-info">
                <span className="field-name">{field.label}</span>
                <span className="field-type"> ({field.type})</span>
                {field.required && <span className="field-required"> *Required</span>}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleMoveField(index, -1)}
                disabled={index === 0}
                title="Move up"
              >
                ↑
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleMoveField(index, 1)}
                disabled={index === fields.length - 1}
                title="Move down"
              >
                ↓
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleRemoveField(index)}
                title="Remove field"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Add Field */}
        <div style={{ border: '1px dashed #dfe1e6', borderRadius: '3px', padding: '12px', marginTop: '8px' }}>
          <h4 style={{ fontSize: '13px', marginBottom: '8px', color: '#6b778c' }}>Add New Field</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Field Name</label>
              <input
                type="text"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="e.g. description"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Label</label>
              <input
                type="text"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                placeholder="e.g. Description"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Type</label>
              <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)}>
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {newFieldType === 'select' && (
            <div className="form-group" style={{ marginBottom: '8px' }}>
              <label>Options (comma-separated)</label>
              <input
                type="text"
                value={newFieldOptions}
                onChange={(e) => setNewFieldOptions(e.target.value)}
                placeholder="Option 1, Option 2, Option 3"
              />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '13px' }}>
              <input
                type="checkbox"
                checked={newFieldRequired}
                onChange={(e) => setNewFieldRequired(e.target.checked)}
              />
              Required
            </label>
            <button className="btn btn-secondary btn-sm" onClick={handleAddField}>
              Add Field
            </button>
          </div>
        </div>
      </div>

      {/* Jira Settings */}
      <div className="form-section">
        <h3>Jira Integration</h3>
        <div className="jira-section">
          <div className="checkbox-group">
            <input
              type="checkbox"
              id="enable-jira"
              checked={settings.enableJira || false}
              onChange={(e) => setSettings({ ...settings, enableJira: e.target.checked })}
            />
            <label htmlFor="enable-jira">Create Jira issue on form submission</label>
          </div>
          {settings.enableJira && (
            <div className="form-group">
              <label htmlFor="project-key">Jira Project Key</label>
              <input
                id="project-key"
                type="text"
                value={settings.projectKey || ''}
                onChange={(e) => setSettings({ ...settings, projectKey: e.target.value.toUpperCase() })}
                placeholder="e.g. PROJ"
                className={errors.projectKey ? 'error' : ''}
              />
              {errors.projectKey && <div className="error-text">{errors.projectKey}</div>}
              <div className="help-text">The Jira project key where issues will be created</div>
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      <div className="form-actions">
        <button className="btn btn-primary" onClick={handleSave}>
          {form ? 'Update Form' : 'Create Form'}
        </button>
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default FormBuilder;
