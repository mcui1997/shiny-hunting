import { useStore } from '../lib/store';
import { PRIORITIES, type GoalRow } from '../lib/types';

/** Priority, hunting on/off and remove for one goal. */
export function GoalControls({ goal }: { goal: GoalRow }) {
  const store = useStore();
  const hunting = goal.status === 'hunting';
  return (
    <div className="goal-controls">
      <span className="small muted" style={{ fontWeight: 600 }}>Goal</span>
      <label className="sr-only" htmlFor={`prio-${goal.species}`}>Priority</label>
      <select id={`prio-${goal.species}`} className="select select--compact" value={goal.priority} onChange={(e) => store.saveGoal({ ...goal, priority: e.target.value })}>
        <option value="">No priority</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <button type="button" className={`btn btn--small${hunting ? ' btn--hunting' : ''}`} aria-pressed={hunting}
        onClick={() => store.saveGoal({ ...goal, status: hunting ? 'planned' : 'hunting' })}>
        {hunting ? 'Hunting' : 'Start hunting'}
      </button>
      <button type="button" className="btn btn--small btn--ghost" onClick={() => confirm(`Remove ${goal.species} from your goals?`) && store.deleteGoal(goal.species)}>Remove</button>
    </div>
  );
}
