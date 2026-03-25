import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATEGORIES } from '../config/categories';
import { formatTime } from '../utils/formatTime';

export function CategorySelectScreen() {
  const navigate = useNavigate();
  const [highScores, setHighScores] = useState<Record<string, number>>({});
  const [bestTimes, setBestTimes] = useState<Record<string, number>>({});

  useEffect(() => {
    const scores: Record<string, number> = {};
    const times: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      const saved = localStorage.getItem(`game_highscore_${cat.id}`);
      scores[cat.id] = saved ? parseInt(saved, 10) || 0 : 0;
      const savedTime = localStorage.getItem(`game_besttime_${cat.id}`);
      if (savedTime) times[cat.id] = parseInt(savedTime, 10);
    }
    setHighScores(scores);
    setBestTimes(times);
  }, []);

  return (
    <div className="master-container" style={{ alignItems: 'center' }}>
      <header>
        <h1>Name It!</h1>
      </header>
      <div className="menu-card">
        <h2 className="game-title">Name It!</h2>
        <p className="category-subtitle">Choose a category to play</p>
        <div className="category-grid">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className="category-card"
              onClick={() => cat.id === 'lol-all' || cat.id === 'az-lol'
                ? navigate(`/${cat.id}`)
                : navigate(`/game/${cat.id}`)
              }
            >
              <span className="category-icon">{cat.icon}</span>
              <span className="category-name">{cat.name}</span>
              <span className="category-score">
                {bestTimes[cat.id]
                  ? `Best: ${formatTime(bestTimes[cat.id])}`
                  : `Best: ${highScores[cat.id] ?? 0}`}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
