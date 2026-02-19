# lamp

An LLM-Assisted Mapping Pipeline. An approach that leverages LLM to assist the mapping process in Ontology-Based Data Integration

---

## Installation

### Prerequisites

- Python 3.10+
- Node.js with npm 22 or 23
- Angular CLI 19 (`npm install -g @angular/cli`)

---

### Backend (Python / Flask)

**1. Navigate to the backend directory**

```bash
cd backend
```

**2. Set up a local Python virtual environment**

```bash
python -m venv venv
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows
```

**3. Configure environment variables**

Copy the example environment file and fill in your API keys and configuration:

```bash
cp .env.example .env
```

Then open `.env` and edit the LLM provider settings to match your setup:

```env
# Choose your LLM provider: gemini | openai | anthropic | ollama | deepseek | together | groq
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash
EMBEDDING_MODEL=models/gemini-embedding-001

# Fill in the API key for your chosen provider
GOOGLE_API_KEY=your_google_api_key_here
# OPENAI_API_KEY=your_openai_api_key_here
# ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

> Only the API key corresponding to the selected `LLM_PROVIDER` is required. Leave the others blank or commented out.

**4. Install dependencies**

```bash
pip install -r requirements.txt
```

**5. Run the backend server**

```bash
python app.py
```

The Flask API will start on `http://localhost:5000` by default.

---

### Frontend (Angular)

**1. Navigate to the frontend directory**

```bash
cd frontend
```

**2. Install dependencies**

```bash
npm install
```

> Requires npm 22 or 23 and Angular CLI 19. If Angular CLI is not installed globally, run:
>
> ```bash
> npm install -g @angular/cli
> ```

**3. Run the development server**

```bash
ng serve
```

The app will be available at `http://localhost:4200`.

> **CORS:** The backend already has `flask-cors` enabled. If you run the frontend on a different host or port, make sure the Flask backend allows that origin. By default, CORS is configured to accept all origins. To restrict it, update the `CORS(app, origins=[...])` call in `app.py`.
