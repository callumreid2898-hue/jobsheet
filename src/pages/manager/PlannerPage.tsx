import { useState } from 'react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { db } from '../../lib/db';
import { enqueueSync } from '../../offline/SyncQueue';
import { useJobs } from '../../hooks/useJobs';
import { useProfiles } from '../../hooks/useProfiles';
import { Spinner } from '../../components/ui/Spinner';
import { StatusPill } from '../../components/ui/StatusPill';
import type { Job } from '../../types';

// ─── Time slots ───────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 08 through 18

function formatHour(h: number) {
  return `${String(h).padStart(2, '0')}:00`;
}

function jobHour(job: Job): number {
  // scheduled_date is 'YYYY-MM-DD'; we don't have a time field, so
  // fall back to spreading jobs across slots using their index via caller.
  // If created_at has a time component, use that hour; otherwise return -1.
  try {
    const d = new Date(job.created_at);
    if (!isNaN(d.getTime())) {
      return d.getHours();
    }
  } catch {
    // ignore
  }
  return -1;
}

// ─── Draggable job card ───────────────────────────────────────────────────────

interface JobCardProps {
  job: Job;
}

function JobCard({ job }: JobCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
  });

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        zIndex: 50,
        opacity: isDragging ? 0.7 : 1,
      }
    : undefined;

  const jobTypeLabel: Record<string, string> = {
    reactive_callout: 'Reactive',
    ppm_service: 'PPM',
    install: 'Install',
    remedial_works: 'Remedial',
    survey: 'Survey',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="bg-white border border-slate-200 rounded-lg p-2 shadow-xs cursor-grab active:cursor-grabbing select-none"
    >
      <div className="text-xs font-medium text-slate-700 truncate mb-1" title={job.site_id}>
        {job.site_id.slice(0, 8)}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <StatusPill status={job.status} kind="job" />
        <span className="text-xs text-slate-500">
          {jobTypeLabel[job.type] ?? job.type}
        </span>
      </div>
    </div>
  );
}

// ─── Droppable column cell (engineer + hour slot) ────────────────────────────

interface DroppableCellProps {
  id: string;
  children?: React.ReactNode;
}

function DroppableCell({ id, children }: DroppableCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[56px] p-1 rounded transition-colors ${
        isOver ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-slate-50'
      }`}
    >
      {children}
    </div>
  );
}

// ─── Unassigned droppable column ─────────────────────────────────────────────

interface UnassignedColumnProps {
  jobs: Job[];
}

function UnassignedColumn({ jobs }: UnassignedColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unassigned' });

  return (
    <div className="flex-shrink-0 w-44">
      <div
        className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 py-2 border-b border-slate-200"
        style={{ minHeight: '40px' }}
      >
        Unassigned
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[500px] p-2 flex flex-col gap-2 rounded transition-colors ${
          isOver ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-white'
        }`}
      >
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
        {jobs.length === 0 && (
          <p className="text-xs text-slate-400 text-center pt-4">No unassigned jobs</p>
        )}
      </div>
    </div>
  );
}

// ─── Engineer timetable column ────────────────────────────────────────────────

interface EngineerColumnProps {
  engineerId: string;
  engineerName: string;
  jobs: Job[];
  viewMode: 'day' | 'week';
}

function EngineerColumn({ engineerId, engineerName, jobs, viewMode }: EngineerColumnProps) {
  // Map jobs to hour slots
  const slotMap = new Map<number, Job[]>();
  jobs.forEach((job, idx) => {
    const h = jobHour(job);
    // If no parseable hour, spread across slots from 08:00
    const slot = HOURS.includes(h) ? h : HOURS[idx % HOURS.length];
    const existing = slotMap.get(slot) ?? [];
    slotMap.set(slot, [...existing, job]);
  });

  return (
    <div className="flex-shrink-0 w-44">
      <div
        className="text-xs font-semibold text-slate-700 truncate px-1 py-2 border-b border-slate-200"
        style={{ minHeight: '40px' }}
        title={engineerName}
      >
        {engineerName}
      </div>
      <div className="flex flex-col gap-1 p-1">
        {viewMode === 'day' ? (
          HOURS.map((hour) => (
            <DroppableCell key={`${engineerId}-${hour}`} id={`${engineerId}::${hour}`}>
              {(slotMap.get(hour) ?? []).map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </DroppableCell>
          ))
        ) : (
          // Week view: just list all jobs in a single droppable zone
          <DroppableCell id={engineerId}>
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </DroppableCell>
        )}
      </div>
    </div>
  );
}

// ─── PlannerPage ──────────────────────────────────────────────────────────────

export function PlannerPage() {
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');

  const { jobs, isLoading: jobsLoading } = useJobs();
  const { profiles, isLoading: profilesLoading } = useProfiles({ role: 'engineer' });

  const isLoading = jobsLoading || profilesLoading;

  const unassignedJobs = jobs.filter((j) => j.assigned_engineer_id === null);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const jobId = active.id as string;
    const overId = over.id as string;

    // over.id may be 'unassigned', an engineerId, or 'engineerId::hour'
    const rawEngineerId = overId.includes('::') ? overId.split('::')[0] : overId;
    const engineerId = rawEngineerId === 'unassigned' ? null : rawEngineerId;

    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    if (job.assigned_engineer_id === engineerId) return;

    // Optimistic local write
    await db.jobs.update(jobId, { assigned_engineer_id: engineerId }).catch(() => {});

    // Enqueue for remote sync
    await enqueueSync({
      table: 'jobs',
      operation: 'upsert',
      payload: { ...job, assigned_engineer_id: engineerId } as Record<string, unknown>,
    });
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Planner</h1>
          <p className="text-sm text-slate-500 mt-0.5">Drag jobs to assign engineers</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('day')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'day'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'week'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Week
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <DndContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {/* Time labels column (day view only) */}
            {viewMode === 'day' && (
              <div className="flex-shrink-0 w-14">
                <div style={{ minHeight: '40px' }} className="border-b border-transparent" />
                <div className="flex flex-col gap-1 p-1">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="min-h-[56px] flex items-start pt-1"
                    >
                      <span className="text-xs text-slate-400 font-mono">
                        {formatHour(hour)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unassigned column */}
            <UnassignedColumn jobs={unassignedJobs} />

            {/* Divider */}
            <div className="w-px bg-slate-200 flex-shrink-0" />

            {/* Engineer columns */}
            {profiles.length === 0 ? (
              <div className="flex items-center px-6 text-sm text-slate-500">
                No engineers found
              </div>
            ) : (
              profiles.map((engineer) => {
                const engineerJobs = jobs.filter(
                  (j) => j.assigned_engineer_id === engineer.id
                );
                return (
                  <EngineerColumn
                    key={engineer.id}
                    engineerId={engineer.id}
                    engineerName={engineer.full_name}
                    jobs={engineerJobs}
                    viewMode={viewMode}
                  />
                );
              })
            )}
          </div>
        </DndContext>
      )}
    </div>
  );
}
