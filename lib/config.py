import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DB_PATH = os.environ.get("RAGBUILDER_DB_PATH", os.path.join(BASE_DIR, "ragbuilder.db"))
QDRANT_PATH = os.environ.get("RAGBUILDER_QDRANT_PATH", os.path.join(BASE_DIR, "qdrant_db"))
TEMP_DIR = os.environ.get("RAGBUILDER_TEMP_DIR", os.path.join(BASE_DIR, "temp"))
LOG_FILE = os.environ.get("RAGBUILDER_LOG_FILE", os.path.join(BASE_DIR, "ragbuilder.log"))

DEFAULT_TOP_K = int(os.environ.get("RAGBUILDER_DEFAULT_TOP_K", "4"))
DEFAULT_VECTOR_WEIGHT = float(os.environ.get("RAGBUILDER_VECTOR_WEIGHT", "0.7"))
DEFAULT_KEYWORD_WEIGHT = float(os.environ.get("RAGBUILDER_KEYWORD_WEIGHT", "0.3"))
DEFAULT_CHUNK_SIZE = int(os.environ.get("RAGBUILDER_CHUNK_SIZE", "500"))
DEFAULT_CHUNK_OVERLAP = int(os.environ.get("RAGBUILDER_CHUNK_OVERLAP", "50"))
MAX_UPLOAD_BYTES = int(os.environ.get("RAGBUILDER_MAX_UPLOAD_MB", "50")) * 1024 * 1024
MAX_QUERY_LENGTH = int(os.environ.get("RAGBUILDER_MAX_QUERY_LENGTH", "8000"))

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt", ".md"}
