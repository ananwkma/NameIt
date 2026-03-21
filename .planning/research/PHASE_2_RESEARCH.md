# Phase 2: Optimistic UI Queue - Research

**Researched:** 2026-03-19
**Domain:** React State Management / Async Processing / UI UX
**Confidence:** HIGH

## Summary

This phase focuses on transforming the game's input flow into an "Optimistic" model. Currently, the UI blocks during search. The new approach will immediately add a "pending" entry to the list, allowing the user to continue typing while a background queue processes the verification sequentially.

**Primary recommendation:** Use a custom hook or specialized state logic that manages a `pending` status for women entries, with a `useEffect`-based sequential processor to verify them one by one.

<user_constraints>
## User Constraints

### Locked Decisions
- User enters name -> Added to state immediately with 'status: pending' (30% opacity).
- Queue processor picks up 'pending' items one by one.
- On Success: Update to 'status: verified' (100% opacity).
- On Failure: Remove item from state.
- Integration with existing `WikidataService`.
- React/TS, Vite, Vanilla CSS.

### Claude's Discretion
- State interface design for `status` and `tempId`.
- Sequential processing implementation details (hook vs component logic).
- Timer mode (CLASSIC/SPEEDRUN) design.
- Persistence strategy details.

### Deferred Ideas (OUT OF SCOPE)
- Multi-threaded processing (Sequential required for race condition safety and duplicate avoidance).
- Complex undo/redo history.
</user_constraints>

## State Interface Changes

The `Woman` interface from `src/types/wikidata.ts` needs a wrapper or extension to track its lifecycle in the game state.

### `GameWoman` Interface
```typescript
export type WomanStatus = 'pending' | 'verified';

export interface GameWoman {
  // Fields from Wikidata (filled after verification)
  id: string;          // QID from Wikidata
  name: string;        // Official name
  description: string; // Description
  
  // Optimistic tracking fields
  status: WomanStatus;
  tempId: string;      // UUID or random string generated on input
  inputName: string;   // The name the user actually typed
}
```

### `GameState` Updates
```typescript
export interface GameState {
  status: GameStatus;
  mode: 'CLASSIC' | 'SPEEDRUN';
  women: GameWoman[];
  startTime: number | null;
  // ... rest of state
}
```

## Logic for Sequential Processing

Sequential processing is critical to avoid race conditions (like adding the same person twice if they are processed out of order) and to manage API rate limits/load.

### Sequential Processor Pattern
```typescript
// Inside a custom hook or App component
const [isProcessing, setIsProcessing] = useState(false);

useEffect(() => {
  // Find the first pending item
  // We process the oldest pending item first (FIFO)
  const nextPending = [...women].reverse().find(w => w.status === 'pending');
  
  if (nextPending && !isProcessing) {
    processVerification(nextPending);
  }
}, [women, isProcessing]);

const processVerification = async (item: GameWoman) => {
  setIsProcessing(true);
  try {
    const result = await WikidataService.searchWoman(item.inputName);
    
    if (result) {
      // Check for duplicates in verified list
      const isDuplicate = women.some(w => w.status === 'verified' && w.id === result.id);
      
      if (isDuplicate) {
        // Remove the redundant pending item
        removeWoman(item.tempId);
      } else {
        // Update item with verified data
        updateWoman(item.tempId, { ...result, status: 'verified' });
      }
    } else {
      // Search failed (not found or not a famous woman)
      removeWoman(item.tempId);
    }
  } catch (err) {
    // Technical error: possibly keep as pending or remove
    removeWoman(item.tempId);
  } finally {
    setIsProcessing(false);
  }
};
```

## Timer Mode Toggle (CLASSIC/SPEEDRUN)

| Mode | Timer Behavior | UI Focus |
|------|----------------|----------|
| **CLASSIC** | Count-up (MM:SS) | Relaxed, focus on descriptions. |
| **SPEEDRUN**| Count-up (MM:SS.mmm) | Precision, high-contrast timer, minimalist list. |

**State Design:**
- `gameMode`: `'CLASSIC' | 'SPEEDRUN'`
- `startTime`: `Date.now()` when the first woman is added.
- `endTime`: `Date.now()` when the 100th woman is verified.
- Persistence: Store the current `bestTime` for each mode in `localStorage`.

## Persistence Strategy

**Mechanism:** `localStorage` key `100_WOMEN_GAME_STATE`.

1. **Saving:** Sync state to `localStorage` on every change to the `women` array or `status`.
2. **Loading:** 
   - On app mount, check for saved state.
   - **Crucial:** If the saved state contains `pending` items, the sequential processor will naturally resume verification on load because the `useEffect` will trigger once the state is initialized.
3. **Draft Cleanup:** Optionally, if a session is older than X hours, clear pending items but keep verified ones.

## 100 Women Limit Logic

To maintain game integrity while allowing Optimistic UI:

1. **Input Limit:** `input` is disabled when `women.length >= 100` (Pending + Verified). 
   - *Why:* Prevents the user from flooding the queue and ensures every "slot" is intentional.
2. **Win Condition:** Game enters `VICTORY` state only when `women.filter(w => w.status === 'verified').length === 100`.
3. **Slot Recovery:** If a `pending` item fails verification and is removed, `women.length` decreases, automatically re-enabling the input for the user to try again.

## Common Pitfalls

### Pitfall 1: Double Submissions
**What goes wrong:** User hits enter twice rapidly.
**How to avoid:** Sequential processing naturally handles this, but the UI should also clear the input immediately after the first Enter keypress.

### Pitfall 2: Stale State in Async Closures
**What goes wrong:** `processVerification` references an old `women` array.
**How to avoid:** Always use functional updates: `setWomen(prev => prev.map(...))`.

### Pitfall 3: Duplicate IDs
**What goes wrong:** User types "Billie Eilish" and then "Eilish, Billie". They resolve to the same Wikidata QID.
**How to avoid:** The processor MUST check for `result.id` existence in the `verified` list before promoting a `pending` item.

## Code Examples

### CSS for Opacity (Vanilla CSS)
```css
.woman-card.pending {
  opacity: 0.3;
  border-style: dashed;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { border-color: #ccc; }
  50% { border-color: #666; }
  100% { border-color: #ccc; }
}

.woman-card.verified {
  opacity: 1;
  border-style: solid;
}
```

## Metadata
**Confidence breakdown:**
- Sequential Queue Logic: HIGH
- State Interface: HIGH
- Win Logic: MEDIUM (Needs user testing for feel)

**Research date:** 2026-03-19
**Valid until:** 2026-04-19
