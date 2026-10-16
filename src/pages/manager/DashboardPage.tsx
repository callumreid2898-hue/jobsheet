import { useNavigate } from 'react-router-dom';
import { Spinner } from '../../components/ui/Spinner';
import { useDashboardStats } from '../../hooks/useDashboardStats';

interface TileConfig {
  dataTile: string;
  label: string;
  count: number;
  href: string;
  color: string;
}

function StatTile({ dataTile, label, count, href, color, isLoading }: TileConfig & { isLoading: boolean }) {
  const navigate = useNavigate();

  return (
    <div
      data-tile={dataTile}
      onClick={() => navigate(href)}
      className="bg-white shadow-sm rounded-xl cursor-pointer hover:shadow-md transition-shadow"
      style={{ padding: '20px' }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(href); }}
    >
      {isLoading ? (
        <div className="flex justify-center items-center h-12">
          <Spinner size="sm" />
        </div>
      ) : (
        <>
          <div
            className="text-2xl font-bold leading-none mb-1"
            style={{ color }}
          >
            {count}
          </div>
          <div className="text-xs text-slate-500 mt-1 leading-tight">{label}</div>
        </>
      )}
    </div>
  );
}

export function DashboardPage() {
  const stats = useDashboardStats();

  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const tiles: TileConfig[] = [
    {
      dataTile: 'unassigned-jobs',
      label: 'Unassigned Jobs',
      count: stats.unassignedJobs,
      href: '/manager/jobs?status=unassigned',
      color: '#94A3B8',
    },
    {
      dataTile: 'scheduled-today',
      label: 'Scheduled Today',
      count: stats.scheduledToday,
      href: '/manager/planner',
      color: '#3B82F6',
    },
    {
      dataTile: 'awaiting-review',
      label: 'Awaiting Review',
      count: stats.awaitingReview,
      href: '/manager/jobs?status=awaiting_review',
      color: '#F97316',
    },
    {
      dataTile: 'open-remedials',
      label: 'Open Remedials',
      count: stats.openRemedials,
      href: '/manager/remedials',
      color: '#EF4444',
    },
    {
      dataTile: 'urgent-remedials',
      label: 'Urgent Remedials',
      count: stats.urgentRemedials,
      href: '/manager/remedials?priority=urgent',
      color: '#DC2626',
    },
    {
      dataTile: 'active-contracts',
      label: 'Active Contracts',
      count: stats.activeContracts,
      href: '/manager/contracts',
      color: '#10B981',
    },
    {
      dataTile: 'overdue-invoices',
      label: 'Overdue Invoices',
      count: stats.overdueInvoices,
      href: '/manager/invoices?status=overdue',
      color: '#EF4444',
    },
    {
      dataTile: 'draft-invoices',
      label: 'Draft Invoices',
      count: stats.draftInvoices,
      href: '/manager/invoices?status=draft',
      color: '#94A3B8',
    },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">{todayLabel}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tiles.map((tile) => (
          <StatTile
            key={tile.dataTile}
            {...tile}
            isLoading={stats.isLoading}
          />
        ))}
      </div>
    </div>
  );
}
