import { Routes, Route, Navigate } from 'react-router-dom';
import { CategorySelectScreen } from './components/CategorySelectScreen';
import { GameScreen } from './components/GameScreen';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<CategorySelectScreen />} />
      <Route path="/game/:categoryId" element={<GameScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
