import { useState } from 'react';
import LoginScreen    from './screens/LoginScreen.jsx';
import SessionScreen  from './screens/SessionScreen.jsx';
import ProgressScreen from './screens/ProgressScreen.jsx';

export default function App() {
  const [authToken, setAuthToken] = useState(null);
  const [screen,    setScreen]    = useState('session'); // 'session' | 'progress'

  if (!authToken) {
    return <LoginScreen onLogin={setAuthToken} />;
  }

  if (screen === 'progress') {
    return (
      <ProgressScreen
        authToken={authToken}
        onBack={() => setScreen('session')}
      />
    );
  }

  return (
    <SessionScreen
      authToken={authToken}
      onProgress={() => setScreen('progress')}
    />
  );
}
