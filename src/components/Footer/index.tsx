import React from 'react';
import { TrackedLink } from '../TrackedLink';

const Footer: React.FC = () => (
  <footer className='app-footer'>
    <div className='footer-content'>
      <div className='footer-text'>
        Built with ❤️ by{' '}
        <TrackedLink
          href='https://blacksmithinfosec.com/?utm_source=risk-assessment-tool'
          target='_blank'
          rel='noopener noreferrer'
        >
          Blacksmith InfoSec
        </TrackedLink>
        . This tool is free to use and{' '}
        <TrackedLink
          href='https://github.com/blacksmithinfosec/risk-assessments'
          target='_blank'
          rel='noopener noreferrer'
        >
          open source
        </TrackedLink>
        . Have a suggestion or found a bug?{' '}
        <TrackedLink
          href='https://github.com/blacksmithinfosec/risk-assessments/issues'
          target='_blank'
          rel='noopener noreferrer'
        >
          Let us know
        </TrackedLink>
        !
      </div>
      <TrackedLink
        href='https://blacksmithinfosec.com/?utm_source=risk-assessment-tool'
        target='_blank'
        rel='noopener noreferrer'
        className='footer-logo-link'
      >
        <img
          alt='Blacksmith InfoSec'
          src='https://assets.blacksmithinfosec.com/images/logos/icon/Bright_Blue.jpg'
          className='footer-logo'
        />
      </TrackedLink>
    </div>
  </footer>
);

export default Footer;
