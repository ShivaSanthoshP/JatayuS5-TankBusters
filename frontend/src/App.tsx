import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import Incidents from './pages/Incidents';
import IncidentDetail from './pages/IncidentDetail';
import Infrastructure from './pages/Infrastructure';
import DataSources from './pages/DataSources';
import Simulators from './pages/Simulators';
import Runbooks from './pages/Runbooks';
import RunbookDetail from './pages/RunbookDetail';
import Copilot from './pages/Copilot';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/workflow" element={<Pipeline />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/incidents/:id" element={<IncidentDetail />} />
          <Route path="/fleet" element={<Infrastructure />} />
          <Route path="/sources" element={<DataSources />} />
          <Route path="/simulation" element={<Simulators />} />
          <Route path="/runbooks" element={<Runbooks />} />
          <Route path="/runbooks/:id" element={<RunbookDetail />} />
          <Route path="/copilot" element={<Copilot />} />
          <Route path="/controls" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
