import os
from dotenv import load_dotenv

load_dotenv()

PRIMARY_MODEL: str = os.getenv("PRIMARY_MODEL", "qwen/qwen3.8-27b")
FALLBACK_MODEL: str = os.getenv("FALLBACK_MODEL", "openai/gpt-oss-20b")
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
AGORA_APP_ID: str = os.getenv("AGORA_APP_ID", "")
AGORA_APP_CERTIFICATE: str = os.getenv("AGORA_APP_CERTIFICATE", "")
AGORA_CONVO_AI_BASE_URL: str = os.getenv("AGORA_CONVO_AI_BASE_URL", "https://api-us-west-1.agora.io/api/conversational-ai-agent/v2")
AGORA_CUSTOMER_ID: str = os.getenv("AGORA_CUSTOMER_ID", "")
AGORA_CUSTOMER_SECRET: str = os.getenv("AGORA_CUSTOMER_SECRET", "")
LLM_WEBHOOK_PUBLIC_URL: str = os.getenv("LLM_WEBHOOK_PUBLIC_URL", "http://localhost:8000")
WEBHOOK_URL: str = os.getenv("WEBHOOK_URL", "https://webhook.site/placeholder")
CONFLICT_TICK_SECONDS: int = int(os.getenv("CONFLICT_TICK_SECONDS", "8"))
CHANNEL_NAME: str = "sentinel1-incident"
AGENT_UID: str = "12345"
RESPONDER_ROLES = ["Fire_Chief", "Traffic_Control", "Hazmat_Lead"]
SENSOR_IDS = ["Sensor_A", "Sensor_B"]
EVAC_ROUTES = ["North_Gate", "East_Gate"]
ROLE_AUTHORITY = {
    "Hazmat_Lead":     {"chemical": 0.9, "fire": 0.3, "traffic": 0.3},
    "Fire_Chief":      {"chemical": 0.4, "fire": 0.85, "traffic": 0.3},
    "Traffic_Control": {"chemical": 0.4, "fire": 0.3, "traffic": 0.9},
}
