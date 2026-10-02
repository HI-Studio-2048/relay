const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function hourLabel(hour: number) {
  if (hour === 0) return "12a";
  if (hour === 12) return "12p";
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

/** 7×24 grid of inbound messages: darker = busier. Server-rendered, no client JS. */
export function ActivityHeatmap({ grid, timezone }: { grid: number[][]; timezone: string }) {
  const max = Math.max(1, ...grid.flat());
  let best = { day: 0, hour: 0, count: 0 };
  grid.forEach((row, day) => row.forEach((count, hour) => (count > best.count ? (best = { day, hour, count }) : null)));
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] grid-cols-[32px_repeat(24,minmax(0,1fr))] gap-[3px] text-[10px] text-[#8b95a1]">
          <span />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="text-center">
              {hour % 3 === 0 ? hourLabel(hour) : ""}
            </span>
          ))}
          {grid.map((row, day) => (
            <div key={DAYS[day]} className="contents">
              <span className="self-center">{DAYS[day]}</span>
              {row.map((count, hour) => (
                <span
                  key={hour}
                  title={`${DAYS[day]} ${hourLabel(hour)}: ${count} message${count === 1 ? "" : "s"}`}
                  className="h-4 rounded-[3px] sm:h-5"
                  style={{ background: count ? `rgba(0, 132, 255, ${0.12 + 0.88 * (count / max)})` : "#f0f2f4" }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[12px] text-[#6b7280]">
        {best.count
          ? `Busiest: ${DAYS[best.day]} around ${hourLabel(best.hour)} (${timezone}). Schedule broadcasts near then, or use smart send time.`
          : "No messages in the last 4 weeks yet."}
      </p>
    </div>
  );
}
