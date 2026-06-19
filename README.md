# Google Maps Scraper Web

Frontend en Vercel + Backend en Railway.

## Deploy

### Backend → Railway

1. Crear cuenta en [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo → seleccionar este repo
3. En Railway: configurar **Root Directory** = `backend`
4. Railway auto-detecta el Dockerfile y lo usa
5. Una vez deployado, copiar la URL pública (ej: `https://tu-app.railway.app`)

### Frontend → Vercel

1. Crear cuenta en [vercel.com](https://vercel.com)
2. New Project → seleccionar este repo
3. En Vercel: configurar **Root Directory** = `frontend`
4. Agregar variable de entorno:
   - `NEXT_PUBLIC_BACKEND_URL` = la URL de Railway (sin `/` al final)
5. Deploy

## Dev local

```bash
# Backend
cd backend
pip install -r requirements.txt
playwright install chromium
uvicorn main:app --reload

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev
```

El frontend corre en `http://localhost:3000` y llama al backend en `http://localhost:8000`.
