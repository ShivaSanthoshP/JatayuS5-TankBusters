import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import Incidents from './pages/Incidents';
import Infrastructure from './pages/Infrastructure';
import DataSources from './pages/DataSources';
import Simulators from './pages/Simulators';
import Runbooks from './pages/Runbooks';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/infrastructure" element={<Infrastructure />} />
          <Route path="/datasources" element={<DataSources />} />
          <Route path="/simulators" element={<Simulators />} />
          <Route path="/runbooks" element={<Runbooks />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
