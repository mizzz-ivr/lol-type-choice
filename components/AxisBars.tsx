import { AXIS_LABELS } from "@/config/axisDisplay";
import { AXIS_KEYS, type AxisScore } from "@/lib/types";

export function AxisBars({ scores }: { scores: AxisScore }) {
  return (
    <div className="grid gap-3">
      {AXIS_KEYS.map((axis) => (
        <div key={axis} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{AXIS_LABELS[axis]}</span>
            <span className="text-muted">{scores[axis]}</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-slate-700">
            <div className="h-full bg-accent" style={{ width: `${scores[axis]}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
