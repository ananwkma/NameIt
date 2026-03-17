import { useState, useRef, useEffect } from 'react';
import { WikidataService } from './services/wikidata';
import { Woman } from './types/wikidata';
import { Search, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import './App.css';

function App() {
  const [womenList, setWomenList] = useState<Woman[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    setError(null);
    setIsLoading(true);

    try {
      const woman = await WikidataService.searchWoman(inputValue);

      if (woman) {
        // Check for duplicates
        const isDuplicate = womenList.some((w) => w.id === woman.id);
        if (isDuplicate) {
          console.log(`[GAME] REJECTED: ${woman.name} is already in the list.`);
          setError('You already added her!');
        } else {
          console.log(`[GAME] ACCEPTED: ${woman.name} added to the list.`);
          setWomenList([woman, ...womenList]);
        }
      } else {
        console.log(`[GAME] FAILED: Could not find a valid famous woman for "${inputValue}".`);
        setError('Not found, too ambiguous, or not a famous woman.');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
      setInputValue(''); // Clear input regardless of result
      // Keep focus after submission
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>100 Women Game</h1>
        <div className="counter">
          <span>{womenList.length}</span> / 100
        </div>
      </header>

      <main>
        <form onSubmit={handleSubmit} className="input-group">
          <div className="input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type a famous woman's name..."
              disabled={isLoading || womenList.length >= 100}
            />
            {isLoading ? (
              <Loader2 className="icon loading-spinner" />
            ) : (
              <Search className="icon search-icon" />
            )}
          </div>
          <button type="submit" disabled={isLoading || womenList.length >= 100}>
            Add
          </button>
        </form>

        {error && (
          <div className="error-message">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <section className="women-list">
          {womenList.map((woman) => (
            <div key={woman.id} className="woman-card">
              <div className="woman-info">
                <h3>{woman.name}</h3>
                <p>{woman.description}</p>
              </div>
              <CheckCircle className="check-icon" />
            </div>
          ))}
        </section>
      </main>

      {womenList.length >= 100 && (
        <div className="victory-modal">
          <h2>Congratulations!</h2>
          <p>You've named 100 famous women!</p>
        </div>
      )}
    </div>
  );
}

export default App;
