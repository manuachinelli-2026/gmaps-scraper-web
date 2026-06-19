import asyncio
import io
import json
import logging
import threading
import uuid
from typing import Dict, Any

import pandas as pd
from dataclasses import asdict
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from scraper import scrape_places

logging.basicConfig(level=logging.INFO)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs: Dict[str, Any] = {}


class ScrapeRequest(BaseModel):
    search: str
    total: int = 20
    skip: int = 0


def run_scrape_job(job_id: str, search: str, total: int, skip: int = 0):
    def on_progress(current: int, total_count: int, name: str):
        jobs[job_id].update({
            "progress": current,
            "total": total_count,
            "current_name": name,
        })

    try:
        places = scrape_places(search, total, skip=skip, on_progress=on_progress)
        jobs[job_id].update({
            "status": "done",
            "places": [asdict(p) for p in places],
            "progress": jobs[job_id].get("total", total),
        })
        logging.info(f"Job {job_id} done: {len(places)} places")
    except Exception as e:
        logging.error(f"Job {job_id} failed: {e}")
        jobs[job_id].update({"status": "error", "error": str(e)})


@app.post("/api/scrape")
async def start_scrape(request: ScrapeRequest):
    if request.total < 1 or request.total > 100:
        raise HTTPException(status_code=400, detail="total must be between 1 and 100")

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "running",
        "progress": 0,
        "total": request.total,
        "current_name": "Buscando resultados...",
        "places": [],
        "error": None,
    }

    thread = threading.Thread(target=run_scrape_job, args=(job_id, request.search, request.total, request.skip), daemon=True)
    thread.start()

    return {"job_id": job_id}


@app.get("/api/stream/{job_id}")
async def stream_progress(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    async def generate():
        while True:
            job = jobs.get(job_id)
            if not job:
                yield f"data: {json.dumps({'error': 'not_found'})}\n\n"
                break

            payload = {
                "status": job["status"],
                "progress": job["progress"],
                "total": job["total"],
                "current_name": job["current_name"],
                "error": job["error"],
            }
            yield f"data: {json.dumps(payload)}\n\n"

            if job["status"] in ("done", "error"):
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/download/{job_id}")
async def download_csv(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail="Job not finished yet")

    df = pd.DataFrame(job["places"])
    if df.empty:
        raise HTTPException(status_code=404, detail="No results found")

    # Drop columns that are all the same value (e.g. all "No")
    for col in df.columns:
        if df[col].nunique() == 1:
            df.drop(col, axis=1, inplace=True)

    buf = io.StringIO()
    df.to_csv(buf, index=False)
    csv_bytes = buf.getvalue().encode("utf-8")

    safe_name = job.get("current_name", "resultados").replace(" ", "_")[:30]
    filename = f"gmaps_{safe_name}.csv"

    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
