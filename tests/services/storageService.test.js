// Mock the @forge/api storage module
const mockStorage = {};
jest.mock('@forge/api', () => ({
  storage: {
    get: jest.fn((key) => Promise.resolve(mockStorage[key] || null)),
    set: jest.fn((key, value) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    delete: jest.fn((key) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
}));

const storageService = require('../../src/services/storageService');

describe('storageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear mock storage
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  // ─── Form Operations ───────────────────────────────────────

  describe('saveForm', () => {
    it('should throw error when form has no id', async () => {
      await expect(storageService.saveForm({})).rejects.toThrow('Form must have an id');
    });

    it('should throw error when form is null', async () => {
      await expect(storageService.saveForm(null)).rejects.toThrow('Form must have an id');
    });

    it('should save form and update page form list', async () => {
      const form = {
        id: 'form-1',
        pageId: 'page-1',
        title: 'Test Form',
        fields: [],
      };

      await storageService.saveForm(form);

      const { storage } = require('@forge/api');
      expect(storage.set).toHaveBeenCalledWith(
        'form:form-1',
        expect.objectContaining({
          id: 'form-1',
          title: 'Test Form',
          updatedAt: expect.any(String),
        })
      );
    });
  });

  describe('getForm', () => {
    it('should return null when formId is empty', async () => {
      const result = await storageService.getForm('');
      expect(result).toBeNull();
    });

    it('should return form from storage', async () => {
      const form = { id: 'form-1', title: 'Test' };
      mockStorage['form:form-1'] = form;

      const result = await storageService.getForm('form-1');
      expect(result).toEqual(form);
    });
  });

  describe('getFormsByPage', () => {
    it('should return empty array when pageId is empty', async () => {
      const result = await storageService.getFormsByPage('');
      expect(result).toEqual([]);
    });

    it('should return all forms for a page', async () => {
      const form1 = { id: 'form-1', title: 'Form 1' };
      const form2 = { id: 'form-2', title: 'Form 2' };
      mockStorage['forms:page:page-1'] = ['form-1', 'form-2'];
      mockStorage['form:form-1'] = form1;
      mockStorage['form:form-2'] = form2;

      const result = await storageService.getFormsByPage('page-1');
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Form 1');
      expect(result[1].title).toBe('Form 2');
    });

    it('should filter out null forms (deleted but still in list)', async () => {
      mockStorage['forms:page:page-1'] = ['form-1', 'form-missing'];
      mockStorage['form:form-1'] = { id: 'form-1', title: 'Form 1' };

      const result = await storageService.getFormsByPage('page-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteForm', () => {
    it('should do nothing when formId is empty', async () => {
      const { storage } = require('@forge/api');
      await storageService.deleteForm('');
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('should delete form and its submissions', async () => {
      mockStorage['submissions:form:form-1'] = ['sub-1', 'sub-2'];
      mockStorage['submission:sub-1'] = { id: 'sub-1' };
      mockStorage['submission:sub-2'] = { id: 'sub-2' };
      mockStorage['forms:page:page-1'] = ['form-1', 'form-2'];
      mockStorage['form:form-1'] = { id: 'form-1' };

      await storageService.deleteForm('form-1', 'page-1');

      const { storage } = require('@forge/api');
      expect(storage.delete).toHaveBeenCalledWith('submission:sub-1');
      expect(storage.delete).toHaveBeenCalledWith('submission:sub-2');
      expect(storage.delete).toHaveBeenCalledWith('submissions:form:form-1');
      expect(storage.delete).toHaveBeenCalledWith('form:form-1');
    });
  });

  // ─── Submission Operations ──────────────────────────────────

  describe('saveSubmission', () => {
    it('should throw error when submission has no id', async () => {
      await expect(storageService.saveSubmission({})).rejects.toThrow('Submission must have an id');
    });

    it('should save submission and update form submission list', async () => {
      const submission = {
        id: 'sub-1',
        formId: 'form-1',
        fieldValues: { summary: 'Test' },
      };

      await storageService.saveSubmission(submission);

      const { storage } = require('@forge/api');
      expect(storage.set).toHaveBeenCalledWith(
        'submission:sub-1',
        expect.objectContaining({
          id: 'sub-1',
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('getSubmission', () => {
    it('should return null when submissionId is empty', async () => {
      const result = await storageService.getSubmission('');
      expect(result).toBeNull();
    });

    it('should return submission from storage', async () => {
      const submission = { id: 'sub-1', fieldValues: { summary: 'Test' } };
      mockStorage['submission:sub-1'] = submission;

      const result = await storageService.getSubmission('sub-1');
      expect(result).toEqual(submission);
    });
  });

  describe('getSubmissionsByForm', () => {
    it('should return empty array when formId is empty', async () => {
      const result = await storageService.getSubmissionsByForm('');
      expect(result).toEqual([]);
    });

    it('should return all submissions for a form', async () => {
      mockStorage['submissions:form:form-1'] = ['sub-1', 'sub-2'];
      mockStorage['submission:sub-1'] = { id: 'sub-1', fieldValues: { summary: 'Test 1' } };
      mockStorage['submission:sub-2'] = { id: 'sub-2', fieldValues: { summary: 'Test 2' } };

      const result = await storageService.getSubmissionsByForm('form-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('deleteSubmission', () => {
    it('should do nothing when submissionId is empty', async () => {
      const { storage } = require('@forge/api');
      await storageService.deleteSubmission('');
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('should delete submission and update form list', async () => {
      mockStorage['submissions:form:form-1'] = ['sub-1', 'sub-2'];

      await storageService.deleteSubmission('sub-1', 'form-1');

      const { storage } = require('@forge/api');
      expect(storage.delete).toHaveBeenCalledWith('submission:sub-1');
    });
  });

  describe('updateSubmission', () => {
    it('should return null when submission does not exist', async () => {
      const result = await storageService.updateSubmission('nonexistent', { jiraIssueKey: 'PROJ-1' });
      expect(result).toBeNull();
    });

    it('should update existing submission', async () => {
      mockStorage['submission:sub-1'] = {
        id: 'sub-1',
        fieldValues: { summary: 'Test' },
        jiraIssueKey: null,
      };

      const result = await storageService.updateSubmission('sub-1', { jiraIssueKey: 'PROJ-123' });
      expect(result.jiraIssueKey).toBe('PROJ-123');
      expect(result.updatedAt).toBeDefined();
    });
  });
});
