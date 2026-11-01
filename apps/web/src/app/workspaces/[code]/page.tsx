'use client';

import React, { useState, useEffect, use, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-context';
import { apiClient, ApiError } from '@/lib/api-client';
import {
  CommitteeWorkspaceDetails,
  WorkspacesListResponse,
  TaskResponse,
  TaskListResponse,
  TaskStatus,
  TaskPriority,
  ChecklistResponse,
  ChecklistRunResponse,
  AssetResponse,
  AssetListResponse,
  AssetCategory,
} from '@csi/shared';
import {
  Users,
  ShieldAlert,
  Layers,
  FileCheck,
  Search,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ListTodo,
  CheckSquare,
  Image,
  Upload,
  Download,
  Plus,
  Trash2,
  Clock,
  Flag,
  Filter,
} from 'lucide-react';

interface WorkspacePageProps {
  params: Promise<{ code: string }>;
}

export default function CommitteeWorkspacePage({ params }: WorkspacePageProps) {
  const resolvedParams = use(params);
  const committeeCode = resolvedParams.code;

  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [workspace, setWorkspace] = useState<CommitteeWorkspaceDetails | null>(null);
  const [allWorkspaces, setAllWorkspaces] = useState<WorkspacesListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<{
    code: string;
    message: string;
    isForbidden?: boolean;
    isNotFound?: boolean;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'checklists' | 'assets' | 'roster' | 'operations'>('overview');
  const [memberSearch, setMemberSearch] = useState('');
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // M16 Subsystem States
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [taskFilterStatus, setTaskFilterStatus] = useState<string>('all');
  const [taskFilterPriority, setTaskFilterPriority] = useState<string>('all');
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPriority, setTaskPriority] = useState<string>(TaskPriority.MEDIUM);
  const [taskAssignee, setTaskAssignee] = useState<string>('');
  const [taskDueDate, setTaskDueDate] = useState<string>('');

  const [checklists, setChecklists] = useState<ChecklistResponse[]>([]);
  const [checklistRuns, setChecklistRuns] = useState<ChecklistRunResponse[]>([]);
  const [showNewChecklistForm, setShowNewChecklistForm] = useState(false);
  const [chkTitle, setChkTitle] = useState('');
  const [chkDesc, setChkDesc] = useState('');
  const [chkItemsInput, setChkItemsInput] = useState<string>('');
  const [activeRunSignOffId, setActiveRunSignOffId] = useState<string | null>(null);
  const [signOffNotes, setSignOffNotes] = useState('');

  const [assets, setAssets] = useState<AssetResponse[]>([]);
  const [showNewAssetForm, setShowNewAssetForm] = useState(false);
  const [assetTitle, setAssetTitle] = useState('');
  const [assetCategory, setAssetCategory] = useState<string>(AssetCategory.POSTER);
  const [assetFileName, setAssetFileName] = useState('');
  const [assetBase64, setAssetBase64] = useState('');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load Workspace core data
  useEffect(() => {
    async function loadWorkspace() {
      if (!isAuthenticated) return;
      setLoading(true);
      setErrorStatus(null);

      try {
        const [wsDetails, wsList] = await Promise.all([
          apiClient.get<CommitteeWorkspaceDetails>(`/workspaces/${committeeCode}`),
          apiClient.get<WorkspacesListResponse>('/me/workspaces'),
        ]);

        setWorkspace(wsDetails);
        setAllWorkspaces(wsList);

        // Load M16 operations in parallel
        void loadTasks();
        void loadChecklists();
        void loadAssets();
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setErrorStatus({
            code: err.code,
            message: err.message,
            isForbidden: err.status === 403,
            isNotFound: err.status === 404,
          });
        } else {
          setErrorStatus({
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred while loading this workspace.',
          });
        }
      } finally {
        setLoading(false);
      }
    }

    if (isAuthenticated) {
      void loadWorkspace();
    }
  }, [committeeCode, isAuthenticated]);

  async function loadTasks() {
    try {
      const res = await apiClient.get<TaskListResponse>(`/workspaces/${committeeCode}/tasks`);
      setTasks(res.tasks);
    } catch {
      // non-blocking
    }
  }

  async function loadChecklists() {
    try {
      const [chks, runs] = await Promise.all([
        apiClient.get<ChecklistResponse[]>(`/workspaces/${committeeCode}/checklists`),
        apiClient.get<ChecklistRunResponse[]>(`/workspaces/${committeeCode}/checklist-runs`),
      ]);
      setChecklists(chks);
      setChecklistRuns(runs);
    } catch {
      // non-blocking
    }
  }

  async function loadAssets() {
    try {
      const res = await apiClient.get<AssetListResponse>(`/workspaces/${committeeCode}/assets`);
      setAssets(res.assets);
    } catch {
      // non-blocking
    }
  }

  // Task Actions
  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    try {
      await apiClient.post<TaskResponse>(`/workspaces/${committeeCode}/tasks`, {
        title: taskTitle.trim(),
        description: taskDesc.trim() || undefined,
        priority: taskPriority,
        status: TaskStatus.TODO,
        assignedToId: taskAssignee || undefined,
        dueDate: taskDueDate ? new Date(taskDueDate).toISOString() : undefined,
      });

      setTaskTitle('');
      setTaskDesc('');
      setTaskAssignee('');
      setTaskDueDate('');
      setShowNewTaskForm(false);
      setActionMessage({ type: 'success', text: 'Task created successfully.' });
      void loadTasks();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create task';
      setActionMessage({ type: 'error', text: msg });
    }
  }

  async function handleUpdateTaskStatus(taskId: string, newStatus: string) {
    try {
      await apiClient.patch(`/workspaces/${committeeCode}/tasks/${taskId}`, {
        status: newStatus,
      });
      void loadTasks();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update task status';
      setActionMessage({ type: 'error', text: msg });
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await apiClient.delete(`/workspaces/${committeeCode}/tasks/${taskId}`);
      void loadTasks();
      setActionMessage({ type: 'success', text: 'Task deleted.' });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to delete task';
      setActionMessage({ type: 'error', text: msg });
    }
  }

  // Checklist Actions
  async function handleCreateChecklist(e: React.FormEvent) {
    e.preventDefault();
    if (!chkTitle.trim()) return;

    const items = chkItemsInput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, idx) => ({ title: line, orderIndex: idx }));

    try {
      await apiClient.post(`/workspaces/${committeeCode}/checklists`, {
        title: chkTitle.trim(),
        description: chkDesc.trim() || undefined,
        isTemplate: true,
        items: items.length > 0 ? items : undefined,
      });

      setChkTitle('');
      setChkDesc('');
      setChkItemsInput('');
      setShowNewChecklistForm(false);
      setActionMessage({ type: 'success', text: 'Checklist created successfully.' });
      void loadChecklists();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to create checklist';
      setActionMessage({ type: 'error', text: msg });
    }
  }

  async function handleToggleItem(checklistId: string, itemId: string, currentCompleted: boolean) {
    try {
      await apiClient.patch(`/workspaces/${committeeCode}/checklists/${checklistId}/items/${itemId}`, {
        isCompleted: !currentCompleted,
      });
      void loadChecklists();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update item';
      setActionMessage({ type: 'error', text: msg });
    }
  }

  async function handleStartRun(checklistId: string) {
    try {
      await apiClient.post(`/workspaces/${committeeCode}/checklist-runs`, {
        checklistId,
      });
      setActionMessage({ type: 'success', text: 'Pre-event run checklist initiated.' });
      void loadChecklists();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to start checklist run';
      setActionMessage({ type: 'error', text: msg });
    }
  }

  async function handleSignOffRun(runId: string) {
    try {
      await apiClient.post(`/workspaces/${committeeCode}/checklist-runs/${runId}/sign-off`, {
        signOffNotes: signOffNotes.trim() || undefined,
      });
      setActiveRunSignOffId(null);
      setSignOffNotes('');
      setActionMessage({ type: 'success', text: 'Checklist run signed off successfully.' });
      void loadChecklists();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to sign off checklist run';
      setActionMessage({ type: 'error', text: msg });
    }
  }

  // Asset Actions
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAssetFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAssetBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleUploadAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!assetTitle.trim() || !assetBase64) return;

    try {
      await apiClient.post(`/workspaces/${committeeCode}/assets`, {
        title: assetTitle.trim(),
        category: assetCategory,
        fileName: assetFileName || 'uploaded_asset',
        fileBase64: assetBase64,
      });

      setAssetTitle('');
      setAssetFileName('');
      setAssetBase64('');
      setShowNewAssetForm(false);
      setActionMessage({ type: 'success', text: 'Asset uploaded to pipeline in draft status.' });
      void loadAssets();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to upload asset';
      setActionMessage({ type: 'error', text: msg });
    }
  }

  async function handleReviewAsset(assetId: string, status: 'approved' | 'rejected') {
    const notes = window.prompt(`Enter review notes for ${status.toUpperCase()}:`) || '';
    try {
      await apiClient.post(`/workspaces/${committeeCode}/assets/${assetId}/review`, {
        status,
        reviewNotes: notes.trim() || undefined,
      });
      setActionMessage({ type: 'success', text: `Asset ${status}.` });
      void loadAssets();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to review asset';
      setActionMessage({ type: 'error', text: msg });
    }
  }

  async function handleDeleteAsset(assetId: string) {
    if (!window.confirm('Delete this media asset?')) return;
    try {
      await apiClient.delete(`/workspaces/${committeeCode}/assets/${assetId}`);
      setActionMessage({ type: 'success', text: 'Asset deleted.' });
      void loadAssets();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to delete asset';
      setActionMessage({ type: 'error', text: msg });
    }
  }

  // Filtered members for roster tab
  const filteredMembers = useMemo(() => {
    if (!workspace) return [];
    if (!memberSearch.trim()) return workspace.members;

    const q = memberSearch.toLowerCase();
    return workspace.members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.branch && m.branch.toLowerCase().includes(q)) ||
        m.roleName.toLowerCase().includes(q),
    );
  }, [workspace, memberSearch]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (taskFilterStatus !== 'all' && t.status !== taskFilterStatus) return false;
      if (taskFilterPriority !== 'all' && t.priority !== taskFilterPriority) return false;
      return true;
    });
  }, [tasks, taskFilterStatus, taskFilterPriority]);

  if (authLoading || (loading && isAuthenticated)) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-text-muted">Loading committee workspace shell...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
        <div className="rounded-full bg-surface-raised p-4 ring-8 ring-surface-raised/50">
          <Users className="h-10 w-10 text-primary" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-text">
          Committee Authentication Required
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Please sign in to access dedicated committee workspaces and operational shells.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            Sign In
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-border bg-surface px-5 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-raised"
          >
            Return to Dashboard
          </Link>
        </div>
      </main>
    );
  }

  if (errorStatus) {
    return (
      <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-3xl px-4 py-12">
        <div className="rounded-lg border border-border bg-surface p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-surface-raised p-3">
              {errorStatus.isForbidden ? (
                <ShieldAlert className="h-8 w-8 text-accent" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-primary" />
              )}
            </div>
            <div className="flex-1">
              <span className="rounded-md bg-surface-raised px-2.5 py-1 font-mono text-xs font-semibold text-accent uppercase">
                {errorStatus.code}
              </span>
              <h1 className="mt-3 font-display text-xl font-bold tracking-tight text-text">
                {errorStatus.isForbidden ? 'Workspace Access Restricted' : 'Committee Not Found'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {errorStatus.message}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-6">
                <Link
                  href="/workspaces"
                  className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                >
                  View My Authorized Workspaces
                </Link>
                <Link
                  href="/dashboard"
                  className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-medium text-text hover:bg-surface-raised"
                >
                  Return to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!workspace) {
    return null;
  }

  const { committee, currentUserAccess, metrics, recentEvents, activeSessions } = workspace;
  const userCaps = currentUserAccess.capabilities;
  const isLeadOrExecutive =
    currentUserAccess.isExecutive ||
    currentUserAccess.roleCode === 'core' ||
    currentUserAccess.roleCode === 'subcore';
  const multiWorkspaces = (allWorkspaces?.workspaces.length ?? 0) > 1;

  return (
    <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Workspace Header & Dual-Role Context Switcher */}
      <div className="border-b border-border pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-surface-raised px-2.5 py-1 font-mono text-xs font-semibold text-primary uppercase">
                {committee.code}
              </span>
              <span className="rounded-pill bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary">
                {currentUserAccess.roleName}
              </span>
              {currentUserAccess.isExecutive && (
                <span className="rounded-pill bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-text-muted">
                  Executive Oversight
                </span>
              )}
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-text sm:text-3xl">
              {committee.name}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Dedicated operational workspace, checklists & media pipelines
            </p>
          </div>

          {/* Dual-Role Context Switcher Dropdown */}
          {multiWorkspaces && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSwitcherOpen(!switcherOpen)}
                className="flex items-center gap-2 rounded-md border border-border bg-surface px-3.5 py-2 text-xs font-medium text-text shadow-sm hover:bg-surface-raised"
              >
                <Layers className="h-4 w-4 text-primary" />
                <span>Switch Workspace ({allWorkspaces?.workspaces.length})</span>
                <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
              </button>

              {switcherOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setSwitcherOpen(false)}
                  />
                  <div className="absolute right-0 z-30 mt-2 w-64 rounded-md border border-border bg-surface py-1 shadow-lg">
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase text-text-muted border-b border-border">
                      Assigned Workspaces
                    </div>
                    {allWorkspaces?.workspaces.map((ws) => {
                      const isCurrent = ws.code.toLowerCase() === committee.code.toLowerCase();
                      return (
                        <Link
                          key={ws.id}
                          href={`/workspaces/${ws.code}`}
                          onClick={() => setSwitcherOpen(false)}
                          className={`flex items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-surface-raised ${
                            isCurrent ? 'bg-surface-raised font-bold text-primary' : 'text-text'
                          }`}
                        >
                          <div>
                            <span className="block font-medium">{ws.name}</span>
                            <span className="text-[11px] text-text-muted">{ws.userRoleName}</span>
                          </div>
                          {isCurrent && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Action feedback message */}
        {actionMessage && (
          <div
            className={`mt-4 rounded-md p-3 text-xs font-medium flex items-center justify-between ${
              actionMessage.type === 'success'
                ? 'bg-success/10 text-success border border-success/20'
                : 'bg-danger/10 text-danger border border-danger/20'
            }`}
          >
            <span>{actionMessage.text}</span>
            <button
              onClick={() => setActionMessage(null)}
              className="text-xs hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Workspace Metrics Banner */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <span className="text-xs font-medium text-text-muted">Team Members</span>
            <p className="mt-1 font-display text-2xl font-bold text-text">{metrics.totalMembers}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <span className="text-xs font-medium text-text-muted">Active Tasks</span>
            <p className="mt-1 font-display text-2xl font-bold text-primary">
              {tasks.filter((t) => t.status !== TaskStatus.COMPLETED && t.status !== TaskStatus.CANCELLED).length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <span className="text-xs font-medium text-text-muted">Pre-Flight Runs</span>
            <p className="mt-1 font-display text-2xl font-bold text-text">{checklistRuns.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
            <span className="text-xs font-medium text-text-muted">Media Assets</span>
            <p className="mt-1 font-display text-2xl font-bold text-text">{assets.length}</p>
          </div>
        </div>

        {/* Workspace Tabs Navigation */}
        <div className="mt-6 flex border-b border-border overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:border-border hover:text-text'
            }`}
          >
            <Layers className="h-4 w-4" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'tasks'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:border-border hover:text-text'
            }`}
          >
            <ListTodo className="h-4 w-4" />
            Tasks ({tasks.length})
          </button>
          <button
            onClick={() => setActiveTab('checklists')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'checklists'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:border-border hover:text-text'
            }`}
          >
            <CheckSquare className="h-4 w-4" />
            Checklists ({checklists.length})
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'assets'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:border-border hover:text-text'
            }`}
          >
            <Image className="h-4 w-4" />
            Media Assets ({assets.length})
          </button>
          <button
            onClick={() => setActiveTab('roster')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'roster'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:border-border hover:text-text'
            }`}
          >
            <Users className="h-4 w-4" />
            Team Roster ({workspace.members.length})
          </button>
          <button
            onClick={() => setActiveTab('operations')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'operations'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:border-border hover:text-text'
            }`}
          >
            <FileCheck className="h-4 w-4" />
            Capabilities
          </button>
        </div>
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
              <h2 className="font-display text-lg font-bold text-text">Operational Mandate</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {committee.description}
              </p>
            </div>

            {/* Quick Tasks Summary */}
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-text">Priority Tasks</h2>
                <button
                  onClick={() => setActiveTab('tasks')}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  View All Tasks
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {tasks.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-md border border-border p-3">
                    <div>
                      <span className="font-medium text-sm text-text">{t.title}</span>
                      <span className="ml-2 rounded-pill bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-primary uppercase">
                        {t.priority}
                      </span>
                    </div>
                    <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary uppercase">
                      {t.status}
                    </span>
                  </div>
                ))}
                {tasks.length === 0 && (
                  <p className="text-xs text-text-muted">No tasks assigned yet. Click the Tasks tab to create one.</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Active Sessions */}
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-text">Active Attendance Sessions</h3>
              <div className="mt-3 space-y-2">
                {activeSessions.map((s) => (
                  <div key={s.id} className="rounded-md border border-border p-3 text-xs">
                    <span className="font-semibold text-text">{s.eventTitle}</span>
                    <span className="block text-text-muted">{s.sessionType}</span>
                  </div>
                ))}
                {activeSessions.length === 0 && (
                  <p className="text-xs text-text-muted">No open attendance check-in sessions right now.</p>
                )}
              </div>
            </div>

            {/* Upcoming Events */}
            <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-text">Branch Events</h3>
              <div className="mt-3 space-y-2">
                {recentEvents.slice(0, 3).map((e) => (
                  <div key={e.id} className="rounded-md border border-border p-3 text-xs">
                    <span className="font-semibold text-text">{e.title}</span>
                    <span className="block text-text-muted">{new Date(e.startsAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Tasks (M16) */}
      {activeTab === 'tasks' && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text">
                <Filter className="h-3.5 w-3.5 text-text-muted" />
                <span className="font-medium text-text-muted">Status:</span>
                <select
                  value={taskFilterStatus}
                  onChange={(e) => setTaskFilterStatus(e.target.value)}
                  className="bg-transparent font-medium text-text outline-none"
                >
                  <option value="all">All</option>
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text">
                <Flag className="h-3.5 w-3.5 text-text-muted" />
                <span className="font-medium text-text-muted">Priority:</span>
                <select
                  value={taskFilterPriority}
                  onChange={(e) => setTaskFilterPriority(e.target.value)}
                  className="bg-transparent font-medium text-text outline-none"
                >
                  <option value="all">All</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => setShowNewTaskForm(!showNewTaskForm)}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New Task
            </button>
          </div>

          {/* New Task Form */}
          {showNewTaskForm && (
            <form onSubmit={handleCreateTask} className="rounded-lg border border-border bg-surface p-6 shadow-sm space-y-4">
              <h3 className="font-display text-md font-bold text-text">Create Committee Task</h3>
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="Task title (min 3 chars)"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Supporting instructions, links, or requirements"
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value)}
                    className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Assignee (Optional)</label>
                  <select
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value)}
                    className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text outline-none"
                  >
                    <option value="">Unassigned</option>
                    {workspace.members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name} ({m.roleName})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Due Date (Optional)</label>
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  Create Task
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewTaskForm(false)}
                  className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-medium text-text hover:bg-surface-raised"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Tasks List */}
          <div className="space-y-3">
            {filteredTasks.map((t) => (
              <div key={t.id} className="rounded-lg border border-border bg-surface p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-text">{t.title}</span>
                    <span className="rounded-pill bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-primary uppercase">
                      {t.priority}
                    </span>
                  </div>
                  {t.description && <p className="text-xs text-text-muted">{t.description}</p>}
                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-text-muted pt-1">
                    {t.assignedTo && <span>Assigned: {t.assignedTo.fullName}</span>}
                    {t.dueDate && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Due {new Date(t.dueDate).toLocaleDateString()}
                      </span>
                    )}
                    <span>Created by {t.createdBy?.fullName}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <select
                    value={t.status}
                    onChange={(e) => handleUpdateTaskStatus(t.id, e.target.value)}
                    className="rounded-md border border-border bg-canvas px-2.5 py-1.5 text-xs font-semibold text-primary uppercase"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <button
                    onClick={() => handleDeleteTask(t.id)}
                    className="rounded-md p-1.5 text-text-muted hover:text-accent hover:bg-surface-raised"
                    title="Delete task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            {filteredTasks.length === 0 && (
              <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-text-muted">
                No tasks match the active filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Checklists (M16) */}
      {activeTab === 'checklists' && (
        <div className="mt-8 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-text">Operational Checklists & Protocols</h2>
              <p className="text-xs text-text-muted">Standard pre-event checklists and verifiable run sign-offs</p>
            </div>
            <button
              onClick={() => setShowNewChecklistForm(!showNewChecklistForm)}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New Checklist
            </button>
          </div>

          {/* New Checklist Form */}
          {showNewChecklistForm && (
            <form onSubmit={handleCreateChecklist} className="rounded-lg border border-border bg-surface p-6 shadow-sm space-y-4">
              <h3 className="font-display text-md font-bold text-text">Create Operational Protocol</h3>
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Checklist Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Auditorium Audio/Visual Setup"
                  value={chkTitle}
                  onChange={(e) => setChkTitle(e.target.value)}
                  className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Items (One per line)</label>
                <textarea
                  rows={4}
                  placeholder="Verify HDMI connection to projector&#10;Test stage wireless mics&#10;Confirm lighting presets"
                  value={chkItemsInput}
                  onChange={(e) => setChkItemsInput(e.target.value)}
                  className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text outline-none focus:border-primary font-mono"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  Create Checklist
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewChecklistForm(false)}
                  className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-medium text-text hover:bg-surface-raised"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Checklists List */}
          <div className="space-y-6">
            {checklists.map((chk) => {
              const progressPct = chk.totalItems > 0 ? Math.round((chk.completedItems / chk.totalItems) * 100) : 0;
              return (
                <div key={chk.id} className="rounded-lg border border-border bg-surface p-6 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-md font-bold text-text">{chk.title}</h3>
                        {chk.isTemplate && (
                          <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase">
                            Protocol Template
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted mt-1">
                        Progress: {chk.completedItems} of {chk.totalItems} items completed ({progressPct}%)
                      </p>
                    </div>

                    <button
                      onClick={() => handleStartRun(chk.id)}
                      className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-raised"
                    >
                      Start Pre-Event Run
                    </button>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-surface-raised h-2 rounded-pill overflow-hidden">
                    <div className="bg-primary h-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                  </div>

                  {/* Checklist Items */}
                  <div className="space-y-2 pt-2">
                    {chk.items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleToggleItem(chk.id, item.id, item.isCompleted)}
                        className="flex items-center gap-3 p-2.5 rounded-md border border-border bg-canvas cursor-pointer hover:bg-surface-raised transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={item.isCompleted}
                          onChange={() => {}} // handled by parent div click
                          className="h-4 w-4 rounded border-border text-primary"
                        />
                        <span className={`text-xs ${item.isCompleted ? 'line-through text-text-muted' : 'text-text font-medium'}`}>
                          {item.title}
                        </span>
                        {item.completedBy && (
                          <span className="ml-auto text-[10px] text-text-muted">
                            Done by {item.completedBy.fullName}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {checklists.length === 0 && (
              <div className="rounded-lg border border-border bg-surface p-8 text-center text-sm text-text-muted">
                No checklists registered yet. Click &quot;New Checklist&quot; to define an operational protocol.
              </div>
            )}
          </div>

          {/* Checklist Runs Section */}
          <div className="pt-6 border-t border-border">
            <h3 className="font-display text-md font-bold text-text mb-4">Pre-Event Runs & Sign-Offs</h3>
            <div className="space-y-3">
              {checklistRuns.map((run) => (
                <div key={run.id} className="rounded-lg border border-border bg-surface p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-text">{run.checklistTitle}</span>
                      <span className={`rounded-pill px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                        run.status === 'signed_off'
                          ? 'bg-success/10 text-success'
                          : 'bg-primary/10 text-primary'
                      }`}>
                        {run.status === 'signed_off' ? 'Signed Off' : 'In Progress'}
                      </span>
                    </div>
                    {run.signOffNotes && (
                      <p className="text-xs text-text-muted italic">&quot;{run.signOffNotes}&quot;</p>
                    )}
                    <span className="text-[11px] text-text-muted block">
                      Started by {run.createdBy?.fullName} on {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {run.status !== 'signed_off' && isLeadOrExecutive && (
                    <div>
                      {activeRunSignOffId === run.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Sign-off notes"
                            value={signOffNotes}
                            onChange={(e) => setSignOffNotes(e.target.value)}
                            className="rounded-md border border-border bg-canvas px-2.5 py-1 text-xs text-text outline-none"
                          />
                          <button
                            onClick={() => handleSignOffRun(run.id)}
                            className="rounded-md bg-success px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                          >
                            Sign Off
                          </button>
                          <button
                            onClick={() => setActiveRunSignOffId(null)}
                            className="rounded-md border border-border px-2 py-1 text-xs text-text-muted"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setActiveRunSignOffId(run.id)}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                        >
                          Sign Off Run
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {checklistRuns.length === 0 && (
                <p className="text-xs text-text-muted">No runs launched yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Media Assets (M16) */}
      {activeTab === 'assets' && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-text">Media Asset Pipeline</h2>
              <p className="text-xs text-text-muted">Submit and review promotional posters, banners, and copy</p>
            </div>
            <button
              onClick={() => setShowNewAssetForm(!showNewAssetForm)}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
            >
              <Upload className="h-4 w-4" />
              Upload Asset
            </button>
          </div>

          {/* Upload Asset Form */}
          {showNewAssetForm && (
            <form onSubmit={handleUploadAsset} className="rounded-lg border border-border bg-surface p-6 shadow-sm space-y-4">
              <h3 className="font-display text-md font-bold text-text">Upload Media Asset</h3>
              <div>
                <label className="block text-xs font-semibold text-text mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Annual Symposium Poster"
                  value={assetTitle}
                  onChange={(e) => setAssetTitle(e.target.value)}
                  className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">Category</label>
                  <select
                    value={assetCategory}
                    onChange={(e) => setAssetCategory(e.target.value)}
                    className="w-full rounded-md border border-border bg-canvas px-3 py-2 text-xs text-text outline-none"
                  >
                    <option value="poster">Poster</option>
                    <option value="banner">Banner</option>
                    <option value="copy">Promotional Copy</option>
                    <option value="video_clip">Video Clip</option>
                    <option value="document">Document / PDF</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text mb-1">File (PNG, JPEG, PDF, WEBP, MD)</label>
                  <input
                    type="file"
                    required
                    onChange={handleFileSelect}
                    className="w-full text-xs text-text file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-surface-raised file:text-primary hover:file:opacity-80"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  Submit to Pipeline
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewAssetForm(false)}
                  className="rounded-md border border-border bg-surface px-4 py-2 text-xs font-medium text-text hover:bg-surface-raised"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Assets Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-surface p-5 shadow-sm space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-pill bg-surface-raised px-2.5 py-0.5 text-[10px] font-semibold text-primary uppercase">
                      {a.category}
                    </span>
                    <span className={`rounded-pill px-2.5 py-0.5 text-[10px] font-semibold uppercase ${
                      a.status === 'approved'
                        ? 'bg-success/10 text-success'
                        : a.status === 'rejected'
                        ? 'bg-danger/10 text-danger'
                        : 'bg-primary/10 text-primary'
                    }`}>
                      {a.status}
                    </span>
                  </div>
                  <h3 className="font-display text-md font-bold text-text mt-2">{a.title}</h3>
                  <p className="text-xs text-text-muted mt-0.5 font-mono truncate">{a.fileName}</p>
                  <p className="text-[11px] text-text-muted mt-1">
                    {(a.fileSizeBytes / 1024).toFixed(1)} KB | Uploaded by {a.uploadedBy?.fullName}
                  </p>
                  {a.reviewNotes && (
                    <p className="mt-2 text-xs italic text-text-muted bg-canvas p-2 rounded border border-border">
                      &quot;{a.reviewNotes}&quot;
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                  <a
                    href={`/api/workspaces/${committeeCode}/assets/${a.id}/download`}
                    className="flex items-center gap-1.5 rounded-md bg-surface-raised px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-raised/80"
                  >
                    <Download className="h-3.5 w-3.5 text-primary" />
                    Download
                  </a>

                  {isLeadOrExecutive && a.status !== 'approved' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleReviewAsset(a.id, 'approved')}
                        className="rounded-md bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-success hover:bg-success/20"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReviewAsset(a.id, 'rejected')}
                        className="rounded-md bg-danger/10 px-2.5 py-1.5 text-xs font-semibold text-danger hover:bg-danger/20"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => handleDeleteAsset(a.id)}
                    className="p-1.5 text-text-muted hover:text-accent"
                    title="Delete asset"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {assets.length === 0 && (
              <div className="col-span-full rounded-lg border border-border bg-surface p-8 text-center text-sm text-text-muted">
                No media assets in the pipeline. Click Upload Asset to submit creative assets.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Team Roster */}
      {activeTab === 'roster' && (
        <div className="mt-8 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-text">Committee Team Roster</h2>
              <p className="text-xs text-text-muted">Active appointed members and domain contributors</p>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search member by name or role..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="w-full rounded-md border border-border bg-surface pl-9 pr-3 py-2 text-xs text-text outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMembers.map((m) => (
              <div key={m.userId} className="rounded-lg border border-border bg-surface p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-text">{m.name}</span>
                  <span className="rounded-pill bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {m.roleName}
                  </span>
                </div>
                <p className="text-xs text-text-muted font-mono">{m.email}</p>
                <div className="pt-2 border-t border-border flex items-center justify-between text-[11px] text-text-muted">
                  <span>Term: {new Date(m.termStart).toLocaleDateString()}</span>
                  <span>{m.branch || 'Student Branch'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Capabilities */}
      {activeTab === 'operations' && (
        <div className="mt-8 rounded-lg border border-border bg-surface p-6 shadow-sm space-y-4">
          <h2 className="font-display text-lg font-bold text-text">Operational Capabilities</h2>
          <p className="text-xs text-text-muted">Authorization permissions granted to your role in this committee</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {Object.entries(userCaps).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between p-3 rounded-md border border-border bg-canvas text-xs">
                <span className="font-medium text-text">{key}</span>
                <span className={`rounded-pill px-2 py-0.5 font-semibold text-[10px] ${
                  val ? 'bg-success/10 text-success' : 'bg-surface-raised text-text-muted'
                }`}>
                  {val ? 'Authorized' : 'Restricted'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
