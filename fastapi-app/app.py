from contextlib import asynccontextmanager

import matlab.engine
from fastapi import FastAPI

matlab_engine = None

@asynccontextmanager
async def lifespan_func(app: FastAPI):
    global matlab_engine
    matlab_engine = matlab.engine.start_matlab()
    yield
    matlab_engine.quit()

app = FastAPI(lifespan=lifespan_func)

@app.get("/")
async def home():
    return "Hello World!"
