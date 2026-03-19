// Mock the @forge/api module
const mockRequestJira = jest.fn();
jest.mock('@forge/api', () => ({
  fetch: jest.fn(),
  asApp: () => ({
    requestJira: mockRequestJira,
  }),
}));

const jiraService = require('../../src/services/jiraService');

describe('jiraService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── validateAssignee ─────────────────────────────────────

  describe('validateAssignee', () => {
    it('should return invalid when accountId is empty', async () => {
      const result = await jiraService.validateAssignee('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Assignee account ID is required');
    });

    it('should return invalid when accountId is null', async () => {
      const result = await jiraService.validateAssignee(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Assignee account ID is required');
    });

    it('should return valid when user is found', async () => {
      const mockUser = { accountId: '123', displayName: 'Test User' };
      mockRequestJira.mockResolvedValue({
        ok: true,
        json: async () => mockUser,
      });

      const result = await jiraService.validateAssignee('123');
      expect(result.valid).toBe(true);
      expect(result.user).toEqual(mockUser);
      expect(mockRequestJira).toHaveBeenCalledWith(
        '/rest/api/3/user?accountId=123',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return invalid when user is not found (404)', async () => {
      mockRequestJira.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      const result = await jiraService.validateAssignee('nonexistent');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should return invalid on API error', async () => {
      mockRequestJira.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await jiraService.validateAssignee('123');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Failed to validate assignee');
    });

    it('should handle network errors gracefully', async () => {
      mockRequestJira.mockRejectedValue(new Error('Network error'));

      const result = await jiraService.validateAssignee('123');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Error validating assignee');
    });
  });

  // ─── createIssue ──────────────────────────────────────────

  describe('createIssue', () => {
    it('should return error when projectKey is missing', async () => {
      const result = await jiraService.createIssue({
        projectKey: '',
        summary: 'Test',
        assigneeAccountId: '123',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Project key is required');
    });

    it('should return error when summary is missing', async () => {
      const result = await jiraService.createIssue({
        projectKey: 'PROJ',
        summary: '',
        assigneeAccountId: '123',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Summary is required');
    });

    it('should return error when assignee is missing', async () => {
      const result = await jiraService.createIssue({
        projectKey: 'PROJ',
        summary: 'Test',
        assigneeAccountId: '',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Assignee account ID is required');
    });

    it('should create issue successfully', async () => {
      mockRequestJira.mockResolvedValue({
        ok: true,
        json: async () => ({ key: 'PROJ-123', id: '10001' }),
      });

      const result = await jiraService.createIssue({
        projectKey: 'PROJ',
        summary: 'Test Issue',
        assigneeAccountId: 'user-123',
      });

      expect(result.success).toBe(true);
      expect(result.issueKey).toBe('PROJ-123');
      expect(result.issueId).toBe('10001');

      expect(mockRequestJira).toHaveBeenCalledWith(
        '/rest/api/3/issue',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"summary":"Test Issue"'),
        })
      );

      // Verify assignee uses accountId (not id)
      const callBody = JSON.parse(mockRequestJira.mock.calls[0][1].body);
      expect(callBody.fields.assignee).toEqual({ accountId: 'user-123' });
    });

    it('should include description in ADF format when provided', async () => {
      mockRequestJira.mockResolvedValue({
        ok: true,
        json: async () => ({ key: 'PROJ-124', id: '10002' }),
      });

      await jiraService.createIssue({
        projectKey: 'PROJ',
        summary: 'Test Issue',
        assigneeAccountId: 'user-123',
        description: 'My description',
      });

      const callBody = JSON.parse(mockRequestJira.mock.calls[0][1].body);
      expect(callBody.fields.description).toEqual({
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'My description' }],
          },
        ],
      });
    });

    it('should include priority when provided', async () => {
      mockRequestJira.mockResolvedValue({
        ok: true,
        json: async () => ({ key: 'PROJ-125', id: '10003' }),
      });

      await jiraService.createIssue({
        projectKey: 'PROJ',
        summary: 'Test Issue',
        assigneeAccountId: 'user-123',
        priority: 'High',
      });

      const callBody = JSON.parse(mockRequestJira.mock.calls[0][1].body);
      expect(callBody.fields.priority).toEqual({ name: 'High' });
    });

    it('should handle Jira API errors with structured error messages', async () => {
      mockRequestJira.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          errors: { assignee: 'User does not exist or does not have browse permission' },
        }),
      });

      const result = await jiraService.createIssue({
        projectKey: 'PROJ',
        summary: 'Test',
        assigneeAccountId: 'invalid-user',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('User does not exist');
    });

    it('should extract errorMessages when errors object is empty', async () => {
      mockRequestJira.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({
          errors: {},
          errorMessages: ['Permission denied'],
        }),
      });

      const result = await jiraService.createIssue({
        projectKey: 'PROJ',
        summary: 'Test',
        assigneeAccountId: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });

    it('should handle Jira API errors with errorMessages array', async () => {
      mockRequestJira.mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          errorMessages: ['Project does not exist'],
        }),
      });

      const result = await jiraService.createIssue({
        projectKey: 'INVALID',
        summary: 'Test',
        assigneeAccountId: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project does not exist');
    });

    it('should handle network errors gracefully', async () => {
      mockRequestJira.mockRejectedValue(new Error('Connection refused'));

      const result = await jiraService.createIssue({
        projectKey: 'PROJ',
        summary: 'Test',
        assigneeAccountId: 'user-123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create Jira issue');
    });

    it('should use Task as default issue type', async () => {
      mockRequestJira.mockResolvedValue({
        ok: true,
        json: async () => ({ key: 'PROJ-126', id: '10004' }),
      });

      await jiraService.createIssue({
        projectKey: 'PROJ',
        summary: 'Test Issue',
        assigneeAccountId: 'user-123',
      });

      const callBody = JSON.parse(mockRequestJira.mock.calls[0][1].body);
      expect(callBody.fields.issuetype.name).toBe('Task');
    });

    it('should use custom issue type when provided', async () => {
      mockRequestJira.mockResolvedValue({
        ok: true,
        json: async () => ({ key: 'PROJ-127', id: '10005' }),
      });

      await jiraService.createIssue({
        projectKey: 'PROJ',
        summary: 'Test Issue',
        assigneeAccountId: 'user-123',
        issueType: 'Bug',
      });

      const callBody = JSON.parse(mockRequestJira.mock.calls[0][1].body);
      expect(callBody.fields.issuetype.name).toBe('Bug');
    });
  });

  // ─── searchUsers ──────────────────────────────────────────

  describe('searchUsers', () => {
    it('should return error when query is empty', async () => {
      const result = await jiraService.searchUsers('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Search query is required');
    });

    it('should return users on successful search', async () => {
      const mockUsers = [
        {
          accountId: '123',
          displayName: 'John Doe',
          emailAddress: 'john@example.com',
          avatarUrls: { '48x48': 'https://example.com/avatar.png' },
        },
      ];

      mockRequestJira.mockResolvedValue({
        ok: true,
        json: async () => mockUsers,
      });

      const result = await jiraService.searchUsers('John');
      expect(result.success).toBe(true);
      expect(result.users).toHaveLength(1);
      expect(result.users[0].accountId).toBe('123');
      expect(result.users[0].displayName).toBe('John Doe');
      expect(result.users[0].avatarUrl).toBe('https://example.com/avatar.png');
    });

    it('should handle API errors', async () => {
      mockRequestJira.mockResolvedValue({
        ok: false,
        text: async () => 'Error',
      });

      const result = await jiraService.searchUsers('test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to search users');
    });
  });

  // ─── getProjects ──────────────────────────────────────────

  describe('getProjects', () => {
    it('should return projects on success', async () => {
      const mockProjects = {
        values: [
          { key: 'PROJ', name: 'My Project', id: '10000' },
          { key: 'TEST', name: 'Test Project', id: '10001' },
        ],
      };

      mockRequestJira.mockResolvedValue({
        ok: true,
        json: async () => mockProjects,
      });

      const result = await jiraService.getProjects();
      expect(result.success).toBe(true);
      expect(result.projects).toHaveLength(2);
      expect(result.projects[0].key).toBe('PROJ');
    });

    it('should handle API errors', async () => {
      mockRequestJira.mockResolvedValue({
        ok: false,
        text: async () => 'Forbidden',
      });

      const result = await jiraService.getProjects();
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to fetch projects');
    });
  });
});
