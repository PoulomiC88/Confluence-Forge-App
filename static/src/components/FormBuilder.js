import React, { useState } from 'react';

/**
 * Supported field types for the standard (manual) field builder.
 */
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

/**
 * Example JSON template that users can use as a starting point for
 * defining dynamic custom fields (Story Points, Story Type, conditional
 * Story Description).
 */
const EXAMPLE_JSON = `[
  {
    "fieldId": "customfield_10041",
    "label": "Story Points",
    "type": "number",
    "required": false
  },
  {
    "fieldId": "customfield_10077",
    "label": "Story Type",
    "type": "select",
    "options": ["Functional", "Non-Functional", "Maintenance"],
    "required": true
  },
  {
    "fieldId": "customfield_10076",
    "label": "Story Description",
    "type": "textarea",
    "required": true,
    "visibleWhen": {
      "fieldId": "customfield_10077",
      "equals": "Non-Functional"
    }
  }
]`;

/**
 * Validates a parsed JSON custom-fields configuration array.
 * Returns an error string if invalid, or null if valid.
 * @param {Array} config - The parsed JSON array
 * @returns {string|null}
 */
function validateCustomFieldsConfig(config) {
  if (!Array.isArray(config)) {
    return 'Configuration must be a JSON array';
  }

  const allowedTypes = ['text', 'number', 'select', 'textarea'];
  const fieldIds = new Set();

  for (let i = 0; i < config.length; i++) {
    const field = config[i];

    if (!field.fieldId || typeof field.fieldId !== 'string' || field.fieldId.trim() === '') {
      return `Field at index ${i}: "fieldId" is required and must be a non-empty string`;
    }

    if (fieldIds.has(field.fieldId)) {
      return `Field at index ${i}: duplicate fieldId "${field.fieldId}"`;
    }
    fieldIds.add(field.fieldId);

    if (!field.label || typeof field.label !== 'string' || field.label.trim() === '') {
      return `Field "${field.fieldId}": "label" is required`;
    }

    if (!field.type || !allowedTypes.includes(field.type)) {
      return `Field "${field.fieldId}": "type" must be one of: ${allowedTypes.join(', ')}`;
    }

    if (field.type === 'select') {
      if (!field.options || !Array.isArray(field.options) || field.options.length === 0) {
        return `Field "${field.fieldId}": "options" array is required for select type`;
      }
    }

    if (field.visibleWhen) {
      if (!field.visibleWhen.fieldId || !field.visibleWhen.equals) {
        return `Field "${field.fieldId}": "visibleWhen" must have "fieldId" and "equals" properties`;
      }
    }
  }

  return null;
}

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

  // JSON custom fields configuration state
  const [customFieldsJson, setCustomFieldsJson] = useState(
    form?.settings?.customFieldsConfig
      ? JSON.stringify(form.settings.customFieldsConfig, null, 2)
      : ''
  );
  const [jsonError, setJsonError] = useState(null);
  const [showJsonEditor, setShowJsonEditor] = useState(
    !!(form?.settings?.customFieldsConfig && form.settings.customFieldsConfig.length > 0)
  );

  const validate = () => {
    const errs = {};
    if (!title.trim()) errs.title = 'Form title is required';
    if (fields.length === 0) errs.fields = 'At least one field is required';
    if (settings.enableJira) {
      if (!settings.projectKey?.trim()) {
        errs.projectKey = 'Project key is required when Jira integration is enabled';
      }
      const fieldNames = fields.map((f) => f.name);
      if (!fieldNames.includes('summary')) {
        errs.fields = (errs.fields ? errs.fields + '. ' : '') + 'A field named "summary" is required when Jira integration is enabled';
      }
      if (!fieldNames.includes('assignee')) {
        errs.fields = (errs.fields ? errs.fields + '. ' : '') + 'A field named "assignee" is required when Jira integration is enabled';
      }
    }

    // Validate field names are unique
    const names = fields.map((f) => f.name);
    if (new Set(names).size !== names.length) {
      errs.fields = (errs.fields ? errs.fields + '. ' : '') + 'Field names must be unique';
    }

    // Validate JSON custom fields config if content exists (regardless of editor visibility)
    if (customFieldsJson.trim()) {
      try {
        const parsed = JSON.parse(customFieldsJson);
        const configErr = validateCustomFieldsConfig(parsed);
        if (configErr) {
          errs.customFields = configErr;
        }
      } catch (e) {
        errs.customFields = `Invalid JSON: ${e.message}`;
      }
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

  /**
   * Handles changes to the JSON configuration textarea.
   * Performs live validation and clears errors on valid input.
   */
  const handleJsonChange = (value) => {
    setCustomFieldsJson(value);
    if (!value.trim()) {
      setJsonError(null);
      return;
    }
    try {
      const parsed = JSON.parse(value);
      const err = validateCustomFieldsConfig(parsed);
      setJsonError(err);
    } catch (e) {
      setJsonError(`Invalid JSON: ${e.message}`);
    }
  };

  const handleSave = () => {
    if (!validate()) return;

    // Parse custom fields config (always persisted if content exists, regardless of editor visibility)
    let customFieldsConfig = [];
    if (customFieldsJson.trim()) {
      try {
        customFieldsConfig = JSON.parse(customFieldsJson);
      } catch (_e) {
        // Validation already catches this; fall back to empty
      }
    }

    const formData = {
      title: title.trim(),
      fields,
      settings: {
        ...settings,
        customFieldsConfig,
      },
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

      {/* JSON Custom Fields Configuration */}
      <div className="form-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h3 style={{ margin: 0 }}>Custom Fields (JSON Config)</h3>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowJsonEditor(!showJsonEditor)}
          >
            {showJsonEditor ? 'Hide JSON Editor' : 'Show JSON Editor'}
          </button>
        </div>
        <p style={{ fontSize: '13px', color: '#6b778c', margin: '0 0 8px 0' }}>
          Define additional Jira custom fields using JSON. These fields will appear in the form
          and be mapped to Jira issue fields on submission. Supports conditional visibility.
        </p>

        {showJsonEditor && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setCustomFieldsJson(EXAMPLE_JSON);
                  handleJsonChange(EXAMPLE_JSON);
                }}
                title="Load the example template with Story Points, Story Type, and conditional Story Description"
              >
                Load Example Template
              </button>
              {customFieldsJson.trim() && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setCustomFieldsJson('');
                    setJsonError(null);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <textarea
              value={customFieldsJson}
              onChange={(e) => handleJsonChange(e.target.value)}
              rows={12}
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                width: '100%',
                border: jsonError ? '2px solid #de350b' : '1px solid #dfe1e6',
                borderRadius: '3px',
                padding: '8px',
                resize: 'vertical',
              }}
              placeholder='Paste or type your JSON configuration here...'
            />
            {jsonError && <div className="error-text" style={{ marginTop: '4px' }}>{jsonError}</div>}
            {errors.customFields && <div className="error-text" style={{ marginTop: '4px' }}>{errors.customFields}</div>}
            {!jsonError && customFieldsJson.trim() && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#00875a' }}>
                JSON is valid
              </div>
            )}

            {/* Preview of configured custom fields */}
            {!jsonError && customFieldsJson.trim() && (() => {
              try {
                const parsed = JSON.parse(customFieldsJson);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  return (
                    <div style={{ marginTop: '8px', padding: '8px', background: '#f4f5f7', borderRadius: '3px' }}>
                      <h4 style={{ fontSize: '12px', color: '#6b778c', marginBottom: '4px' }}>
                        Preview: {parsed.length} custom field{parsed.length > 1 ? 's' : ''} configured
                      </h4>
                      {parsed.map((f, i) => (
                        <div key={i} style={{ fontSize: '12px', padding: '2px 0' }}>
                          <strong>{f.label}</strong> ({f.type})
                          {f.required && <span style={{ color: '#de350b' }}> *</span>}
                          {f.visibleWhen && (
                            <span style={{ color: '#6b778c' }}>
                              {' '} &mdash; visible when {f.visibleWhen.fieldId} = &quot;{f.visibleWhen.equals}&quot;
                            </span>
                          )}
                          <span style={{ color: '#6b778c' }}> [{f.fieldId}]</span>
                        </div>
                      ))}
                    </div>
                  );
                }
              } catch (_e) {
                // Ignore parse errors here; they are shown above
              }
              return null;
            })()}
          </div>
        )}
        {/* Show validation error even when editor is collapsed */}
        {!showJsonEditor && errors.customFields && (
          <div className="error-text" style={{ marginTop: '4px' }}>{errors.customFields}</div>
        )}
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
