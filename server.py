"""Servidor de Tigre Hack: página + API + SQLite.

Uso:
  python server.py
Luego abre http://127.0.0.1:8000
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import sqlite3
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import db

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8000
COOKIE = "th_sesion"
TEAM_MAX = 4
CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
REQUIRED = (
    "nombre",
    "apellido",
    "correo",
    "telefono",
    "genero",
    "universidad",
    "carrera",
    "graduacion",
    "nivel",
    "talla",
    "github",
)
def now_iso():
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000)
    return f"pbkdf2${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _algo, salt, digest = stored.split("$", 2)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000)
    return hmac.compare_digest(check.hex(), digest)


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def new_team_code() -> str:
    return "".join(secrets.choice(CODE_CHARS) for _ in range(6))


def public_user(row: sqlite3.Row) -> dict:
    return {
        "nombre": row["nombre"],
        "apellido": row["apellido"],
        "correo": row["correo"],
        "telefono": row["telefono"],
        "genero": row["genero"],
        "universidad": row["universidad"],
        "carrera": row["carrera"],
        "graduacion": row["graduacion"],
        "nivel": row["nivel"],
        "talla": row["talla"],
        "dieta": row["dieta"] or "",
        "github": row["github"],
        "devpost": row["devpost"] or "",
        "linkedin": row["linkedin"] or "",
        "sitio": row["sitio"] or "",
        "reglamento": bool(row["reglamento"]),
        "estudiante": bool(row["estudiante"]),
        "foto": row["foto"] or "",
        "equipoCodigo": row["equipo_codigo"] or "",
        "creadoEn": row["creado_en"],
    }


def get_user(con, correo: str):
    return con.execute(
        "SELECT * FROM usuarios WHERE correo = ?", (normalize_email(correo),)
    ).fetchone()


def team_payload(con, codigo: str):
    if not codigo:
        return None
    team = con.execute("SELECT * FROM equipos WHERE codigo = ?", (codigo,)).fetchone()
    if not team:
        return None
    members = con.execute(
        """
        SELECT u.correo, u.nombre, u.apellido, u.foto
        FROM equipo_miembros m
        JOIN usuarios u ON u.correo = m.correo
        WHERE m.equipo_codigo = ?
        ORDER BY m.unido_en
        """,
        (codigo,),
    ).fetchall()
    return {
        "codigo": team["codigo"],
        "nombre": team["nombre"],
        "capitan": team["capitan_correo"],
        "creadoEn": team["creado_en"],
        "miembros": [
            {
                "correo": m["correo"],
                "nombre": m["nombre"],
                "apellido": m["apellido"],
                "foto": m["foto"] or "",
            }
            for m in members
        ],
    }


def session_user(con, token: str):
    if not token:
        return None
    row = con.execute(
        """
        SELECT u.* FROM sesiones s
        JOIN usuarios u ON u.correo = s.correo
        WHERE s.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def create_session(con, correo: str) -> str:
    token = secrets.token_urlsafe(32)
    con.execute(
        "INSERT INTO sesiones (token, correo, creado_en) VALUES (?, ?, ?)",
        (token, correo, now_iso()),
    )
    return token


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print("[%s] " % self.log_date_time_string() + fmt % args)

    def cookie_token(self) -> str:
        raw = self.headers.get("Cookie", "")
        jar = SimpleCookie()
        try:
            jar.load(raw)
        except Exception:
            return ""
        morsel = jar.get(COOKIE)
        return morsel.value if morsel else ""

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > 900_000:
            return None, "La solicitud es demasiado grande."
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return None, "JSON inválido."
        if not isinstance(data, dict):
            return None, "JSON inválido."
        return data, None

    def send_json(self, payload: dict, status=200, cookie: str | None = None, clear=False):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header(
                "Set-Cookie",
                f"{COOKIE}={cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000",
            )
        if clear:
            self.send_header(
                "Set-Cookie",
                f"{COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
            )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.handle_api("GET", path)
            return
        if path.startswith("/data/"):
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.handle_api("POST", path)
            return
        self.send_error(404)

    def do_PATCH(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self.handle_api("PATCH", path)
            return
        self.send_error(404)

    def handle_api(self, method: str, path: str):
        try:
            if method == "GET" and path == "/api/me":
                self.api_me()
            elif method == "POST" and path == "/api/registro":
                self.api_registro()
            elif method == "POST" and path == "/api/login":
                self.api_login()
            elif method == "POST" and path == "/api/logout":
                self.api_logout()
            elif method == "POST" and path == "/api/recuperar":
                self.api_recuperar()
            elif method == "PATCH" and path == "/api/me":
                self.api_update_me()
            elif method == "POST" and path == "/api/equipo":
                self.api_create_team()
            elif method == "POST" and path == "/api/equipo/unirse":
                self.api_join_team()
            elif method == "POST" and path == "/api/equipo/salir":
                self.api_leave_team()
            else:
                self.send_json({"ok": False, "error": "Ruta no encontrada."}, 404)
        except Exception as exc:
            print("API error:", exc)
            self.send_json({"ok": False, "error": "Error interno del servidor."}, 500)

    def api_me(self):
        with db.connect() as con:
            user = session_user(con, self.cookie_token())
            if not user:
                self.send_json({"ok": False})
                return
            self.send_json(
                {
                    "ok": True,
                    "user": public_user(user),
                    "team": team_payload(con, user["equipo_codigo"]),
                }
            )

    def api_registro(self):
        data, err = self.read_json()
        if err:
            self.send_json({"ok": False, "error": err}, 400)
            return
        for key in REQUIRED:
            if not str(data.get(key) or "").strip():
                self.send_json({"ok": False, "error": "Llena todos los campos obligatorios."}, 400)
                return
        if not data.get("reglamento") or not data.get("estudiante"):
            self.send_json(
                {"ok": False, "error": "Acepta el reglamento y confirma que eres estudiante."},
                400,
            )
            return
        password = str(data.get("password") or "")
        if len(password) < 8:
            self.send_json(
                {"ok": False, "error": "La contraseña debe tener al menos 8 caracteres."},
                400,
            )
            return
        email = normalize_email(data.get("correo"))
        stamp = now_iso()
        with db.connect() as con:
            if get_user(con, email):
                self.send_json({"ok": False, "error": "Ya existe una cuenta con este correo."}, 409)
                return
            con.execute(
                """
                INSERT INTO usuarios (
                  correo, password_hash, nombre, apellido, telefono, genero,
                  universidad, carrera, graduacion, nivel, talla, dieta, github,
                  devpost, linkedin, sitio, reglamento, estudiante, foto,
                  equipo_codigo, creado_en, actualizado_en
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    email,
                    hash_password(password),
                    str(data.get("nombre") or "").strip(),
                    str(data.get("apellido") or "").strip(),
                    str(data.get("telefono") or "").strip(),
                    str(data.get("genero") or "").strip(),
                    str(data.get("universidad") or "").strip(),
                    str(data.get("carrera") or "").strip(),
                    str(data.get("graduacion") or "").strip(),
                    str(data.get("nivel") or "").strip(),
                    str(data.get("talla") or "").strip(),
                    str(data.get("dieta") or "").strip(),
                    str(data.get("github") or "").strip(),
                    str(data.get("devpost") or "").strip(),
                    str(data.get("linkedin") or "").strip(),
                    str(data.get("sitio") or "").strip(),
                    1 if data.get("reglamento") else 0,
                    1 if data.get("estudiante") else 0,
                    "",
                    "",
                    stamp,
                    stamp,
                ),
            )
            token = create_session(con, email)
            user = get_user(con, email)
            con.commit()
        self.send_json({"ok": True, "user": public_user(user), "team": None}, cookie=token)

    def api_login(self):
        data, err = self.read_json()
        if err:
            self.send_json({"ok": False, "error": err}, 400)
            return
        email = normalize_email(data.get("correo"))
        password = str(data.get("password") or "")
        with db.connect() as con:
            user = get_user(con, email)
            if not user:
                self.send_json({"ok": False, "error": "No encontramos una cuenta con este correo."}, 401)
                return
            if not verify_password(password, user["password_hash"]):
                self.send_json({"ok": False, "error": "Contraseña incorrecta."}, 401)
                return
            token = create_session(con, user["correo"])
            team = team_payload(con, user["equipo_codigo"])
            con.commit()
        self.send_json({"ok": True, "user": public_user(user), "team": team}, cookie=token)

    def api_logout(self):
        token = self.cookie_token()
        with db.connect() as con:
            if token:
                con.execute("DELETE FROM sesiones WHERE token = ?", (token,))
                con.commit()
        self.send_json({"ok": True}, clear=True)

    def api_recuperar(self):
        data, err = self.read_json()
        if err:
            self.send_json({"ok": False, "error": err}, 400)
            return
        email = normalize_email(data.get("correo"))
        password = str(data.get("password") or "")
        if len(password) < 8:
            self.send_json(
                {"ok": False, "error": "La contraseña debe tener al menos 8 caracteres."},
                400,
            )
            return
        with db.connect() as con:
            user = get_user(con, email)
            if not user:
                self.send_json({"ok": False, "error": "No encontramos una cuenta con este correo."}, 404)
                return
            con.execute(
                "UPDATE usuarios SET password_hash = ?, actualizado_en = ? WHERE correo = ?",
                (hash_password(password), now_iso(), email),
            )
            con.execute("DELETE FROM sesiones WHERE correo = ?", (email,))
            con.commit()
        self.send_json({"ok": True})

    def api_update_me(self):
        data, err = self.read_json()
        if err:
            self.send_json({"ok": False, "error": err}, 400)
            return
        with db.connect() as con:
            user = session_user(con, self.cookie_token())
            if not user:
                self.send_json({"ok": False, "error": "No hay sesión."}, 401)
                return
            fields = []
            values = []
            for key, column in {
                "nombre": "nombre",
                "apellido": "apellido",
                "telefono": "telefono",
                "genero": "genero",
                "universidad": "universidad",
                "carrera": "carrera",
                "graduacion": "graduacion",
                "nivel": "nivel",
                "talla": "talla",
                "dieta": "dieta",
                "github": "github",
                "devpost": "devpost",
                "linkedin": "linkedin",
                "sitio": "sitio",
                "foto": "foto",
            }.items():
                if key in data:
                    fields.append(f"{column} = ?")
                    values.append("" if data[key] is None else str(data[key]).strip())
            if not fields:
                self.send_json(
                    {
                        "ok": True,
                        "user": public_user(user),
                        "team": team_payload(con, user["equipo_codigo"]),
                    }
                )
                return
            fields.append("actualizado_en = ?")
            values.append(now_iso())
            values.append(user["correo"])
            con.execute(
                "UPDATE usuarios SET " + ", ".join(fields) + " WHERE correo = ?",
                values,
            )
            user = get_user(con, user["correo"])
            team = team_payload(con, user["equipo_codigo"])
            con.commit()
        self.send_json({"ok": True, "user": public_user(user), "team": team})

    def api_create_team(self):
        data, err = self.read_json()
        if err:
            self.send_json({"ok": False, "error": err}, 400)
            return
        nombre = str(data.get("nombre") or "").strip()
        if len(nombre) < 2:
            self.send_json({"ok": False, "error": "El nombre debe tener al menos 2 letras."}, 400)
            return
        with db.connect() as con:
            user = session_user(con, self.cookie_token())
            if not user:
                self.send_json({"ok": False, "error": "Inicia sesión para crear un equipo."}, 401)
                return
            if user["equipo_codigo"]:
                self.send_json({"ok": False, "error": "Ya estás en un equipo."}, 400)
                return
            codigo = new_team_code()
            while con.execute("SELECT 1 FROM equipos WHERE codigo = ?", (codigo,)).fetchone():
                codigo = new_team_code()
            stamp = now_iso()
            con.execute(
                "INSERT INTO equipos (codigo, nombre, capitan_correo, creado_en) VALUES (?, ?, ?, ?)",
                (codigo, nombre, user["correo"], stamp),
            )
            con.execute(
                "INSERT INTO equipo_miembros (equipo_codigo, correo, unido_en) VALUES (?, ?, ?)",
                (codigo, user["correo"], stamp),
            )
            con.execute(
                "UPDATE usuarios SET equipo_codigo = ?, actualizado_en = ? WHERE correo = ?",
                (codigo, stamp, user["correo"]),
            )
            user = get_user(con, user["correo"])
            team = team_payload(con, codigo)
            con.commit()
        self.send_json({"ok": True, "user": public_user(user), "team": team})

    def api_join_team(self):
        data, err = self.read_json()
        if err:
            self.send_json({"ok": False, "error": err}, 400)
            return
        codigo = str(data.get("codigo") or "").strip().upper()
        if len(codigo) != 6:
            self.send_json({"ok": False, "error": "El código tiene 6 letras."}, 400)
            return
        with db.connect() as con:
            user = session_user(con, self.cookie_token())
            if not user:
                self.send_json({"ok": False, "error": "Inicia sesión para unirte a un equipo."}, 401)
                return
            if user["equipo_codigo"]:
                self.send_json({"ok": False, "error": "Ya estás en un equipo."}, 400)
                return
            team = con.execute("SELECT * FROM equipos WHERE codigo = ?", (codigo,)).fetchone()
            if not team:
                self.send_json({"ok": False, "error": "Ese código no existe."}, 404)
                return
            count = con.execute(
                "SELECT COUNT(*) AS n FROM equipo_miembros WHERE equipo_codigo = ?",
                (codigo,),
            ).fetchone()["n"]
            already = con.execute(
                "SELECT 1 FROM equipo_miembros WHERE equipo_codigo = ? AND correo = ?",
                (codigo, user["correo"]),
            ).fetchone()
            if not already and count >= TEAM_MAX:
                self.send_json({"ok": False, "error": "Ese equipo ya tiene 4 personas."}, 400)
                return
            stamp = now_iso()
            if not already:
                con.execute(
                    "INSERT INTO equipo_miembros (equipo_codigo, correo, unido_en) VALUES (?, ?, ?)",
                    (codigo, user["correo"], stamp),
                )
            con.execute(
                "UPDATE usuarios SET equipo_codigo = ?, actualizado_en = ? WHERE correo = ?",
                (codigo, stamp, user["correo"]),
            )
            user = get_user(con, user["correo"])
            payload = team_payload(con, codigo)
            con.commit()
        self.send_json({"ok": True, "user": public_user(user), "team": payload})

    def api_leave_team(self):
        with db.connect() as con:
            user = session_user(con, self.cookie_token())
            if not user:
                self.send_json({"ok": False, "error": "No hay sesión."}, 401)
                return
            codigo = user["equipo_codigo"]
            if not codigo:
                self.send_json({"ok": False, "error": "No estás en un equipo."}, 400)
                return
            con.execute(
                "DELETE FROM equipo_miembros WHERE equipo_codigo = ? AND correo = ?",
                (codigo, user["correo"]),
            )
            left = con.execute(
                "SELECT correo FROM equipo_miembros WHERE equipo_codigo = ? ORDER BY unido_en",
                (codigo,),
            ).fetchall()
            if not left:
                con.execute("DELETE FROM equipos WHERE codigo = ?", (codigo,))
            else:
                team = con.execute("SELECT capitan_correo FROM equipos WHERE codigo = ?", (codigo,)).fetchone()
                if team and team["capitan_correo"] == user["correo"]:
                    con.execute(
                        "UPDATE equipos SET capitan_correo = ? WHERE codigo = ?",
                        (left[0]["correo"], codigo),
                    )
            con.execute(
                "UPDATE usuarios SET equipo_codigo = '', actualizado_en = ? WHERE correo = ?",
                (now_iso(), user["correo"]),
            )
            user = get_user(con, user["correo"])
            con.commit()
        self.send_json({"ok": True, "user": public_user(user), "team": None})


def main():
    db.init_db()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Tigre Hack en http://{HOST}:{PORT}")
    print("La base de datos está en data/tigrehack.db")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")


if __name__ == "__main__":
    main()
