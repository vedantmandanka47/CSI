import { describe, it, expect } from 'vitest';
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  TaskResponseSchema,
  TaskListResponseSchema,
  TaskStatus,
  TaskPriority,
  ALL_TASK_STATUSES,
  ALL_TASK_PRIORITIES,
  CreateChecklistSchema,
  CreateChecklistItemInputSchema,
  UpdateChecklistItemSchema,
  ChecklistResponseSchema,
  CreateChecklistRunSchema,
  SignOffChecklistRunSchema,
  ChecklistRunResponseSchema,
  ChecklistRunStatus,
  ALL_CHECKLIST_RUN_STATUSES,
  UploadAssetSchema,
  ReviewAssetSchema,
  AssetResponseSchema,
  AssetListResponseSchema,
  AssetCategory,
  AssetStatus,
  ALL_ASSET_CATEGORIES,
  ALL_ASSET_STATUSES,
} from '@csi/shared';

describe('M16 Shared Schemas (Tasks, Checklists & Assets)', () => {
  describe('Task Schemas & Enums', () => {
    it('should define all canonical task statuses and priorities', () => {
      expect(ALL_TASK_STATUSES).toContain(TaskStatus.TODO);
      expect(ALL_TASK_STATUSES).toContain(TaskStatus.IN_PROGRESS);
      expect(ALL_TASK_STATUSES).toContain(TaskStatus.REVIEW);
      expect(ALL_TASK_STATUSES).toContain(TaskStatus.COMPLETED);
      expect(ALL_TASK_STATUSES).toContain(TaskStatus.CANCELLED);

      expect(ALL_TASK_PRIORITIES).toContain(TaskPriority.LOW);
      expect(ALL_TASK_PRIORITIES).toContain(TaskPriority.MEDIUM);
      expect(ALL_TASK_PRIORITIES).toContain(TaskPriority.HIGH);
      expect(ALL_TASK_PRIORITIES).toContain(TaskPriority.URGENT);
    });

    it('should validate valid CreateTaskInput and apply defaults', () => {
      const input = {
        title: 'Build registration portal banner',
        description: 'Coordinate with PR on dimensions',
      };
      const parsed = CreateTaskSchema.safeParse(input);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.status).toBe(TaskStatus.TODO);
        expect(parsed.data.priority).toBe(TaskPriority.MEDIUM);
      }

      const updateInput = {
        title: 'Updated title',
        status: TaskStatus.IN_PROGRESS,
      };
      expect(UpdateTaskSchema.safeParse(updateInput).success).toBe(true);
    });

    it('should reject CreateTaskInput with invalid title or bad UUID', () => {
      const invalidShort = { title: 'ab' };
      expect(CreateTaskSchema.safeParse(invalidShort).success).toBe(false);

      const invalidUuid = {
        title: 'Valid task title',
        assignedToId: 'not-a-valid-uuid',
      };
      expect(CreateTaskSchema.safeParse(invalidUuid).success).toBe(false);
    });

    it('should validate TaskResponse and TaskListResponse', () => {
      const validTask = {
        id: '11111111-1111-1111-1111-111111111111',
        committeeId: '22222222-2222-2222-2222-222222222222',
        title: 'Test Task',
        description: 'Description here',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        dueDate: '2026-11-15T00:00:00.000Z',
        assignedToId: null,
        createdById: '33333333-3333-3333-3333-333333333333',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      };
      expect(TaskResponseSchema.safeParse(validTask).success).toBe(true);

      const listPayload = {
        tasks: [validTask],
        total: 1,
      };
      expect(TaskListResponseSchema.safeParse(listPayload).success).toBe(true);
    });
  });

  describe('Checklist Schemas', () => {
    it('should define all canonical checklist run statuses', () => {
      expect(ALL_CHECKLIST_RUN_STATUSES).toContain(ChecklistRunStatus.IN_PROGRESS);
      expect(ALL_CHECKLIST_RUN_STATUSES).toContain(ChecklistRunStatus.COMPLETED);
      expect(ALL_CHECKLIST_RUN_STATUSES).toContain(ChecklistRunStatus.SIGNED_OFF);
    });

    it('should validate CreateChecklistSchema with items', () => {
      const checklistInput = {
        title: 'Pre-Event Launch Checklist',
        description: 'Standard operational protocol for GCET auditorium events',
        isTemplate: true,
        items: [
          { title: 'Test sound system and mics', orderIndex: 1 },
          { title: 'Verify guest passkey registration', orderIndex: 2 },
        ],
      };
      const parsed = CreateChecklistSchema.safeParse(checklistInput);
      expect(parsed.success).toBe(true);

      const itemInput = {
        title: 'Single checklist item',
        orderIndex: 0,
      };
      expect(CreateChecklistItemInputSchema.safeParse(itemInput).success).toBe(true);
    });

    it('should validate UpdateChecklistItemSchema and SignOffChecklistRunSchema', () => {
      const updateItem = {
        isCompleted: true,
      };
      expect(UpdateChecklistItemSchema.safeParse(updateItem).success).toBe(true);

      const signOff = {
        signOffNotes: 'All equipment confirmed operational by Lead.',
      };
      expect(SignOffChecklistRunSchema.safeParse(signOff).success).toBe(true);

      const runInput = {
        checklistId: '55555555-5555-5555-5555-555555555555',
      };
      expect(CreateChecklistRunSchema.safeParse(runInput).success).toBe(true);
    });

    it('should validate ChecklistResponseSchema and ChecklistRunResponseSchema', () => {
      const validChecklist = {
        id: '55555555-5555-5555-5555-555555555555',
        committeeId: '66666666-6666-6666-6666-666666666666',
        title: 'Event Run Protocol',
        description: null,
        isTemplate: true,
        items: [],
        totalItems: 0,
        completedItems: 0,
        createdById: '88888888-8888-8888-8888-888888888888',
        createdAt: '2026-11-01T09:00:00.000Z',
        updatedAt: '2026-11-01T09:00:00.000Z',
      };
      expect(ChecklistResponseSchema.safeParse(validChecklist).success).toBe(true);

      const run = {
        id: '44444444-4444-4444-4444-444444444444',
        checklistId: '55555555-5555-5555-5555-555555555555',
        committeeId: '66666666-6666-6666-6666-666666666666',
        status: ChecklistRunStatus.SIGNED_OFF,
        signedOffById: '77777777-7777-7777-7777-777777777777',
        signedOffAt: '2026-11-01T12:00:00.000Z',
        signOffNotes: 'Auditorium confirmed ready',
        createdById: '88888888-8888-8888-8888-888888888888',
        createdAt: '2026-11-01T09:00:00.000Z',
        updatedAt: '2026-11-01T12:00:00.000Z',
      };
      expect(ChecklistRunResponseSchema.safeParse(run).success).toBe(true);
    });
  });

  describe('Asset Schemas', () => {
    it('should define all canonical asset categories and statuses', () => {
      expect(ALL_ASSET_CATEGORIES).toContain(AssetCategory.POSTER);
      expect(ALL_ASSET_CATEGORIES).toContain(AssetCategory.BANNER);
      expect(ALL_ASSET_CATEGORIES).toContain(AssetCategory.COPY);
      expect(ALL_ASSET_CATEGORIES).toContain(AssetCategory.VIDEO_CLIP);
      expect(ALL_ASSET_CATEGORIES).toContain(AssetCategory.DOCUMENT);
      expect(ALL_ASSET_CATEGORIES).toContain(AssetCategory.OTHER);

      expect(ALL_ASSET_STATUSES).toContain(AssetStatus.DRAFT);
      expect(ALL_ASSET_STATUSES).toContain(AssetStatus.SUBMITTED);
      expect(ALL_ASSET_STATUSES).toContain(AssetStatus.UNDER_REVIEW);
      expect(ALL_ASSET_STATUSES).toContain(AssetStatus.APPROVED);
      expect(ALL_ASSET_STATUSES).toContain(AssetStatus.REJECTED);
    });

    it('should validate UploadAssetSchema and ReviewAssetSchema', () => {
      const upload = {
        title: 'Hackathon 2026 Main Poster',
        category: AssetCategory.POSTER,
        fileName: 'poster-final.png',
        fileBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      };
      expect(UploadAssetSchema.safeParse(upload).success).toBe(true);

      const review = {
        status: AssetStatus.APPROVED,
        reviewNotes: 'Colors match official brand guidelines.',
      };
      expect(ReviewAssetSchema.safeParse(review).success).toBe(true);
    });

    it('should validate AssetResponseSchema and AssetListResponseSchema', () => {
      const asset = {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        committeeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        title: 'Workshop Social Graphic',
        category: AssetCategory.POSTER,
        fileName: 'graphic.png',
        fileSizeBytes: 1024,
        mimeType: 'image/png',
        fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        status: AssetStatus.APPROVED,
        reviewNotes: 'Approved for distribution',
        reviewedById: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        reviewedAt: '2026-11-01T10:00:00.000Z',
        uploadedById: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        createdAt: '2026-11-01T09:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z',
      };
      expect(AssetResponseSchema.safeParse(asset).success).toBe(true);

      const list = {
        assets: [asset],
        total: 1,
      };
      expect(AssetListResponseSchema.safeParse(list).success).toBe(true);
    });
  });
});
