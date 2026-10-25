import { useStore } from '../lib/store';
import { PRIORITIES, PRIORITY_LABEL, type GoalRow } from '../lib/types';

/** Which tier a goal is in (Hunting / S / A / B), and remove. */
export function GoalControls({ goal }: { goal: GoalRow }) {
  const store = useStore();
  return (
    <div className="goal-controls">
      <span className="small muted" style={{ fontWeight: 600 }}>Goal</span>
      <label className="sr-only" htmlFor={`prio-${goal.species}`}>Tier</label>
      <select id={`prio-${goal.species}`} className="select select--compact" value={goal.priority} onChange={(e) => store.saveGoal({ ...goal, priority: e.target.value })}>
        {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
      </select>
      <button type="button" className="btn btn--small btn--ghost" onClick={() => confirm(`Remove ${goal.species} from your goals?`) && store.deleteGoal(goal.species)}>Remove</button>
    </div>
  );
}
