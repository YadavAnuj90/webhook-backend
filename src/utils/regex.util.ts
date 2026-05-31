/**
 * Escapes special regex characters in a string so it can be safely used
 * inside `new RegExp()` without ReDoS risk from user-supplied input.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
