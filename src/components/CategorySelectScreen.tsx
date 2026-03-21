import { CategoryConfig } from '../config/categories';

interface Props {
  categories: CategoryConfig[];
  highScores: Record<string, number>;  // { [categoryId]: bestScore }
  onSelect: (category: CategoryConfig) => void;
}

export function CategorySelectScreen({ categories, highScores, onSelect }: Props) {
  return (
    <div className="master-container" style={{ alignItems: 'center' }}>
      <header>
        <h1>Name It!</h1>
      </header>
      <div className="menu-card">
        <h2>Name It!</h2>
        <p className="category-subtitle">Choose a category to play</p>
        <div className="category-grid">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className="category-card"
              style={{ '--card-accent': cat.accentColor } as React.CSSProperties}
              onClick={() => onSelect(cat)}
            >
              <span className="category-icon">{cat.icon}</span>
              <span className="category-name">{cat.name}</span>
              <span className="category-score">
                Best: {highScores[cat.id] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
