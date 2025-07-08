'use client';

import { useState, KeyboardEvent, ChangeEvent, useRef } from 'react';
import 'katex/dist/katex.min.css';
import katex from 'katex';

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
    const result = await evaluateLatex(currentEquation.trim());
    setResults((prev) => [...prev, result]);
    setCurrentEquation('');
    setAutoCompleteRanges([]);
  }
};

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const el = inputRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
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
      // Smart fraction: if char to left is a number, move it into numerator
      const pos = el.selectionStart || 0;
      const val = currentEquation;
      const leftChar = val[pos - 1];
      if (leftChar && /[0-9]/.test(leftChar)) {
        // Remove the number to the left and insert \frac{num}{}
        const before = val.slice(0, pos - 1);
        const after = val.slice(pos);
        const frac = `\\frac{${leftChar}}{}`;
        const newValue = before + frac + after;
        setCurrentEquation(newValue);
        setAutoCompleteRanges([
          ...shiftRanges(autoCompleteRanges, pos - 1, frac.length - 1),
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
      insertAtCursor('\\', 6, 'times'); // cursor after \times
    } else if (e.key === '\\') {
      // Wait for possible frac
      setTimeout(() => {
        const val = el.value;
        const pos = el.selectionStart || 0;
        if (val.slice(pos - 5, pos) === '\\frac') {
          insertAtCursor('{}{}', 1, 'fracBraces');
        }
      }, 0);
    } else if (
      e.key === 'Backspace' &&
      selectionStart === selectionEnd // no selection
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
      // ...existing code for backspace restore...
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex gap-8">
        {/* LaTeX Input + History */}
        <div className="bg-background rounded-lg shadow-lg p-6 min-w-[350px] flex flex-col items-stretch justify-center border border-foreground">
          {/* History (bottom-up) */}
          <div className="w-full flex flex-col gap-2 mb-4 justify-end flex-1" style={{ minHeight: '200px' }}>
            {equations.map((eq, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-background transition-all cursor-pointer"
                onClick={() => {
                  setCurrentEquation(eq);
                  setAutoCompleteRanges([]);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
              >
                <span className="font-mono text-foreground text-l flex-1 text-left overflow-x-auto whitespace-nowrap" style={{ maxWidth: '320px', minWidth: '0' }}>{eq}</span>
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
            className="w-full border border-foreground rounded-lg bg-background text-foreground focus:ring-2 focus:border-transparent font-mono placeholder-gray-400 text-l overflow-x-auto whitespace-nowrap px-3 py-2 flex items-center" // reduced py-3 to py-2, added flex and items-center
            style={{ maxWidth: '320px', minWidth: '0', minHeight: '2.5em', height: '2.5em', display: 'flex', alignItems: 'center' }} // set minHeight and height to match KaTeX preview
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {/* KaTeX Display Box + History */}
        <div className="bg-background-50 rounded-lg shadow-lg p-6 min-w-[350px] flex flex-col items-stretch justify-center border border-foreground">
          {/* KaTeX History (bottom-up) */}
          <div className="w-full flex flex-col gap-2 mb-4 justify-end flex-1" style={{ minHeight: '200px' }}>
            {equations.map((eq, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-background transition-all cursor-pointer"
                onClick={() => {
                  setCurrentEquation(eq);
                  setAutoCompleteRanges([]);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
              >
                <span className="text-foreground text-l flex-1 text-left font-mono overflow-x-auto whitespace-nowrap" style={{ maxWidth: '320px', minWidth: '0' }} dangerouslySetInnerHTML={{ __html: katex.renderToString(eq, { throwOnError: false }) }} />
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
        <div className="bg-background-50 rounded-lg shadow-lg p-6 min-w-[350px] flex flex-col items-stretch justify-center border border-foreground">
          {/* KaTeX History (bottom-up) */}
          <div className="w-full flex flex-col gap-2 mb-4 justify-end flex-1" style={{ minHeight: '200px' }}>
            {equations.map((eq, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-background transition-all cursor-pointer"
                onClick={() => {
                  setCurrentEquation(eq);
                  setAutoCompleteRanges([]);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
              >
                <span className="text-foreground text-l flex-1 text-left font-mono overflow-x-auto whitespace-nowrap" style={{ maxWidth: '320px', minWidth: '0' }} dangerouslySetInnerHTML={{ __html: katex.renderToString(eq, { throwOnError: false }) }} />
                <span className="text-green-600 font-bold ml-2">
                  {results[i] !== undefined && results[i] !== null ? String(results[i]) : ''}
                </span>
              </div>
            ))}
          </div>
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
      </div>
    </div>
  );
}
