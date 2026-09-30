"""
Superdash2 Image Upload Service
Standalone FastAPI micro-service for image upload with shareable links.
Runs on port 8421 by default, with a configurable local upload directory.
"""

import os
import uuid
import json
import sqlite3
import mimetypes
from datetime import datetime, timezone
from pathlib import Path
from contextlib import contextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Query, Depends
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# ── Config ──
UPLOAD_DIR = Path(os.environ.get(
    "IMAGE_UPLOAD_DIR", str(Path(__file__).resolve().parent / "uploads")
))
DB_PATH = UPLOAD_DIR / "images.db"
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico"}
PORT = int(os.environ.get("IMAGE_SERVICE_PORT", "8421"))
AUTH_TOKEN = os.environ.get("IMAGE_SERVICE_TOKEN", "")
if not AUTH_TOKEN or AUTH_TOKEN == "REPLACE_WITH_FLEET_TOKEN":
    raise RuntimeError("Set IMAGE_SERVICE_TOKEN to a non-placeholder token before starting the image service")

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ── Database ──
def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                mime_type TEXT,
                size_bytes INTEGER,
                uploader TEXT DEFAULT 'OPERATOR',
                caption TEXT DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)

@contextmanager
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

# ── App ──
app = FastAPI(title="Superdash2 Image Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def verify_auth(authorization: str = Header(None)):
    """Validate Bearer token if provided. Rejects invalid tokens, allows anonymous for image serving."""
    if not authorization:
        return
    token = authorization.replace("Bearer ", "")
    if token != AUTH_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid auth token")

def require_auth(authorization: str = Header(...)):
    """Require valid Bearer token for write operations."""
    token = authorization.replace("Bearer ", "")
    if token != AUTH_TOKEN:
        raise HTTPException(status_code=403, detail="Invalid auth token")

@app.on_event("startup")
def startup():
    init_db()
    print(f"Image service ready — uploads: {UPLOAD_DIR}, port: {PORT}")

@app.get("/health")
def health():
    return {"status": "ok", "service": "image-service", "upload_dir": str(UPLOAD_DIR)}

@app.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    caption: str = Query(""),
    uploader: str = Query("OPERATOR"),
    _auth=Depends(require_auth),
):
    ext = Path(file.filename or "unknown").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type {ext} not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File too large. Max {MAX_FILE_SIZE // (1024*1024)}MB")

    image_id = uuid.uuid4().hex[:12]
    stored_name = f"{image_id}{ext}"
    stored_path = UPLOAD_DIR / stored_name

    with open(stored_path, "wb") as f:
        f.write(content)

    mime_type = mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    now = datetime.now(timezone.utc).isoformat()

    with get_db() as db:
        db.execute(
            "INSERT INTO images (id, original_name, stored_name, mime_type, size_bytes, uploader, caption, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (image_id, file.filename or "unknown", stored_name, mime_type, len(content), uploader, caption, now),
        )

    host = os.environ.get("IMAGE_SERVICE_HOST", "127.0.0.1")
    share_url = f"http://{host}:{PORT}/img/{image_id}"

    return {
        "id": image_id,
        "url": share_url,
        "original_name": file.filename,
        "size_bytes": len(content),
        "mime_type": mime_type,
        "created_at": now,
    }

@app.get("/img/{image_id}")
def get_image(image_id: str):
    with get_db() as db:
        row = db.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Image not found")

    file_path = UPLOAD_DIR / row["stored_name"]
    if not file_path.exists():
        raise HTTPException(404, "Image file missing from disk")

    return FileResponse(file_path, media_type=row["mime_type"], filename=row["original_name"])

@app.get("/list")
def list_images(limit: int = Query(50, ge=1, le=200)):
    with get_db() as db:
        rows = db.execute(
            "SELECT id, original_name, mime_type, size_bytes, uploader, caption, created_at FROM images ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()

    host = os.environ.get("IMAGE_SERVICE_HOST", "127.0.0.1")
    return {
        "images": [
            {**dict(r), "url": f"http://{host}:{PORT}/img/{r['id']}"}
            for r in rows
        ],
        "count": len(rows),
    }

@app.delete("/img/{image_id}")
def delete_image(image_id: str, _auth=Depends(require_auth)):
    with get_db() as db:
        row = db.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Image not found")

        file_path = UPLOAD_DIR / row["stored_name"]
        if file_path.exists():
            file_path.unlink()

        db.execute("DELETE FROM images WHERE id = ?", (image_id,))

    return {"deleted": image_id}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
