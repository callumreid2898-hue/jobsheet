import { Navigate, useParams } from 'react-router-dom';

export function AssignEngineerPage() {
  const { jobId } = useParams<{ jobId: string }>();
  return <Navigate to={`/manager/jobs/${jobId}`} replace />;
}
