# Phase 2: Optimistic UI & Timer System - Research

**Researched:** 2025-03-24
**Domain:** React State Management, Async Queue Processing, Game Timers
**Confidence:** HIGH

## Summary

This research establishes the architecture for an optimistic verification system and a robust timer system for the 100 Women Game. The core challenge is maintaining a responsive UI while processing slow external API calls (Wikidata) sequentially.

**Primary recommendation:** Use a `useReducer` for centralized game state management and a custom `useVerificationQueue` hook that orchestrates the sequential processing of "pending" entries.

## User Constraints

### Locked Decisions
- **Verification Queue:** Sequential processing is mandatory.
- **Visuals:** Pending entries at 30% opacity, verified at 100%.
- **Timer Modes:** 15m Countdown and Speedrun Stopwatch.
- **Persistence:** `localStorage` must handle refreshes.
- **Tech:** React `useEffect` or custom hook for processor; integrate with `WikidataService`.

### Claude's Discretion
- State architecture (useReducer vs useState) - *Recommendation: useReducer for game state.*
- Queue processing logic - *Recommendation: FIFO array with a processing pointer.*
- Timer precision - *Recommendation: 100ms interval for stopwatch accuracy.*

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x | UI Framework | Current project standard. |
| Lucide React | ^0.577.0 | Icons | Used for status indicators (Pending/Success/Error). |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Framer Motion | ^12.x | Animations | For smooth opacity transitions and list reordering. |

## Architecture Patterns

### Recommended State Structure
The `womenList` should be upgraded to handle status:

```typescript
type VerificationStatus = 'pending' | 'verified' | 'failed';

interface GameWoman extends Woman {
  status: VerificationStatus;
  tempId: string; // Used for keying before Wikidata ID is known
}
```

### Pattern 1: Sequential FIFO Queue
**What:** A queue system where inputs are added to a "Pending" list immediately, and a background worker processes them one by one.
**Example:**
```typescript
const [queue, setQueue] = useState<string[]>([]);
const [isProcessing, setIsProcessing] = useState(false);

useEffect(() => {
  if (queue.length > 0 && !isProcessing) {
    processNext(queue[0]);
  }
}, [queue, isProcessing]);
```

### Anti-Patterns to Avoid
- **Parallel Requests:** Don't fire all Wikidata searches at once; it risks rate limiting and creates UI jitter if results return out of order.
- **Global `isLoading`:** Don't block the whole UI. Only the specific item should show "loading" state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Precision Timers | Custom `Date.now()` logic | `performance.now()` | Better sub-millisecond precision for speedruns. |
| Storage Sync | Manual `JSON.stringify` | Custom `useLocalStorage` hook | Handles serialization and event syncing across tabs. |

## Common Pitfalls

### Pitfall 1: Race Conditions on Rapid Input
**What goes wrong:** User types "Marie Curie" then "Ada Lovelace" quickly.
**Prevention:** The queue must use a `tempId` (UUID or Timestamp) to track the specific entry in the list before the Wikidata ID is resolved.

### Pitfall 2: Timer Drift
**What goes wrong:** `setInterval` is not guaranteed to run exactly on time.
**Prevention:** Always calculate time based on `startTime` vs `currentTime`, rather than incrementing a counter.

## Code Examples

### Optimistic Queue Processing
```typescript
// Hook-based processor
function useVerificationQueue(dispatch: React.Dispatch<GameAction>) {
  useEffect(() => {
    const item = state.women.find(w => w.status === 'pending');
    if (!item || state.isProcessing) return;

    const process = async () => {
      dispatch({ type: 'SET_PROCESSING', payload: true });
      const result = await WikidataService.searchWoman(item.inputName);
      if (result) {
        dispatch({ type: 'VERIFY_SUCCESS', payload: { tempId: item.tempId, data: result } });
      } else {
        dispatch({ type: 'VERIFY_FAIL', payload: item.tempId });
      }
    };
    process();
  }, [state.women, state.isProcessing]);
}
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `useState` per component | `useReducer` or `Zustand` | Cleaner state transitions for complex games. |
| `setInterval(1000)` | `requestAnimationFrame` | Smoother UI updates for sub-second timers. |

## Sources

### Primary (HIGH confidence)
- React Documentation (Hooks and State)
- Wikidata API Documentation (Sequential request guidelines)

### Secondary (MEDIUM confidence)
- MDN: `localStorage` and `performance.now()`
- Framer Motion documentation for Layout Animations

## Metadata
**Confidence breakdown:**
- Standard stack: HIGH
- Architecture: HIGH
- Pitfalls: HIGH

**Research date:** 2025-03-24
**Valid until:** 2025-04-24
