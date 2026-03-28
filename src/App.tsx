import { Routes, Route, Navigate } from 'react-router-dom';
import { CategorySelectScreen } from './components/CategorySelectScreen';
import { GameScreen } from './components/GameScreen';
import { AZGameScreen } from './components/AZGameScreen';
import { LoLAllScreen } from './components/LoLAllScreen';
import { StatesAllScreen } from './components/StatesAllScreen';
import { PokemonAllScreen } from './components/PokemonAllScreen';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<CategorySelectScreen />} />
      <Route path="/az-lol" element={<AZGameScreen />} />
      <Route path="/lol-all" element={<LoLAllScreen />} />
      <Route path="/states-all" element={<StatesAllScreen />} />
      <Route path="/pokemon-gen1-all" element={<PokemonAllScreen />} />
      <Route path="/game/:categoryId" element={<GameScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
