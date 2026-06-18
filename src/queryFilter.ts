type Token =
    | { t: 'ident'; v: string }
    | { t: 'str';   v: string }
    | { t: 'num';   v: number }
    | { t: 'op';    v: string }
    | { t: 'and' | 'or' | 'lparen' | 'rparen' };

export type Expr =
    | { e: 'cond'; col: string; op: string; val: string | number }
    | { e: 'and'; l: Expr; r: Expr }
    | { e: 'or';  l: Expr; r: Expr };

function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < input.length) {
        while (i < input.length && input.charCodeAt(i) <= 32) i++;
        if (i >= input.length) break;
        const ch = input[i];

        if (ch === '"' || ch === "'" || ch === '`') {
            const q = ch; i++;
            let s = '';
            while (i < input.length && input[i] !== q) s += input[i++];
            if (i < input.length) i++;
            tokens.push({ t: 'str', v: s });
            continue;
        }

        if (input.startsWith('>=', i)) { tokens.push({ t: 'op', v: '>=' }); i += 2; continue; }
        if (input.startsWith('<=', i)) { tokens.push({ t: 'op', v: '<=' }); i += 2; continue; }
        if (input.startsWith('!=', i)) { tokens.push({ t: 'op', v: '!=' }); i += 2; continue; }
        if (ch === '=' || ch === '>' || ch === '<') { tokens.push({ t: 'op', v: ch }); i++; continue; }
        if (ch === '(') { tokens.push({ t: 'lparen' }); i++; continue; }
        if (ch === ')') { tokens.push({ t: 'rparen' }); i++; continue; }

        let w = '';
        while (i < input.length && input.charCodeAt(i) > 32 && !'=!<>()"\'`'.includes(input[i])) {
            w += input[i++];
        }
        if (!w) { i++; continue; }

        const up = w.toUpperCase();
        if (up === 'AND')        { tokens.push({ t: 'and' }); continue; }
        if (up === 'OR')         { tokens.push({ t: 'or'  }); continue; }
        if (up === 'CONTAINS')   { tokens.push({ t: 'op', v: 'contains'   }); continue; }
        if (up === 'STARTSWITH') { tokens.push({ t: 'op', v: 'startswith' }); continue; }
        if (up === 'ENDSWITH')   { tokens.push({ t: 'op', v: 'endswith'   }); continue; }
        if (/^-?\d+(\.\d+)?$/.test(w)) { tokens.push({ t: 'num', v: Number(w) }); continue; }
        tokens.push({ t: 'ident', v: w });
    }
    return tokens;
}

export function parseQuery(input: string): Expr {
    const toks = tokenize(input.trim());
    let pos = 0;
    const peek = () => toks[pos];
    const next = () => toks[pos++];

    function parseOr(): Expr {
        let l = parseAnd();
        while (peek()?.t === 'or') { next(); l = { e: 'or', l, r: parseAnd() }; }
        return l;
    }

    function parseAnd(): Expr {
        let l = parsePrimary();
        while (peek()?.t === 'and') { next(); l = { e: 'and', l, r: parsePrimary() }; }
        return l;
    }

    function parsePrimary(): Expr {
        if (peek()?.t === 'lparen') {
            next();
            const e = parseOr();
            if (peek()?.t !== 'rparen') throw new Error("対応する ')' がありません");
            next();
            return e;
        }

        const colTok = next();
        if (!colTok) throw new Error('列名が必要です');
        let col: string;
        if (colTok.t === 'ident' || colTok.t === 'str') col = (colTok as { t: string; v: string }).v;
        else throw new Error(`列名が見つかりません: ${JSON.stringify(colTok)}`);

        const opTok = next();
        if (!opTok || opTok.t !== 'op') throw new Error(`"${col}" の後に演算子が必要です`);
        const op = (opTok as { t: 'op'; v: string }).v;

        const valTok = next();
        if (!valTok) throw new Error('値が必要です');
        let val: string | number;
        if      (valTok.t === 'str')   val = (valTok as { t: 'str';   v: string }).v;
        else if (valTok.t === 'num')   val = (valTok as { t: 'num';   v: number }).v;
        else if (valTok.t === 'ident') val = (valTok as { t: 'ident'; v: string }).v;
        else throw new Error('値が必要です');

        return { e: 'cond', col, op, val };
    }

    const result = parseOr();
    if (pos < toks.length) throw new Error(`予期しないトークン: "${(toks[pos] as { v?: string }).v ?? toks[pos].t}"`);
    return result;
}

export function evalExpr(expr: Expr, row: string[], headers: string[]): boolean {
    if (expr.e === 'and') return evalExpr(expr.l, row, headers) && evalExpr(expr.r, row, headers);
    if (expr.e === 'or')  return evalExpr(expr.l, row, headers) || evalExpr(expr.r, row, headers);

    const ci = headers.findIndex(h => h.toLowerCase() === expr.col.toLowerCase());
    if (ci === -1) return false;
    const cell = row[ci] ?? '';
    const val  = expr.val;

    switch (expr.op) {
        case '=':          return cell === String(val);
        case '!=':         return cell !== String(val);
        case 'contains':   return cell.toLowerCase().includes(String(val).toLowerCase());
        case 'startswith': return cell.toLowerCase().startsWith(String(val).toLowerCase());
        case 'endswith':   return cell.toLowerCase().endsWith(String(val).toLowerCase());
        case '>':  { const n = Number(cell); return !isNaN(n) && n >  Number(val); }
        case '<':  { const n = Number(cell); return !isNaN(n) && n <  Number(val); }
        case '>=': { const n = Number(cell); return !isNaN(n) && n >= Number(val); }
        case '<=': { const n = Number(cell); return !isNaN(n) && n <= Number(val); }
    }
    return false;
}
