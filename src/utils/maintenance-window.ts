export function isInMaintenanceWindow(
  windows: { dayOfWeek: number; startHour: number; endHour: number }[],
  now = new Date(),
): boolean {
  if (!windows || windows.length === 0) return false;
  const day = now.getUTCDay();
  const hour = now.getUTCHours();
  return windows.some(
    (w) =>
      w.dayOfWeek === day && hour >= w.startHour && hour < w.endHour,
  );
}
