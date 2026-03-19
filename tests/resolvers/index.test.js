// Mock dependencies
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-123'),
}));

const mockJiraService = {
  validateAssignee: jest.fn(),
  createIssue: jest.fn(),
  searchUsers: jest.fn(),
  getProjects: jest.fn(),
};

const mockStorageService = {
  saveForm: jest.fn(),
  getForm: jest.fn(),
  getFormsByPage: jest.fn(),
  deleteForm: jest.fn(),
  saveSubmission: jest.fn(),
  getSubmission: jest.fn(),
  getSubmissionsByForm: jest.fn(),
  deleteSubmission: jest.fn(),
  updateSubmission: jest.fn(),
};

jest.mock('../../src/services/jiraService', () => mockJiraService);
jest.mock('../../src/services/storageService', () => mockStorageService);

// Mock @forge/resolver
const mockResolverHandlers = {};
jest.mock('@forge/resolver', () => ({
  default: jest.fn().mockImplementation(() => ({
    define: jest.fn((name, handler) => {
      mockResolverHandlers[name] = handler;
    }),
    getDefinitions: jest.fn(() => mockResolverHandlers),
  })),
}));

// Import the module (triggers resolver.define calls)
require('../../src/resolvers/index');

describe('Resolvers', () => {
  const defaultContext = {
    accountId: 'user-account-123',
    extension: { content: { id: 'page-123' } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── createForm ─────────────────────────────────────────

  describe('createForm', () => {
    it('should create a form successfully', async () => {
      mockStorageService.saveForm.mockResolvedValue();

      const result = await mockResolverHandlers.createForm({
        payload: {
          title: 'Test Form',
          fields: [{ name: 'summary', type: 'text', required: true }],
          pageId: 'page-1',
        },
        context: defaultContext,
      });

      expect(result.success).toBe(true);
      expect(result.form.title).toBe('Test Form');
      expect(result.form.id).toBe('mock-uuid-123');
      expect(mockStorageService.saveForm).toHaveBeenCalled();
    });

    it('should return error when title is missing', async () => {
      const result = await mockResolverHandlers.createForm({
        payload: { fields: [] },
        context: defaultContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Title and fields array are required');
    });

    it('should return error when fields is not an array', async () => {
      const result = await mockResolverHandlers.createForm({
        payload: { title: 'Test', fields: 'invalid' },
        context: defaultContext,
      });

      expect(result.success).toBe(false);
    });
  });

  // ─── getForm ────────────────────────────────────────────

  describe('getForm', () => {
    it('should return form when found', async () => {
      mockStorageService.getForm.mockResolvedValue({ id: 'form-1', title: 'Test' });

      const result = await mockResolverHandlers.getForm({
        payload: { formId: 'form-1' },
        context: defaultContext,
      });

      expect(result.success).toBe(true);
      expect(result.form.title).toBe('Test');
    });

    it('should return error when form not found', async () => {
      mockStorageService.getForm.mockResolvedValue(null);

      const result = await mockResolverHandlers.getForm({
        payload: { formId: 'nonexistent' },
        context: defaultContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Form not found');
    });

    it('should return error when formId is missing', async () => {
      const result = await mockResolverHandlers.getForm({
        payload: {},
        context: defaultContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Form ID is required');
    });
  });

  // ─── submitForm ─────────────────────────────────────────

  describe('submitForm', () => {
    const mockForm = {
      id: 'form-1',
      pageId: 'page-1',
      fields: [
        { name: 'summary', type: 'text', required: true, label: 'Summary' },
        { name: 'assignee', type: 'user_picker', required: true, label: 'Assignee' },
      ],
      settings: { enableJira: true, projectKey: 'PROJ' },
    };

    it('should submit form and create Jira issue', async () => {
      mockStorageService.getForm.mockResolvedValue(mockForm);
      mockStorageService.saveSubmission.mockResolvedValue();
      mockJiraService.validateAssignee.mockResolvedValue({ valid: true, user: { accountId: 'user-1' } });
      mockJiraService.createIssue.mockResolvedValue({ success: true, issueKey: 'PROJ-123', issueId: '10001' });

      const result = await mockResolverHandlers.submitForm({
        payload: {
          formId: 'form-1',
          fieldValues: { summary: 'Test Issue', assignee: 'user-1' },
          createJiraIssue: true,
          projectKey: 'PROJ',
        },
        context: defaultContext,
      });

      expect(result.success).toBe(true);
      expect(result.submission.jiraIssueKey).toBe('PROJ-123');
      expect(mockJiraService.validateAssignee).toHaveBeenCalledWith('user-1');
      expect(mockJiraService.createIssue).toHaveBeenCalledWith({
        projectKey: 'PROJ',
        summary: 'Test Issue',
        assigneeAccountId: 'user-1',
      });
    });

    it('should submit form without Jira issue when not requested', async () => {
      mockStorageService.getForm.mockResolvedValue(mockForm);
      mockStorageService.saveSubmission.mockResolvedValue();

      const result = await mockResolverHandlers.submitForm({
        payload: {
          formId: 'form-1',
          fieldValues: { summary: 'Test', assignee: 'user-1' },
          createJiraIssue: false,
        },
        context: defaultContext,
      });

      expect(result.success).toBe(true);
      expect(result.submission.jiraIssueKey).toBeNull();
      expect(mockJiraService.createIssue).not.toHaveBeenCalled();
    });

    it('should return error when required field is empty', async () => {
      mockStorageService.getForm.mockResolvedValue(mockForm);

      const result = await mockResolverHandlers.submitForm({
        payload: {
          formId: 'form-1',
          fieldValues: { summary: '', assignee: 'user-1' },
        },
        context: defaultContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Summary');
    });

    it('should reject unchecked required checkbox fields', async () => {
      const formWithCheckbox = {
        ...mockForm,
        fields: [
          ...mockForm.fields,
          { name: 'agree', type: 'checkbox', required: true, label: 'Agree' },
        ],
      };
      mockStorageService.getForm.mockResolvedValue(formWithCheckbox);

      const result = await mockResolverHandlers.submitForm({
        payload: {
          formId: 'form-1',
          fieldValues: { summary: 'Test', assignee: 'user-1', agree: false },
          createJiraIssue: false,
        },
        context: defaultContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Agree');
    });

    it('should accept false for non-required checkbox fields', async () => {
      const formWithCheckbox = {
        ...mockForm,
        fields: [
          ...mockForm.fields,
          { name: 'agree', type: 'checkbox', required: false, label: 'Agree' },
        ],
      };
      mockStorageService.getForm.mockResolvedValue(formWithCheckbox);
      mockStorageService.saveSubmission.mockResolvedValue();

      const result = await mockResolverHandlers.submitForm({
        payload: {
          formId: 'form-1',
          fieldValues: { summary: 'Test', assignee: 'user-1', agree: false },
          createJiraIssue: false,
        },
        context: defaultContext,
      });

      expect(result.success).toBe(true);
    });

    it('should return error when form not found', async () => {
      mockStorageService.getForm.mockResolvedValue(null);

      const result = await mockResolverHandlers.submitForm({
        payload: { formId: 'nonexistent', fieldValues: {} },
        context: defaultContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Form not found');
    });

    it('should return error when assignee is invalid', async () => {
      mockStorageService.getForm.mockResolvedValue(mockForm);
      mockJiraService.validateAssignee.mockResolvedValue({ valid: false, error: 'User not found' });

      const result = await mockResolverHandlers.submitForm({
        payload: {
          formId: 'form-1',
          fieldValues: { summary: 'Test', assignee: 'invalid-user' },
          createJiraIssue: true,
          projectKey: 'PROJ',
        },
        context: defaultContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid assignee');
    });

    it('should return error when Jira issue creation fails', async () => {
      mockStorageService.getForm.mockResolvedValue(mockForm);
      mockJiraService.validateAssignee.mockResolvedValue({ valid: true });
      mockJiraService.createIssue.mockResolvedValue({ success: false, error: 'Permission denied' });

      const result = await mockResolverHandlers.submitForm({
        payload: {
          formId: 'form-1',
          fieldValues: { summary: 'Test', assignee: 'user-1' },
          createJiraIssue: true,
          projectKey: 'PROJ',
        },
        context: defaultContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  // ─── createJiraIssue ────────────────────────────────────

  describe('createJiraIssue', () => {
    it('should create a Jira issue successfully', async () => {
      mockJiraService.validateAssignee.mockResolvedValue({ valid: true });
      mockJiraService.createIssue.mockResolvedValue({ success: true, issueKey: 'PROJ-456' });

      const result = await mockResolverHandlers.createJiraIssue({
        payload: {
          projectKey: 'PROJ',
          summary: 'Direct Issue',
          assigneeAccountId: 'user-1',
        },
        context: defaultContext,
      });

      expect(result.success).toBe(true);
      expect(result.issueKey).toBe('PROJ-456');
    });

    it('should return error when project key is missing', async () => {
      const result = await mockResolverHandlers.createJiraIssue({
        payload: { projectKey: '', summary: 'Test', assigneeAccountId: 'user-1' },
        context: defaultContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project key is required');
    });

    it('should return error when summary is missing', async () => {
      const result = await mockResolverHandlers.createJiraIssue({
        payload: { projectKey: 'PROJ', summary: '', assigneeAccountId: 'user-1' },
        context: defaultContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Summary is required');
    });

    it('should return error when assignee is invalid', async () => {
      mockJiraService.validateAssignee.mockResolvedValue({ valid: false, error: 'User not found' });

      const result = await mockResolverHandlers.createJiraIssue({
        payload: {
          projectKey: 'PROJ',
          summary: 'Test',
          assigneeAccountId: 'invalid-user',
        },
        context: defaultContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('User not found');
    });
  });

  // ─── searchJiraUsers ────────────────────────────────────

  describe('searchJiraUsers', () => {
    it('should return users', async () => {
      mockJiraService.searchUsers.mockResolvedValue({
        success: true,
        users: [{ accountId: '123', displayName: 'Test User' }],
      });

      const result = await mockResolverHandlers.searchJiraUsers({
        payload: { query: 'test' },
        context: defaultContext,
      });

      expect(result.success).toBe(true);
      expect(result.users).toHaveLength(1);
    });

    it('should return error when query is missing', async () => {
      const result = await mockResolverHandlers.searchJiraUsers({
        payload: {},
        context: defaultContext,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Search query is required');
    });
  });

  // ─── getJiraProjects ────────────────────────────────────

  describe('getJiraProjects', () => {
    it('should return projects', async () => {
      mockJiraService.getProjects.mockResolvedValue({
        success: true,
        projects: [{ key: 'PROJ', name: 'Project' }],
      });

      const result = await mockResolverHandlers.getJiraProjects({
        payload: {},
        context: defaultContext,
      });

      expect(result.success).toBe(true);
      expect(result.projects).toHaveLength(1);
    });
  });

  // ─── getSubmissions ─────────────────────────────────────

  describe('getSubmissions', () => {
    it('should return submissions for a form', async () => {
      mockStorageService.getSubmissionsByForm.mockResolvedValue([
        { id: 'sub-1', fieldValues: { summary: 'Test' } },
      ]);

      const result = await mockResolverHandlers.getSubmissions({
        payload: { formId: 'form-1' },
        context: defaultContext,
      });

      expect(result.success).toBe(true);
      expect(result.submissions).toHaveLength(1);
    });

    it('should return error when formId is missing', async () => {
      const result = await mockResolverHandlers.getSubmissions({
        payload: {},
        context: defaultContext,
      });

      expect(result.success).toBe(false);
    });
  });
});
