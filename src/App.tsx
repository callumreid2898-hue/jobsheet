// App.tsx — Router and auth wrapper.
// Fully implemented by Workstream E. This is the scaffold stub.
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<div className="p-8 text-center">Login — coming soon</div>} />
        <Route path="*" element={<div className="p-8 text-center">404</div>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
