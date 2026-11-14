import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {GlassBackgroundSystem} from './backgrounds/GlassBackgroundSystem.tsx';
import {GuidedOnboarding} from './onboarding/GuidedOnboarding.tsx';

createRoot(document.getElementById('root')!).render(
  <>
    <GlassBackgroundSystem />
    <App />
    <GuidedOnboarding />
  </>,
);
