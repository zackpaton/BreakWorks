'use client';

import { useState, KeyboardEvent, ChangeEvent, useRef, useEffect } from 'react';
import 'katex/dist/katex.min.css';
import katex from 'katex';
import 'computer-modern/index.css';

export default function Home() {
  const [equations, setEquations] = useState<string[]>([]);
  const [currentEquation, setCurrentEquation] = useState('');
  const [autoCompleteRanges, setAutoCompleteRanges] = useState<{
    start: number;
    end: number;
    type: string;
  }[]>([]); // Track autocompleted commands
  const inputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<(number | string | null)[]>([]);
  const [presentationMode, setPresentationMode] = useState(false);
  const [currentResult, setCurrentResult] = useState<string | number | null>(null);

  // When presentationMode changes, dispatch a custom event for layout.tsx
  useEffect(() => {
    const event = new CustomEvent('presentationModeToggle', { detail: { presentationMode } });
    window.dispatchEvent(event);
  }, [presentationMode]);

  // Helper to get the most recent result (even if not numeric)
  function getLastResult() {
    if (results.length === 0) return 0;
    // Use the last result in the history (third box)
    return results[results.length - 1] ?? 0;
  }

  // Helper to get the most recent numeric result (for ans variable)
  function getLastNumericResult() {
    for (let i = results.length - 1; i >= 0; i--) {
      const val = results[i];
      if (typeof val === 'number' && !isNaN(val)) return val;
      if (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val))) return Number(val);
    }
    return 0;
  }

  // Replace 'ans' and user variables with their assigned values for API calls
  function getEquationForApi() {
    let eq = currentEquation;
    const lastAns = getLastNumericResult();
    eq = eq.replace(/(?<![a-zA-Z0-9_])ans(?![a-zA-Z0-9_])/gi, String(lastAns));
    const assignments: Record<string, string> = {};
    for (let i = 0; i < equations.length; ++i) {
      const match = equations[i].match(/^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
      if (match) {
        const [, variable, value] = match;
        assignments[variable] = value.trim();
      }
    }
    const replaceVars = (expr: string, depth = 0): string => {
      if (depth > 10) return expr;
      let replaced = expr;
      for (const [variable, value] of Object.entries(assignments)) {
        if (variable.toLowerCase() !== 'ans') {
          const re = new RegExp(`(?<![a-zA-Z0-9_])${variable}(?![a-zA-Z0-9_])`, 'g');
          replaced = replaced.replace(re, value);
        }
      }
      // If any replacements were made, repeat to resolve chains
      if (replaced !== expr) return replaceVars(replaced, depth + 1);
      return replaced;
    };
    eq = replaceVars(eq);
    return eq;
  }

  // Evaluate current equation on every key press
  useEffect(() => {
    let ignore = false;
    async function fetchResult() {
      if (currentEquation.trim()) {
        const eqForApi = getEquationForApi();
        const result = await evaluateLatex(eqForApi);
        if (!ignore) setCurrentResult(result);
      } else {
        setCurrentResult(null);
      }
    }
    fetchResult();
    return () => { ignore = true; };
  }, [currentEquation, results]);

  // Helper to update ranges after text change
  function shiftRanges(
    ranges: { start: number; end: number; type: string }[],
    from: number,
    delta: number
  ) {
    return ranges.map((r) => {
      if (r.start >= from) {
        return { ...r, start: r.start + delta, end: r.end + delta };
      } else if (r.end >= from) {
        return { ...r, end: r.end + delta };
      }
      return r;
    });
  }

  const handleKeyPress = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && currentEquation.trim()) {
      setEquations((prev) => [...prev, currentEquation.trim()]);
      if (/^\s*[a-zA-Z][a-zA-Z0-9_]*\s*=\s*-?\d+(?:\.\d+)?\s*$/.test(currentEquation.trim())) {
        setResults((prev) => [...prev, '']);
      } else {
        // Evaluate with 'ans' and variables replaced for results history
        const eqForApi = getEquationForApi();
        const result = await evaluateLatex(eqForApi);
        setResults((prev) => [...prev, result]);
      }
      setCurrentEquation('');
      setAutoCompleteRanges([]);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const el = inputRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    // If input is empty and user types +, *, or -: prepend 'ans'
    if (currentEquation === '' && (e.key === '+' || e.key === '*' || e.key === '-')) {
      e.preventDefault();
      insertAtCursor('ans' + e.key, 4 + (e.key === '*' ? 1 : 0), undefined);
      return;
    }
    // If input is empty and user types /: insert \frac{ans}{} and place cursor in denominator
    if (currentEquation === '' && e.key === '/') {
      e.preventDefault();
      const frac = '\\frac{ans}{}';
      setCurrentEquation(frac);
      setAutoCompleteRanges([
        { start: 0, end: frac.length, type: 'frac' },
      ]);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(frac.length - 1, frac.length - 1);
      }, 0);
      return;
    }
    // Autocomplete for (, {, ^, _, \frac
    if (e.key === '(') {
      e.preventDefault();
      insertAtCursor('()', 1, 'paren');
    } else if (e.key === '{') {
      e.preventDefault();
      insertAtCursor('{}', 1, 'brace');
    } else if (e.key === '^') {
      e.preventDefault();
      insertAtCursor('^{}', 2, 'sup');
    } else if (e.key === '_') {
      e.preventDefault();
      insertAtCursor('_{}', 2, 'sub');
    } else if (e.key === '/') {
      e.preventDefault();
      const pos = el.selectionStart || 0;
      const val = currentEquation;
      const left = val.slice(0, pos);
      const latexOrOp = /(?:\\[a-zA-Z]+|[+\-*/^_(){}=, ])/g;
      let lastIndex = 0;
      let match;
      let m;
      while ((m = latexOrOp.exec(left)) !== null) {
        lastIndex = m.index + m[0].length;
      }
      const toMove = left.slice(lastIndex);
      if (toMove.length > 0) {
        const before = val.slice(0, lastIndex);
        const after = val.slice(pos);
        const frac = `\\frac{${toMove}}{}`;
        const newValue = before + frac + after;
        setCurrentEquation(newValue);
        setAutoCompleteRanges([
          ...shiftRanges(autoCompleteRanges, lastIndex, frac.length - toMove.length),
          {
            start: before.length,
            end: before.length + frac.length,
            type: 'frac',
          },
        ]);
        setTimeout(() => {
          el.focus();
          // Cursor inside denominator {}
          el.setSelectionRange(
            before.length + frac.length - 1,
            before.length + frac.length - 1
          );
        }, 0);
      } else {
        insertAtCursor('\\frac{}{}', 6, 'frac'); // cursor in first {}
      }
    } else if (e.key === '*') {
      e.preventDefault();
      insertAtCursor('\\cdot', 6, 'times'); // cursor after \times
    } else if (e.key === '\\') {
      setTimeout(() => {
        const val = el.value;
        const pos = el.selectionStart || 0;
        if (val.slice(pos - 5, pos) === '\\frac') {
          insertAtCursor('{}{}', 1, 'fracBraces');
        }
      }, 0);
    } else if (
      e.key === 'Backspace' &&
      selectionStart === selectionEnd
    ) {
      // Check if at end of an autocompleted command
      const pos = selectionStart || 0;
      const found = autoCompleteRanges.find((r) => r.end === pos);
      if (found) {
        e.preventDefault();
        const before = currentEquation.slice(0, found.start);
        const after = currentEquation.slice(found.end);
        setCurrentEquation(before + after);
        setAutoCompleteRanges(
          autoCompleteRanges
            .filter((r) => r !== found)
            .map((r) => {
              if (r.start > found.start) {
                return {
                  ...r,
                  start: r.start - (found.end - found.start),
                  end: r.end - (found.end - found.start),
                };
              }
              return r;
            })
        );
        setTimeout(() => {
          el.focus();
          el.setSelectionRange(found.start, found.start);
        }, 0);
        return;
      }
      if (currentEquation === '' && equations.length > 0) {
        e.preventDefault();
        const last = equations[equations.length - 1];
        setCurrentEquation(last);
        setEquations(equations.slice(0, -1));
        setAutoCompleteRanges([]);
      }
    }
  };

  function insertAtCursor(text: string, cursorOffset: number, type?: string) {
    const el = inputRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    const before = currentEquation.slice(0, selectionStart ?? 0);
    const after = currentEquation.slice(selectionEnd ?? 0);
    const newValue = before + text + after;
    setCurrentEquation(newValue);
    if (type) {
      setAutoCompleteRanges([
        ...shiftRanges(autoCompleteRanges, selectionStart ?? 0, text.length),
        { start: before.length, end: before.length + text.length, type },
      ]);
    }
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(
        (selectionStart ?? 0) + cursorOffset,
        (selectionStart ?? 0) + cursorOffset
      );
    }, 0);
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setCurrentEquation(e.target.value);
  };

  async function evaluateLatex(latex: string): Promise<number | string | null> {
  try {
    const response = await fetch('http://localhost:8000/evaluateLatex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latexExpression: latex }),
    });
    if (!response.ok) throw new Error('Network error');
    const data = await response.json();
    return data.result;
  } catch (e) {
    console.error(e);
    return 'Error';
  }
}

const inputHistoryRef = useRef<HTMLDivElement>(null);
  const previewHistoryRef = useRef<HTMLDivElement>(null);
  const resultHistoryRef = useRef<HTMLDivElement>(null);

  // Synchronize scroll positions
  const isSyncingRef = useRef({ input: false, preview: false, result: false });

  useEffect(() => {
    const handleInputScroll = () => {
      if (!inputHistoryRef.current || !previewHistoryRef.current || !resultHistoryRef.current) return;
      if (isSyncingRef.current.input) {
        isSyncingRef.current.input = false;
        return;
      }
      isSyncingRef.current.preview = true;
      isSyncingRef.current.result = true;
      previewHistoryRef.current.scrollTop = inputHistoryRef.current.scrollTop;
      resultHistoryRef.current.scrollTop = inputHistoryRef.current.scrollTop;
    };

    const handlePreviewScroll = () => {
      if (!inputHistoryRef.current || !previewHistoryRef.current || !resultHistoryRef.current) return;
      if (isSyncingRef.current.preview) {
        isSyncingRef.current.preview = false;
        return;
      }
      isSyncingRef.current.input = true;
      isSyncingRef.current.result = true;
      inputHistoryRef.current.scrollTop = previewHistoryRef.current.scrollTop;
      resultHistoryRef.current.scrollTop = previewHistoryRef.current.scrollTop;
    };

    const handleResultScroll = () => {
      if (!inputHistoryRef.current || !previewHistoryRef.current || !resultHistoryRef.current) return;
      if (isSyncingRef.current.result) {
        isSyncingRef.current.result = false;
        return;
      }
      isSyncingRef.current.input = true;
      isSyncingRef.current.preview = true;
      inputHistoryRef.current.scrollTop = resultHistoryRef.current.scrollTop;
      previewHistoryRef.current.scrollTop = resultHistoryRef.current.scrollTop;
    };

    const inputEl = inputHistoryRef.current;
    const previewEl = previewHistoryRef.current;
    const resultEl = resultHistoryRef.current;

    if (inputEl && previewEl && resultEl) {
      inputEl.addEventListener('scroll', handleInputScroll);
      previewEl.addEventListener('scroll', handlePreviewScroll);
      resultEl.addEventListener('scroll', handleResultScroll);
    }

    return () => {
      if (inputEl) inputEl.removeEventListener('scroll', handleInputScroll);
      if (previewEl) previewEl.removeEventListener('scroll', handlePreviewScroll);
      if (resultEl) resultEl.removeEventListener('scroll', handleResultScroll);
    };
  }, [presentationMode]);
  // Scroll both histories to bottom on new equation
  useEffect(() => {
    if (inputHistoryRef.current) {
      inputHistoryRef.current.scrollTop = inputHistoryRef.current.scrollHeight;
    }
    if (previewHistoryRef.current) {
      previewHistoryRef.current.scrollTop = previewHistoryRef.current.scrollHeight;
    }
  }, [equations]);

  return (
    <main className="flex-1 bg-background flex items-center justify-center relative">
      {/* Presentation Mode Toggle Button (always visible, fixed position) */}
      <button
        className="absolute top-5 left-3 px-6 py-2 rounded bg-background text-foreground font-bold z-50 border border-foreround cursor-pointer group"
        onClick={() => setPresentationMode((v) => !v)}
      >
        <div className="group-hover:scale-105">{presentationMode ? 'Exit Presentation' : 'Presentation Mode'}</div>
      </button>
      {presentationMode ? (
        <div className="flex flex-col gap-4 w-full max-w-3xl items-center">
          {equations.map((eq, i) => (
            <div>
            
            <div
              key={i}
              className="flex flex-row items-center justify-center gap-8 w-full"
              style={{ minHeight: '2.5em' }}
            >
              
              <span
                className="text-foreground text-l font-mono flex-1 text-center overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ minWidth: '250px', maxWidth: '350px' }}
                title={eq}
                dangerouslySetInnerHTML={{
                  __html: katex.renderToString(eq, { throwOnError: false }),
                }}
              />
              <span
                className="text-foreground font-bold flex-1 text-center ml-2 font-computer-modern"
                style={{ minWidth: '250px', maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {results[i] !== undefined && results[i] !== null ? String(results[i]) : ''}
              </span>
            </div>
            {i < equations.length - 1 && (
              <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-gray-400 to-transparent"></div>
            )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-8 max-h-[75vh] overflow-y-auto">
          {/* LaTeX Input + History */}
          <div className="bg-background rounded-lg shadow-lg p-6 min-w-[350px] flex flex-col items-stretch justify-center border border-foreground">
            <div
            ref={inputHistoryRef}
              className="w-full flex flex-col-reverse gap-2 mb-4"
            style={{ minHeight: '200px', maxHeight: '75vh', overflowY: 'auto' }}
          >
              {equations.slice().reverse().map((eq, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-background transition-all cursor-pointer"
                  onClick={() => {
                    setCurrentEquation(eq);
                    setAutoCompleteRanges([]);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                >
                  <span className="font-mono text-foreground text-l flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis" style={{ maxWidth: '320px', minWidth: '0' }}>{eq}</span>
                </div>
              ))}
            </div>
            <input
              ref={inputRef}
              type="text"
              value={currentEquation}
              onChange={handleChange}
              onKeyPress={handleKeyPress}
              onKeyDown={handleKeyDown}
              placeholder="Enter LaTeX..."
              className="w-full border border-foreground rounded-lg bg-background text-foreground focus:ring-2 focus:border-transparent font-mono placeholder-gray-400 text-l overflow-x-auto whitespace-nowrap px-3 py-2 flex items-center"
              style={{ maxWidth: '320px', minWidth: '0', minHeight: '2.5em', height: '2.5em', display: 'flex', alignItems: 'center' }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {/* KaTeX Display Box + History */}
          <div className="bg-background rounded-lg shadow-lg p-6 min-w-[350px] flex flex-col items-stretch justify-center border border-foreground">
            <div
            ref={previewHistoryRef}
              className="w-full flex flex-col-reverse gap-2 mb-4"
            style={{ minHeight: '200px', maxHeight: '75vh', overflowY: 'auto' }}
          >
              {equations.slice().reverse().map((eq, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-background transition-all cursor-pointer"
                  onClick={() => {
                    setCurrentEquation(eq);
                    setAutoCompleteRanges([]);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                >
                  <span
                    className="font-mono text-foreground text-l flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{ maxWidth: '320px', minWidth: '0' }}
                    dangerouslySetInnerHTML={{ __html: katex.renderToString(eq, { throwOnError: false }) }}
                  />
                </div>
              ))}
            </div>
            {/* Live KaTeX Preview */}
            <div
              className="text-foreground font-mono break-words text-l min-h-[2.5em] flex items-center border-t border-gray-200 pt-4 justify-start text-left pl-2 overflow-x-auto whitespace-nowrap"
              style={{ minHeight: '2.5em', minWidth: '250px', maxWidth: '320px' }}
            >
              <span
                dangerouslySetInnerHTML={{
                  __html: katex.renderToString(currentEquation, {
                    throwOnError: false,
                  }),
                }}
              />
            </div>
          </div>
          {/* BOX NUMBER 3 START */}
          <div className="bg-background rounded-lg shadow-lg p-6 min-w-[350px] flex flex-col items-stretch justify-center border border-foreground">
            <div
            ref={resultHistoryRef}
              className="w-full flex flex-col-reverse gap-2 mb-4"
            style={{ minHeight: '200px', maxHeight: '75vh', overflowY: 'auto' }}
          >
              {equations.slice().reverse().map((eq, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-background transition-all cursor-pointer"
                  onClick={() => {
                    setCurrentEquation(eq);
                    setAutoCompleteRanges([]);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                >
                  <span className="text-foreground font-bold ml-2">
                    {results.slice().reverse()[i] !== undefined ? String(results.slice().reverse()[i]) : ''}
                  </span>
                </div>
              ))}
            </div>
            <div
              className="text-foreground font-mono break-words text-l min-h-[2.5em] flex items-center border-t border-gray-200 pt-4 justify-start text-left pl-2 overflow-x-auto whitespace-nowrap"
              style={{ minHeight: '2.5em', minWidth: '250px', maxWidth: '320px' }}
            >
              <span className="text-foreground font-bold ml-2">
                {currentResult !== undefined && currentResult !== null && String(currentResult).toLowerCase() !== 'error' ? String(currentResult) : ''}
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}