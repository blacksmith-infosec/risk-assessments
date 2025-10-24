import { BrowserRouter as Router, Route, Routes, NavLink } from 'react-router-dom';
import Home from './Home';
import PageNotFound from './NotFound';
import Questionnaire from './Questionnaire';
import DomainScanner from './DomainScanner';
import Report from './Report';
import ImportExport from './ImportExport';
import { AppStateProvider } from '../context/AppStateContext';
import '../styles.css';

const App = () => (
  <AppStateProvider>
    <Router>
      <nav>
        <NavLink to='/' end>Home</NavLink>
        <NavLink to='/questionnaire'>Questionnaire</NavLink>
        <NavLink to='/domain'>Domain Scan</NavLink>
        <NavLink to='/report'>Report</NavLink>
        <NavLink to='/data'>Import/Export</NavLink>
      </nav>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/questionnaire' element={<Questionnaire />} />
        <Route path='/domain' element={<DomainScanner />} />
        <Route path='/report' element={<Report />} />
        <Route path='/data' element={<ImportExport />} />
        <Route path='*' element={<PageNotFound />} />
      </Routes>
    </Router>
  </AppStateProvider>
);

export default App;
