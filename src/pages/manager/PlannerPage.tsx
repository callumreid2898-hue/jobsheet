import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { db } from '../../lib/db';
import { enqueueSync } from '../../offline/SyncQueue';
import { useJobs } from '../../hooks/useJobs';
import { useProfiles } from '../../hooks/useProfiles';
import { useSites } from '../../hooks/useSites';
import { useCustomers } from '../../hooks/useCustomers';
import { Spinner } from '../../components/ui/Spinner';
import { StatusPill } from '../../components/ui/StatusPill';
import type { Job, Site, Customer } from '../../types';

// ─── Date helpers ──────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function weekMonday(d: Date): Date {
  const copy = new Date(d);
  const dow = copy.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function fmtShort(d: Date): string {
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()}`;
}

const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtFull(d: Date): string {
  return `${DAY_LONG[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Time slots ────────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 08–18

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

// ─── Job type styling ──────────────────────────────────────────────────────────

const JOB_TYPE_LABEL: Record<string, string> = {
  reactive_callout: 'Reactive',
  ppm_service: 'PPM',
  install: 'Install',
  remedial_works: 'Remedial',
  survey: 'Survey',
};

const JOB_TYPE_COLOR: Record<string, string> = {
  reactive_callout: 'bg-red-100 text-red-700',
  ppm_service: 'bg-blue-100 text-blue-700',
  install: 'bg-green-100 text-green-700',
  remedial_works: 'bg-orange-100 text-orange-700',
  survey: 'bg-purple-100 text-purple-700',
};

// ─── Draggable job card ────────────────────────────────────────────────────────

interface JobCardProps {
  job: Job;
  siteMap: Map<string, string>;
  customerMap: Map<string, string>; // site_id -> customer name
}

function JobCard({ job, siteMap, customerMap }: JobCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50, opacity: isDragging ? 0.7 : 1 }
    : undefined;

  const siteAddress = siteMap.get(job.site_id);
  const customerName = customerMap.get(job.site_id);
  const typeColor = JOB_TYPE_COLOR[job.type] ?? 'bg-slate-100 text-slate-600';
  const typeLabel = JOB_TYPE_LABEL[job.type] ?? job.type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="bg-white border border-slate-200 rounded-lg p-2 shadow-xs cursor-grab active:cursor-grabbing select-none"
    >
      {customerName && (
        <div className="text-xs font-semibold text-slate-800 truncate mb-0.5" title={customerName}>
          {customerName}
        </div>
      )}
      <div
        className="text-xs text-slate-500 truncate mb-1"
        title={siteAddress ?? job.site_id}
      >
        {siteAddress ?? job.site_id.slice(0, 8)}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${typeColor}`}>
          {typeLabel}
        </span>
        <StatusPill status={job.status} kind="job" />
      </div>
      {job.scheduled_time && (
        <div className="text-xs text-slate-400 mt-0.5">{job.scheduled_time}</div>
      )}
    </div>
  );
}

// ─── Droppable cell ────────────────────────────────────────────────────────────

interface DroppableCellProps {
  id: string;
  minHeight?: string;
  children?: React.ReactNode;
  onAdd?: () => void;
}

function DroppableCell({ id, minHeight = '56px', children, onAdd }: DroppableCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ minHeight }}
      className={`relative p-1 rounded transition-colors group ${
        isOver ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-slate-50'
      }`}
    >
      {children}
      {onAdd && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={onAdd}
          className="absolute top-0.5 right-0.5 w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-blue-500 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
          title="Add job here"
        >
          +
        </button>
      )}
    </div>
  );
}

// ─── Day view: Unassigned column ───────────────────────────────────────────────

interface UnassignedDayColumnProps {
  jobs: Job[];
  siteMap: Map<string, string>;
  customerMap: Map<string, string>;
  onAdd: () => void;
}

function UnassignedDayColumn({ jobs, siteMap, customerMap, onAdd }: UnassignedDayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unassigned' });

  return (
    <div className="flex-shrink-0 w-44">
      <div
        className="flex items-center justify-between px-1 py-2 border-b border-slate-200"
        style={{ minHeight: '40px' }}
      >
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Unassigned
        </span>
        <button
          onClick={onAdd}
          className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 text-sm leading-none"
          title="Add unassigned job"
        >
          +
        </button>
      </div>
      <div className="flex flex-col gap-1 p-1">
        <div
          ref={setNodeRef}
          className={`min-h-[640px] p-2 flex flex-col gap-2 rounded transition-colors ${
            isOver ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-white'
          }`}
        >
          {jobs.map(job => (
            <JobCard key={job.id} job={job} siteMap={siteMap} customerMap={customerMap} />
          ))}
          {jobs.length === 0 && (
            <p className="text-xs text-slate-400 text-center pt-4">No unassigned jobs</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Day view: Engineer column ─────────────────────────────────────────────────

interface EngineerDayColumnProps {
  engineerId: string;
  engineerName: string;
  jobs: Job[];
  siteMap: Map<string, string>;
  customerMap: Map<string, string>;
  onAdd: (hour?: number) => void;
}

function EngineerDayColumn({
  engineerId,
  engineerName,
  jobs,
  siteMap,
  customerMap,
  onAdd,
}: EngineerDayColumnProps) {
  // Split jobs into scheduled (have scheduled_time) and unscheduled
  const slotMap = new Map<number, Job[]>();
  const unscheduledJobs: Job[] = [];

  jobs.forEach(job => {
    if (job.scheduled_time) {
      const hour = parseInt(job.scheduled_time.split(':')[0], 10);
      const slot = HOURS.includes(hour) ? hour : null;
      if (slot !== null) {
        slotMap.set(slot, [...(slotMap.get(slot) ?? []), job]);
        return;
      }
    }
    unscheduledJobs.push(job);
  });

  return (
    <div className="flex-shrink-0 w-44">
      <div
        className="flex items-center justify-between px-1 py-2 border-b border-slate-200"
        style={{ minHeight: '40px' }}
      >
        <span
          className="text-xs font-semibold text-slate-700 truncate"
          title={engineerName}
        >
          {engineerName}
        </span>
        <button
          onClick={() => onAdd()}
          className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 text-sm leading-none flex-shrink-0"
          title={`Add job for ${engineerName}`}
        >
          +
        </button>
      </div>

      {/* Unscheduled pool at the top of each engineer column */}
      {unscheduledJobs.length > 0 && (
        <div className="px-1 pt-1 pb-0.5 flex flex-col gap-1">
          {unscheduledJobs.map(job => (
            <JobCard key={job.id} job={job} siteMap={siteMap} customerMap={customerMap} />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 p-1">
        {HOURS.map(hour => (
          <DroppableCell
            key={`${engineerId}-${hour}`}
            id={`${engineerId}::${hour}`}
            minHeight="56px"
            onAdd={() => onAdd(hour)}
          >
            {(slotMap.get(hour) ?? []).map(job => (
              <JobCard key={job.id} job={job} siteMap={siteMap} customerMap={customerMap} />
            ))}
          </DroppableCell>
        ))}
      </div>
    </div>
  );
}

// ─── Week view cell ────────────────────────────────────────────────────────────

interface WeekCellProps {
  dropId: string;
  jobs: Job[];
  siteMap: Map<string, string>;
  customerMap: Map<string, string>;
  onAdd: () => void;
}

function WeekCell({ dropId, jobs, siteMap, customerMap, onAdd }: WeekCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  return (
    <div
      ref={setNodeRef}
      className={`relative min-h-[72px] p-1 rounded border transition-colors flex flex-col gap-1 group ${
        isOver ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'bg-white border-slate-100'
      }`}
    >
      {jobs.map(job => (
        <JobCard key={job.id} job={job} siteMap={siteMap} customerMap={customerMap} />
      ))}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={onAdd}
        className="absolute top-0.5 right-0.5 w-5 h-5 rounded flex items-center justify-center text-slate-300 hover:text-blue-500 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
        title="Add job here"
      >
        +
      </button>
    </div>
  );
}

// ─── Week view ─────────────────────────────────────────────────────────────────

interface WeekViewProps {
  weekDays: Date[];
  jobs: Job[];
  engineers: { id: string; full_name: string }[];
  siteMap: Map<string, string>;
  customerMap: Map<string, string>;
  onAdd: (date: string, engineerId?: string) => void;
}

function WeekView({ weekDays, jobs, engineers, siteMap, customerMap, onAdd }: WeekViewProps) {
  const weekDayISOs = weekDays.map(toISO);

  const unassignedByDay = (dateISO: string) =>
    jobs.filter(j => j.assigned_engineer_id === null && j.scheduled_date === dateISO);

  const engineerDayJobs = (engineerId: string, dateISO: string) =>
    jobs.filter(j => j.assigned_engineer_id === engineerId && j.scheduled_date === dateISO);

  const COL_WIDTH = 'w-36';

  return (
    <div className="overflow-x-auto pb-4">
      <table className="border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="w-36 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-2 pr-2">
              Engineer
            </th>
            {weekDays.map(d => (
              <th
                key={toISO(d)}
                className={`${COL_WIDTH} text-center text-xs font-semibold text-slate-600 pb-2`}
              >
                {fmtShort(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Unassigned row */}
          <tr>
            <td className="text-xs font-medium text-slate-500 pr-2 align-top pt-1">Unassigned</td>
            {weekDayISOs.map(dateISO => (
              <td key={dateISO} className={`${COL_WIDTH} align-top`}>
                <WeekCell
                  dropId={`week::unassigned::${dateISO}`}
                  jobs={unassignedByDay(dateISO)}
                  siteMap={siteMap}
                  customerMap={customerMap}
                  onAdd={() => onAdd(dateISO)}
                />
              </td>
            ))}
          </tr>

          {/* Engineer rows */}
          {engineers.map(eng => (
            <tr key={eng.id}>
              <td
                className="text-xs font-medium text-slate-700 pr-2 align-top pt-1 truncate max-w-[9rem]"
                title={eng.full_name}
              >
                {eng.full_name}
              </td>
              {weekDayISOs.map(dateISO => (
                <td key={dateISO} className={`${COL_WIDTH} align-top`}>
                  <WeekCell
                    dropId={`week::${eng.id}::${dateISO}`}
                    jobs={engineerDayJobs(eng.id, dateISO)}
                    siteMap={siteMap}
                    customerMap={customerMap}
                    onAdd={() => onAdd(dateISO, eng.id)}
                  />
                </td>
              ))}
            </tr>
          ))}

          {engineers.length === 0 && (
            <tr>
              <td colSpan={8} className="text-sm text-slate-500 text-center py-8">
                No engineers found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── PlannerPage ───────────────────────────────────────────────────────────────

export function PlannerPage() {
  const navigate = useNavigate();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');

  const { jobs, isLoading: jobsLoading } = useJobs();
  const { profiles, isLoading: profilesLoading } = useProfiles({ role: 'engineer' });
  const { sites, isLoading: sitesLoading } = useSites();
  const { customers, isLoading: customersLoading } = useCustomers();

  const isLoading = jobsLoading || profilesLoading || sitesLoading || customersLoading;

  // site_id -> address
  const siteMap = useMemo(
    () => new Map<string, string>(sites.map((s: Site) => [s.id, s.address])),
    [sites]
  );

  // site_id -> customer name (via site.customer_id)
  const customerMap = useMemo(() => {
    const customerNameMap = new Map<string, string>(
      (customers as Customer[]).map(c => [c.id, c.name])
    );
    return new Map<string, string>(
      sites.map((s: Site) => [s.id, customerNameMap.get(s.customer_id) ?? ''])
    );
  }, [sites, customers]);

  // Week days (Mon–Sun)
  const weekDays = useMemo(() => {
    const monday = weekMonday(selectedDate);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [selectedDate]);

  const selectedDateISO = toISO(selectedDate);

  // Day view: unassigned = no engineer AND (on this date OR no date set)
  const dayUnassignedJobs = useMemo(
    () =>
      jobs.filter(
        j =>
          j.assigned_engineer_id === null &&
          (j.scheduled_date === selectedDateISO || !j.scheduled_date)
      ),
    [jobs, selectedDateISO]
  );

  const dayJobsForEngineer = (engineerId: string) =>
    jobs.filter(
      j => j.assigned_engineer_id === engineerId && j.scheduled_date === selectedDateISO
    );

  // Week view: jobs within Mon–Sun window
  const weekStartISO = toISO(weekDays[0]);
  const weekEndISO = toISO(weekDays[6]);
  const weekJobs = useMemo(
    () =>
      jobs.filter(
        j => j.scheduled_date >= weekStartISO && j.scheduled_date <= weekEndISO
      ),
    [jobs, weekStartISO, weekEndISO]
  );

  // ─── Drag-drop handler ──────────────────────────────────────────────────────

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const jobId = active.id as string;
    const overId = over.id as string;

    let engineerId: string | null = null;
    let newDate: string | null = null;
    let newTime: string | null = null;

    if (overId.startsWith('week::')) {
      const parts = overId.split('::');
      const rawEng = parts[1];
      engineerId = rawEng === 'unassigned' ? null : rawEng;
      newDate = parts[2] ?? null;
    } else {
      const rawEngineerId = overId.includes('::') ? overId.split('::')[0] : overId;
      engineerId = rawEngineerId === 'unassigned' ? null : rawEngineerId;
      newDate = selectedDateISO;
      // Extract hour from drop zone id (e.g. "eng-id::9")
      if (overId.includes('::')) {
        const hour = parseInt(overId.split('::')[1], 10);
        if (!isNaN(hour)) newTime = formatHour(hour);
      }
    }

    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    const unchanged =
      job.assigned_engineer_id === engineerId &&
      (newDate === null || job.scheduled_date === newDate) &&
      (newTime === null || job.scheduled_time === newTime);
    if (unchanged) return;

    const update: Partial<Job> = { assigned_engineer_id: engineerId };
    if (newDate) update.scheduled_date = newDate;
    if (newTime !== null) update.scheduled_time = newTime;

    await db.jobs.update(jobId, update).catch(() => {});
    await enqueueSync({
      table: 'jobs',
      operation: 'update',
      payload: { id: jobId, ...update } as Record<string, unknown>,
    });
  }

  // ─── Create job navigation ───────────────────────────────────────────────────

  function openCreateJob(options: { date: string; engineerId?: string; hour?: number }) {
    const params = new URLSearchParams({ date: options.date });
    if (options.engineerId) params.set('engineer', options.engineerId);
    if (options.hour !== undefined) params.set('time', formatHour(options.hour));
    navigate(`/manager/jobs/create?${params.toString()}`);
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────

  function prevDay() { setSelectedDate(d => addDays(d, -1)); }
  function nextDay() { setSelectedDate(d => addDays(d, 1)); }
  function prevWeek() { setSelectedDate(d => addDays(d, -7)); }
  function nextWeek() { setSelectedDate(d => addDays(d, 7)); }
  function goToday() { setSelectedDate(today); }

  const headerLabel =
    viewMode === 'day'
      ? fmtFull(selectedDate)
      : `Week of ${fmtFull(weekDays[0])}`;

  const onPrev = viewMode === 'day' ? prevDay : prevWeek;
  const onNext = viewMode === 'day' ? nextDay : nextWeek;

  return (
    <div className="p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Planner</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Drag jobs to assign engineers · hover cells for + to create
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
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
          {/* Quick add */}
          <button
            onClick={() => openCreateJob({ date: selectedDateISO })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <span className="text-base leading-none">+</span> New Job
          </button>
        </div>
      </div>

      {/* Date navigation bar */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onPrev}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
          aria-label="Previous"
        >
          &#9664;
        </button>
        <span className="text-sm font-semibold text-slate-700 min-w-[220px] text-center">
          {headerLabel}
        </span>
        <button
          onClick={onNext}
          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors"
          aria-label="Next"
        >
          &#9654;
        </button>
        <button
          onClick={goToday}
          className="ml-2 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          Today
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <DndContext onDragEnd={handleDragEnd}>
          {viewMode === 'day' ? (
            /* ── Day view ── */
            <div className="flex gap-4 overflow-x-auto pb-4">
              {/* Time labels */}
              <div className="flex-shrink-0 w-14">
                <div style={{ minHeight: '40px' }} className="border-b border-transparent" />
                <div className="flex flex-col gap-1 p-1">
                  {HOURS.map(hour => (
                    <div key={hour} className="min-h-[56px] flex items-start pt-1">
                      <span className="text-xs text-slate-400 font-mono">
                        {formatHour(hour)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unassigned column */}
              <UnassignedDayColumn
                jobs={dayUnassignedJobs}
                siteMap={siteMap}
                customerMap={customerMap}
                onAdd={() => openCreateJob({ date: selectedDateISO })}
              />

              {/* Divider */}
              <div className="w-px bg-slate-200 flex-shrink-0" />

              {/* Engineer columns */}
              {profiles.length === 0 ? (
                <div className="flex items-center px-6 text-sm text-slate-500">
                  No engineers found
                </div>
              ) : (
                profiles.map(engineer => (
                  <EngineerDayColumn
                    key={engineer.id}
                    engineerId={engineer.id}
                    engineerName={engineer.full_name}
                    jobs={dayJobsForEngineer(engineer.id)}
                    siteMap={siteMap}
                    customerMap={customerMap}
                    onAdd={(hour) =>
                      openCreateJob({ date: selectedDateISO, engineerId: engineer.id, hour })
                    }
                  />
                ))
              )}
            </div>
          ) : (
            /* ── Week view ── */
            <WeekView
              weekDays={weekDays}
              jobs={weekJobs}
              engineers={profiles}
              siteMap={siteMap}
              customerMap={customerMap}
              onAdd={(date, engineerId) => openCreateJob({ date, engineerId })}
            />
          )}
        </DndContext>
      )}
    </div>
  );
}
