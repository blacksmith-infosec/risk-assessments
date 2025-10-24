import { BrowserRouter as Router, Route, Routes, NavLink } from 'react-router-dom';
import Home from './Home';
import PageNotFound from './NotFound';
import Questionnaire from './Questionnaire';
import DomainScanner from './DomainScanner';
import Report from './Report';
import ImportExport from './ImportExport';
import { AppStateProvider } from '../context/AppStateContext';
import '../styles.css';


import { useEffect, useState } from 'react';

const App = () => {
  // Dark mode state and persistence
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  return (
    <AppStateProvider>
      <Router>
        <section className='app-panel panel'>
          <div className='toggle-row'>
            <button
              className='toggle-btn'
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setDarkMode((prev) => !prev)}
            >
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>
          <nav>
            <NavLink to='/' end>Home</NavLink>
            <NavLink to='/questionnaire'>Questionnaire</NavLink>
            <NavLink to='/domain'>Domain Scan</NavLink>
            <NavLink to='/report'>Report</NavLink>
            <NavLink to='/data'>Import</NavLink>
          </nav>
          <Routes>
            <Route path='/' element={<Home />} />
            <Route path='/questionnaire' element={<Questionnaire />} />
            <Route path='/domain' element={<DomainScanner />} />
            <Route path='/report' element={<Report />} />
            <Route path='/data' element={<ImportExport />} />
            <Route path='*' element={<PageNotFound />} />
          </Routes>
        </section>
      </Router>
    </AppStateProvider>
  );
};

export default App;
