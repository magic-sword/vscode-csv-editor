export const TREE_PAGE = 50;

export type JsonPath   = (string | number)[];
export type ScalarNode = { kind: 'scalar'; vtype: string; display: string; raw: string };
export type ObjectNode = { kind: 'object'; entries: { key: string; preview: string; vtype: string }[]; total: number; shown: number };
export type ArrayNode  = { kind: 'array';  items:   { preview: string; vtype: string }[];              total: number; shown: number };
export type JsonNode   = ScalarNode | ObjectNode | ArrayNode;

export function valueType(v: unknown): string {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
}

export function previewValue(v: unknown): string {
    if (v === null) return 'null';
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    if (typeof v === 'string') {
        const s = v.length > 60 ? v.slice(0, 60) + '…' : v;
        return JSON.stringify(s);
    }
    if (Array.isArray(v)) return `[…${v.length} item${v.length !== 1 ? 's' : ''}]`;
    if (typeof v === 'object') {
        const n = Object.keys(v as object).length;
        return `{…${n} key${n !== 1 ? 's' : ''}}`;
    }
    return String(v);
}

export function summarizeNode(v: unknown, offset = 0): JsonNode {
    if (v === null)            return { kind: 'scalar', vtype: 'null',    display: 'null',    raw: 'null' };
    if (typeof v === 'boolean') { const s = String(v); return { kind: 'scalar', vtype: 'boolean', display: s, raw: s }; }
    if (typeof v === 'number')  { const s = String(v); return { kind: 'scalar', vtype: 'number',  display: s, raw: s }; }
    if (typeof v === 'string') {
        const display = v.length > 200 ? JSON.stringify(v.slice(0, 200) + '…') : JSON.stringify(v);
        return { kind: 'scalar', vtype: 'string', display, raw: v };
    }
    if (Array.isArray(v)) {
        const page = v.slice(offset, offset + TREE_PAGE);
        return { kind: 'array', items: page.map(item => ({ preview: previewValue(item), vtype: valueType(item) })), total: v.length, shown: offset + page.length };
    }
    const keys = Object.keys(v as object);
    const page = keys.slice(offset, offset + TREE_PAGE);
    return {
        kind: 'object',
        entries: page.map(k => ({ key: k, preview: previewValue((v as Record<string, unknown>)[k]), vtype: valueType((v as Record<string, unknown>)[k]) })),
        total: keys.length, shown: offset + page.length,
    };
}

export function getAtPath(root: unknown, path: JsonPath): unknown {
    let cur = root;
    for (const key of path) {
        if (cur === null || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string | number, unknown>)[key];
    }
    return cur;
}

export function setAtPath(root: unknown, path: JsonPath, newVal: unknown): void {
    if (path.length === 0) return;
    let cur = root as Record<string | number, unknown>;
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] as Record<string | number, unknown>;
    cur[path[path.length - 1]] = newVal;
}
