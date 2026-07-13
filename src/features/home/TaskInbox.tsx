'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives';
import { ContextualEmptyState } from '@/components/ui/ContextualEmptyState';
import { CheckCircle, Inbox, Clock, Zap } from '@/components/Icons';
import { toast } from '@/lib/toast';

interface Task {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  status: 'assigned' | 'unassigned';
  domain: string;
  createdAt: number;
}

export function TaskInbox() {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ items: Task[] }>({
    queryKey: ['home-feed'],
    queryFn: async () => {
      const res = await fetch('/api/home/feed');
      if (!res.ok) throw new Error('Failed to fetch feed');
      return res.json();
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await fetch('/api/home/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      if (!res.ok) throw new Error('Failed to claim task');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Task claimed successfully');
      queryClient.invalidateQueries({ queryKey: ['home-feed'] });
    },
    onError: () => {
      toast.error('Failed to claim task');
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        Error loading tasks. Please try again.
      </div>
    );
  }

  const tasks = data?.items || [];
  const myTasks = tasks.filter((t) => t.status === 'assigned');
  const availableTasks = tasks.filter((t) => t.status === 'unassigned');
  
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null;

  if (tasks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center pt-24">
        <ContextualEmptyState state="no-work" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-surface-canvas text-text-default">
      {/* Left Sidebar: Task List */}
      <div className="w-1/3 flex flex-col border-r border-border-soft bg-surface-card overflow-hidden shadow-sm z-10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-hairline bg-surface-card/50 backdrop-blur-sm sticky top-0">
          <h2 className="text-h3 font-semibold flex items-center gap-2">
            <Inbox className="w-5 h-5 text-emerald-500" />
            Your Inbox
          </h2>
          <span className="text-role-caption font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">
            {myTasks.length} Assigned
          </span>
        </div>
        
        <div className="flex-1 overflow-y-auto no-scrollbar pb-8">
          {myTasks.length > 0 && (
            <div className="mb-6">
              <div className="px-6 py-3 text-role-caption font-bold text-text-muted tracking-wider uppercase flex items-center gap-2 sticky top-0 bg-surface-card/95 backdrop-blur-sm z-10">
                <CheckCircle className="w-4 h-4" /> My Tasks
              </div>
              <div className="flex flex-col">
                {myTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`flex flex-col px-6 py-4 border-b border-border-hairline text-left transition-all duration-200 hover:bg-surface-sunken group ${
                      selectedTaskId === task.id ? 'bg-surface-sunken border-l-4 border-l-emerald-500' : 'border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-body font-medium text-text-default line-clamp-1 group-hover:text-emerald-600 transition-colors">
                        {task.title}
                      </span>
                      <span className="text-role-caption text-text-muted whitespace-nowrap ml-2 bg-surface-canvas px-2 py-0.5 rounded">
                        {task.domain}
                      </span>
                    </div>
                    <span className="text-role-caption text-text-soft line-clamp-2">
                      {task.subtitle}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {availableTasks.length > 0 && (
            <div>
              <div className="px-6 py-3 text-role-caption font-bold text-text-muted tracking-wider uppercase flex items-center gap-2 sticky top-0 bg-surface-card/95 backdrop-blur-sm z-10">
                <Zap className="w-4 h-4" /> Available for Claim
              </div>
              <div className="flex flex-col">
                {availableTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`flex flex-col px-6 py-4 border-b border-border-hairline text-left transition-all duration-200 hover:bg-surface-sunken group ${
                      selectedTaskId === task.id ? 'bg-surface-sunken border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-body font-medium text-text-default line-clamp-1 group-hover:text-blue-600 transition-colors">
                        {task.title}
                      </span>
                      <span className="text-role-caption text-text-muted whitespace-nowrap ml-2 bg-surface-canvas px-2 py-0.5 rounded">
                        {task.domain}
                      </span>
                    </div>
                    <span className="text-role-caption text-text-soft line-clamp-2">
                      {task.subtitle}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Content: Detail View */}
      <div className="w-2/3 flex flex-col bg-surface-canvas relative">
        {selectedTask ? (
          <div className="flex-1 overflow-y-auto animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="p-8 max-w-3xl mx-auto">
              <div className="flex items-center gap-3 mb-6">
                <span className={`px-3 py-1 rounded-full text-role-caption font-bold ${
                  selectedTask.status === 'assigned' 
                    ? 'bg-emerald-500/10 text-emerald-600' 
                    : 'bg-blue-500/10 text-blue-600'
                }`}>
                  {selectedTask.status.toUpperCase()}
                </span>
                <span className="text-role-caption text-text-soft flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(selectedTask.createdAt).toLocaleString()}
                </span>
              </div>
              
              <h1 className="text-h1 font-bold mb-4">{selectedTask.title}</h1>
              
              <div className="bg-surface-card rounded-xl p-6 border border-border-soft shadow-sm mb-8">
                <h3 className="text-h4 font-medium mb-2">Description</h3>
                <p className="text-body text-text-soft whitespace-pre-wrap leading-relaxed">
                  {selectedTask.subtitle || "No description provided."}
                </p>
              </div>

              {selectedTask.status === 'unassigned' && (
                <div className="flex justify-end border-t border-border-hairline pt-6">
                  <Button 
                    variant="brand" 
                    size="lg"
                    className="shadow-md hover:shadow-lg transition-shadow px-8 py-3 text-body font-semibold flex items-center gap-2"
                    onClick={() => claimMutation.mutate(selectedTask.id)}
                    disabled={claimMutation.isPending}
                  >
                    {claimMutation.isPending ? 'Claiming...' : 'Claim Task'}
                  </Button>
                </div>
              )}
              {selectedTask.status === 'assigned' && (
                <div className="flex justify-end border-t border-border-hairline pt-6">
                  <Button 
                    variant="brand" 
                    size="lg"
                    className="shadow-md hover:shadow-lg transition-shadow px-8 py-3 text-body font-semibold"
                    onClick={() => {
                      toast.success('Task marked as complete');
                      queryClient.invalidateQueries({ queryKey: ['home-feed'] });
                      setSelectedTaskId(null);
                    }}
                  >
                    Mark as Done
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 animate-in fade-in duration-500">
            <div className="w-24 h-24 rounded-full bg-surface-card border border-border-soft flex items-center justify-center mb-6 shadow-sm">
              <Inbox className="w-10 h-10 text-text-soft opacity-50" />
            </div>
            <h3 className="text-h3 font-semibold mb-2">Select a task</h3>
            <p className="text-body text-text-soft max-w-sm">
              Choose a task from the list on the left to view details and take action.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
