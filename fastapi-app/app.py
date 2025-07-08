import logging
import re

from contextlib import asynccontextmanager

import matlab.engine

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

class LatexExprRequest(BaseModel):
    latexExpression: str

logger = logging.getLogger("uvicorn.error")
matlab_engine = None

@asynccontextmanager
async def lifespan_func(app: FastAPI):
    global matlab_engine
    logger.info("Waiting for MATLAB engine startup.")
    matlab_engine = matlab.engine.start_matlab()
    logger.info("MATLAB Engine ready.")
    yield
    logger.info("Waiting for MATLAB engine shutdown.")
    matlab_engine.quit()
    logger.info("MATLAB engine shut down.")

app = FastAPI(lifespan=lifespan_func)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def extract_outermost_special_operation(latex_str):
    expr = latex_str.strip()
    # List of operations to check, in order of likely appearance
    rest = ""
    for op in [r'\sum', r'\int', r'\frac']:
        if expr.startswith(op):            
            rest = expr[len(op):].lstrip()
            break
    
    if rest == "":
        return extract_elementary_operation(latex_str)
    
    match op:
        case r'\sum':
            pattern = r'\\sum_\{([a-zA-Z])=(\d+)\}\^\{(\d+)\}\s*(.+)'
            match = re.match(pattern, latex_str)
            if not match:
                return None
            var, lower, upper, operand = match.groups()
            lower = int(lower)
            right = int(right)
            letter = var
            operand = operand.strip()

            operand = extract_outermost_special_operation(operand)
            return matlab_engine.sigma            
                
        case r'\int':
            pattern = r'\\int_\{(\d+)\}\^\{(\d+)\}\s*(.+)\\, d([a-zA-Z])'
            match = re.match(pattern, latex_str)
            if not match:
                return None
            var, lower, upper, operand = match.groups()
            lower = int(lower)
            right = int(right)
            letter = var
            operand = operand.strip() 

            operand = extract_outermost_special_operation(operand)

        case r'\frac':
            for i, c in enumerate(rest):
                if c == '}':
                    left = rest[1:i]
                    right = rest[i + 1:]

            latex_str = "(" + left + ")" + "/" + "(" + right + ")"
            return extract_outermost_special_operation(latex_str)

def extract_elementary_operation(latex_str: str):
    expr = latex_str.strip()

    # Helper: find top-level operator (not inside braces)
    def find_top_level(expr, ops):
        depth = 0
        for i, c in enumerate(expr):
            if c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            elif depth == 0 and c in ops:
                return i, c
        return -1, None

    # Order of precedence: +-, */, ^
    for ops in ['+', '-', '*', '/', '^']:
        idx, op = find_top_level(expr, ops)
        if idx != -1:
            left = expr[:idx].strip()
            right = expr[idx+1:].strip()
            chars = {'+', '-', '*', '/', '^'}
            if not any(c in left for c in chars):
                if not any(c in right for c in chars):
                    return operate(op, left, right)
                else:
                    return operate(op, left, extract_elementary_operation(right))
            if not any(c in right for c in chars):
                return operate(op, extract_elementary_operation(left), right)
            return operate(op, extract_elementary_operation(left), extract_elementary_operation(right))
            
    return float(latex_str)

def parse_latex(latex_str: str):
    latex_str = re.sub("\cdot", '*', latex_str)
    result = extract_elementary_operation(latex_str)
    return result

def operate(op: str, left: str, right: str):
    left = float(left)
    right = float(right)
    match op:
        case '+':
            return matlab_engine.su(left, right)
        case '-':
            return matlab_engine.sub(left, right)
        case '*':
            return matlab_engine.mul(left, right)
        case '/':
            return matlab_engine.div(left, right)
        case '^':
            return matlab_engine.pow(left, right)

@app.post("/evaluateLatex")
async def evaluate_latex(request: LatexExprRequest):
    return { "result": parse_latex(request.latexExpression) }
