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
    for op in [r"\sum", r"\int", r"\frac"]:
        if expr.startswith(op):
            rest = expr[len(op) :].lstrip()
            break

    if rest == "":
        return extract_elementary_operation(latex_str)

    match op:
        case r"\sum":
            pattern = r"\\sum_\{([a-zA-Z])=(\d+)\}\^\{(\d+)\}\s*(.+)"
            match = re.match(pattern, latex_str)

            var, lower, upper, operand = match.groups()
            lower = int(lower)
            upper = int(upper)
            letter = var
            operand = operand.strip()

            remain = ""
            for op in [r"\sum", r"\int", r"\frac"]:
                if op in rest:
                    remain = expr[len(op) :].lstrip()
                    break

            if remain == "":
                return matlab_engine.sigma(var, lower, upper, operand)
            next_result = extract_outermost_special_operation(operand)
            if isinstance(next_result, list):
                next_result = next_result[-1]
            
            if next_result.is_integer():
                next_result = str(int(next_result))
            else:
                next_result = str(next_result)
            
            prefix = "\sum_{" + var + "=" + str(lower) + "}^{" + str(upper) + "}"
            intermediate = prefix + next_result

            if isinstance(next_result, list):
                intermediate = [next_result[0:len(next_result) - 1], intermediate]
            return [intermediate, matlab_engine.sigma(var, lower, upper, next_result)]

        case r"\int":
            pattern = r"\\int_\{(\d+)\}\^\{(\d+)\}\s*(.+)\\, d([a-zA-Z])"
            match = re.match(pattern, latex_str)
            if not match:
                return None
            lower, upper, operand, var = match.groups()
            lower = float(lower)
            upper = float(upper)
            letter = var
            operand = operand.strip()

            remain = ""
            for op in [r"\sum", r"\int", r"\frac"]:
                if op in rest:
                    remain = expr[len(op) :].lstrip()
                    break

            if remain == "":
                return matlab_engine.integralAB(lower, upper, operand, var)
            next_result = extract_outermost_special_operation(operand)
            if isinstance(next_result, list):
                next_result = next_result[-1]
            
            if next_result.is_integer():
                next_result = str(int(next_result))
            else:
                next_result = str(next_result)

            if lower.is_integer():
                lower = int(lower)
            if upper.is_integer():
                upper = int(upper)
            
            prefix = "\int_{" + str(lower) + "}^{" + str(upper) + "}"
            suffix = "\, d" + var
                
            intermediate = prefix + next_result + suffix

            if isinstance(next_result, list):
                intermediate = [next_result[0:len(next_result) - 1], intermediate]
            print(intermediate)
            return [intermediate, matlab_engine.integralAB(
                lower, upper, next_result, var
            )]

        case r"\frac":
            pattern = r"\\frac{(\d+)}{(\d+)}"
            match = re.match(pattern, latex_str)
            if not match:
                return None
            upper, lower = match.groups()
            return extract_outermost_special_operation(upper + "/" + lower)

        case _:
            return None


def extract_elementary_operation(latex_str: str) -> float:
    expr = latex_str.strip()

    # Helper: find top-level operator (not inside braces)
    def find_top_level(expr, ops):
        depth = 0
        for i, c in enumerate(expr):
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            elif depth == 0 and c in ops:
                return i, c
        return -1, None

    # Order of precedence: +-, */, ^
    for ops in ["+", "-", "*", "/", "^"]:
        idx, op = find_top_level(expr, ops)
        if idx != -1:
            left = expr[:idx].strip()
            right = expr[idx + 1 :].strip()
            chars = {"+", "-", "*", "/", "^"}
            if not any(c in left for c in chars):
                if not any(c in right for c in chars):
                    return operate(op, left, right)
                else:
                    return operate(op, left, extract_elementary_operation(right))
            if not any(c in right for c in chars):
                return operate(op, extract_elementary_operation(left), right)
            return operate(
                op,
                extract_elementary_operation(left),
                extract_elementary_operation(right),
            )

    return float(latex_str)


def parse_latex(latex_str: str):
    latex_str = re.sub(r"\\cdot", "*", latex_str)
    latex_str = re.sub(r"\\div", "/", latex_str)
    result = extract_outermost_special_operation(latex_str)
    return result


def operate(op: str, left: str, right: str):
    left = float(left)
    right = float(right)
    match op:
        case "+":
            return matlab_engine.su(left, right)
        case "-":
            return matlab_engine.sub(left, right)
        case "*":
            return matlab_engine.mul(left, right)
        case "/":
            return matlab_engine.div(left, right)
        case "^":
            return matlab_engine.pow(left, right)


@app.post("/evaluateLatex")
async def evaluate_latex(request: LatexExprRequest):
    result = parse_latex(request.latexExpression)
    if result is None:
        return {"result": "Failed to process"}
    else:
        return {"result": result}
