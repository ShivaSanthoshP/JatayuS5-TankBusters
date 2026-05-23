/**
 * Minimal `cn` helper for shadcn-style components — joins truthy class
 * tokens with a space. No tailwind-merge here; intentionally tiny so we
 * aren't pulling in extra deps for this single pattern.
 */
export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  const push = (v: ClassValue) => {
    if (!v) return;
    if (Array.isArray(v)) v.forEach(push);
    else if (typeof v === 'string') out.push(v);
    else if (typeof v === 'number') out.push(String(v));
  };
  inputs.forEach(push);
  return out.join(' ');
}
