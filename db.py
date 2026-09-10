import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "tigrehack.db"

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  correo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  nombre TEXT NOT NULL,
  apellido TEXT NOT NULL,
  telefono TEXT NOT NULL,
  genero TEXT NOT NULL,
  universidad TEXT NOT NULL,
  carrera TEXT NOT NULL,
  graduacion TEXT NOT NULL,
  nivel TEXT NOT NULL,
  talla TEXT NOT NULL,
  dieta TEXT DEFAULT '',
  github TEXT NOT NULL,
  devpost TEXT DEFAULT '',
  linkedin TEXT DEFAULT '',
  sitio TEXT DEFAULT '',
  reglamento INTEGER NOT NULL DEFAULT 0,
  estudiante INTEGER NOT NULL DEFAULT 0,
  foto TEXT DEFAULT '',
  equipo_codigo TEXT DEFAULT '',
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equipos (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  capitan_correo TEXT NOT NULL,
  creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equipo_miembros (
  equipo_codigo TEXT NOT NULL,
  correo TEXT NOT NULL,
  unido_en TEXT NOT NULL,
  PRIMARY KEY (equipo_codigo, correo),
  FOREIGN KEY (equipo_codigo) REFERENCES equipos(codigo) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  correo TEXT NOT NULL,
  creado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sesiones_correo ON sesiones(correo);
CREATE INDEX IF NOT EXISTS idx_miembros_correo ON equipo_miembros(correo);
"""


def connect():
    DATA_DIR.mkdir(exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init_db():
    with connect() as con:
        con.executescript(SCHEMA)
        con.commit()
