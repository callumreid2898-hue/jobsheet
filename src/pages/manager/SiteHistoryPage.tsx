import { Navigate, useParams } from 'react-router-dom';

export function SiteHistoryPage() {
  const { siteId } = useParams<{ siteId: string }>();
  return <Navigate to={`/manager/sites/${siteId}`} replace />;
}
