import { useNavigate } from 'react-router-dom';
import { useSites } from '../../hooks/useSites';
import { useCustomers } from '../../hooks/useCustomers';
import { useSystems } from '../../hooks/useSystems';
import { Spinner } from '../../components/ui/Spinner';
import { SiteCard } from '../../components/SiteCard';

export function SitesPage() {
  const navigate = useNavigate();
  const { sites, isLoading } = useSites();
  const { customers } = useCustomers();
  const { systems } = useSystems();
  const customerMap = new Map(customers.map(c => [c.id, c]));

  return (
    <div className="px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Sites</h1>
        <button onClick={() => navigate('/manager/sites/create')} className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl">+ New Site</button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <div className="space-y-3">
          {sites.map(site => {
            const customer = customerMap.get(site.customer_id);
            if (!customer) return null;
            const sysCount = systems.filter(s => s.site_id === site.id).length;
            return <SiteCard key={site.id} site={site} customer={customer} systemCount={sysCount} onClick={() => navigate(`/manager/sites/${site.id}/history`)} />;
          })}
        </div>
      )}
    </div>
  );
}
