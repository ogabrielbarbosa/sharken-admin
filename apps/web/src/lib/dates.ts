/** Início do dia atual no horário de Brasília (UTC-3, sem horário de verão). */
export function startOfTodayBrazil(now = new Date()): Date {
  const local = new Date(now.getTime() - 3 * 3_600_000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + 3 * 3_600_000);
}

export const daysBetween = (from: Date | string, to: Date) => Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000);
