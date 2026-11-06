export type ScriptSlot = 'nome' | 'cidade' | 'tipo' | 'motivo';
export type ScriptSegment = { kind: 'fixed'; id: string; text: string } | { kind: 'slot'; slot: ScriptSlot };
export type ScriptVars = Record<ScriptSlot, string>;

const SLOTS: Record<string, ScriptSlot> = {
  '[nome do negócio]': 'nome',
  '[cidade]': 'cidade',
  '[tipo de negócio]': 'tipo',
  '[motivo]': 'motivo',
};

function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, '0');
}

export function parseScript(text: string): ScriptSegment[] {
  const segments: ScriptSegment[] = [];
  for (const part of text.split(/(\[[^\]]+\])/)) {
    if (part.startsWith('[')) {
      const slot = SLOTS[part];
      if (!slot) throw new Error(`Campo desconhecido no roteiro: ${part}`);
      segments.push({ kind: 'slot', slot });
    } else if (part.trim()) {
      const trimmed = part.trim();
      segments.push({ kind: 'fixed', id: hash(trimmed), text: trimmed });
    }
  }
  return segments;
}

export function findMissingRecordings(segments: ScriptSegment[], available: string[]) {
  return segments.filter((s): s is Extract<ScriptSegment, { kind: 'fixed' }> => s.kind === 'fixed' && !available.includes(s.id));
}

export function resolveSlotText(slot: ScriptSlot, vars: ScriptVars): string {
  return vars[slot];
}

export function renderScript(text: string, vars: ScriptVars): string {
  return text.replace(/\[[^\]]+\]/g, (field) => {
    const slot = SLOTS[field];
    if (!slot) throw new Error(`Campo desconhecido no roteiro: ${field}`);
    return vars[slot];
  });
}
