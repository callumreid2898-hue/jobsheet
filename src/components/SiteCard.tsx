import type { Site, Customer } from '../types';

interface Props { site: Site; customer: Customer; systemCount: number; onClick?: () => void; }

export function SiteCard({ site, customer, systemCount, onClick }: Props) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm cursor-pointer active:bg-gray-50" onClick={onClick}>
      <p className="font-semibold text-gray-900 text-sm mb-1">{site.address}</p>
      <p className="text-xs text-gray-500">{customer.name}</p>
      <p className="text-xs text-gray-400 mt-1">{systemCount} system{systemCount !== 1 ? 's' : ''}</p>
    </div>
  );
}
