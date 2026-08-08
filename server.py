"""AeroChem Sentinel local server with secure Gmail and general AI endpoints.

Email delivery can use the encrypted Windows setup created by setup-gmail.ps1,
or these environment variables:
  AEROCHEM_GMAIL_USER
  AEROCHEM_GMAIL_APP_PASSWORD
  AEROCHEM_REPORT_RECIPIENT
"""

from __future__ import annotations

import html
import json
import os
import re
import smtplib
import subprocess
import urllib.error
import urllib.request
from urllib.parse import urlparse
from email.message import EmailMessage
from email.utils import formataddr
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


APP_DIR = Path(__file__).resolve().parent
PRIVATE_MAIL_CONFIG = APP_DIR / ".gmail-config.json"
PRIVATE_AI_CONFIG = APP_DIR / ".ai-config.json"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MAX_BODY_BYTES = 64 * 1024
MAX_CHAT_MESSAGES = 12


def _decrypt_windows_secret(encrypted_value: str) -> str:
    """Decrypt a PowerShell DPAPI secure string for the current Windows user."""
    if os.name != "nt" or not encrypted_value:
        return ""
    environment = os.environ.copy()
    environment["AEROCHEM_DPAPI_VALUE"] = encrypted_value
    command = (
        "$secure = ConvertTo-SecureString -String $env:AEROCHEM_DPAPI_VALUE; "
        "$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure); "
        "try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) } "
        "finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }"
    )
    try:
        completed = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
            check=True,
            capture_output=True,
            text=True,
            timeout=8,
            env=environment,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return completed.stdout.strip()


def _private_mail_settings() -> tuple[str, str, str]:
    if not PRIVATE_MAIL_CONFIG.exists():
        return "", "", ""
    try:
        payload = json.loads(PRIVATE_MAIL_CONFIG.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return "", "", ""
    user = str(payload.get("gmailUser", "")).strip()
    recipient = str(payload.get("reportRecipient", user)).strip()
    password = _decrypt_windows_secret(str(payload.get("appPasswordDpapi", "")).strip())
    return user, password, recipient


def _mail_settings() -> tuple[str, str, str]:
    private_user, private_password, private_recipient = _private_mail_settings()
    user = os.environ.get("AEROCHEM_GMAIL_USER", "").strip() or private_user
    password = os.environ.get("AEROCHEM_GMAIL_APP_PASSWORD", "").strip() or private_password
    recipient = os.environ.get("AEROCHEM_REPORT_RECIPIENT", "").strip() or private_recipient
    return user, password, recipient


def _ai_settings() -> tuple[str, str]:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    model = os.environ.get("AEROCHEM_OPENAI_MODEL", "").strip()
    if PRIVATE_AI_CONFIG.exists():
        try:
            payload = json.loads(PRIVATE_AI_CONFIG.read_text(encoding="utf-8-sig"))
        except (OSError, json.JSONDecodeError):
            payload = {}
        if not key:
            key = _decrypt_windows_secret(str(payload.get("apiKeyDpapi", "")).strip())
        if not model:
            model = str(payload.get("model", "")).strip()
    return key, model or "gpt-5.6-terra"


def _clean_chat_messages(raw_messages: Any, current_message: str) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    if isinstance(raw_messages, list):
        for item in raw_messages[-MAX_CHAT_MESSAGES:]:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role", ""))
            content = str(item.get("content", "")).strip()[:5000]
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": current_message[:5000]})
    return messages[-MAX_CHAT_MESSAGES:]


def _extract_openai_answer(payload: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    parts: list[str] = []
    sources: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for output_item in payload.get("output", []):
        if not isinstance(output_item, dict) or output_item.get("type") != "message":
            continue
        for content in output_item.get("content", []):
            if not isinstance(content, dict) or content.get("type") != "output_text":
                continue
            text = str(content.get("text", "")).strip()
            if text:
                parts.append(text)
            for annotation in content.get("annotations", []):
                if not isinstance(annotation, dict) or annotation.get("type") != "url_citation":
                    continue
                url = str(annotation.get("url", "")).strip()
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    sources.append({"url": url, "title": str(annotation.get("title", url))[:160]})
    return "\n\n".join(parts).strip(), sources[:6]


def _request_ai_answer(api_key: str, model: str, payload: dict[str, Any]) -> tuple[str, list[dict[str, str]]]:
    message = str(payload.get("message", "")).strip()
    if not message:
        raise ValueError("A message is required")
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    context_text = json.dumps(context, ensure_ascii=False)[:5000]
    instructions = (
        "You are Sentinel AI, a capable general-purpose assistant inside the AeroChem environmental map. "
        "Answer legitimate questions on any topic, not only this project. Silently understand likely spelling, "
        "grammar, transliteration, Marathi, Hindi, and English mistakes. Ask a clarification only when ambiguity "
        "would materially change the answer. Prefer accurate, verifiable answers and use web search for current "
        "or unstable facts. Never pretend certainty: clearly say when evidence is missing or a claim cannot be "
        "verified. For environmental questions, distinguish observed measurements, modeled estimates, and demos. "
        "Be concise but complete, and answer in the user's language when practical. "
        f"Current application context: {context_text}"
    )
    request_payload = {
        "model": model,
        "instructions": instructions,
        "input": _clean_chat_messages(payload.get("messages"), message),
        "tools": [{"type": "web_search"}],
        "reasoning": {"effort": "low"},
        "text": {"verbosity": "medium"},
        "store": False,
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "AeroChem-Sentinel/3.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        response_payload = json.loads(response.read().decode("utf-8"))
    answer, sources = _extract_openai_answer(response_payload)
    if not answer:
        raise ValueError("The AI service returned no text")
    return answer, sources


def _masked_email(value: str) -> str:
    if "@" not in value:
        return ""
    local, domain = value.split("@", 1)
    visible = local[:2] if len(local) > 2 else local[:1]
    return f"{visible}{'*' * max(2, len(local) - len(visible))}@{domain}"


def _build_report_html(report: dict[str, Any]) -> str:
    title = html.escape(str(report.get("title", "AeroChem Sentinel Report"))[:140])
    summary = html.escape(str(report.get("summary", "No summary supplied."))[:4000])
    generated = html.escape(str(report.get("generatedAt", "Not supplied"))[:80])
    rows = []
    for item in report.get("facts", [])[:20]:
        if not isinstance(item, dict):
            continue
        label = html.escape(str(item.get("label", ""))[:80])
        value = html.escape(str(item.get("value", ""))[:300])
        rows.append(
            f"<tr><td style='padding:9px;border-bottom:1px solid #dce2dc;color:#63706a'>{label}</td>"
            f"<td style='padding:9px;border-bottom:1px solid #dce2dc;font-weight:600'>{value}</td></tr>"
        )
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#18211e">
      <div style="padding:24px;background:#18211e;color:white">
        <div style="font-size:11px;letter-spacing:2px;color:#b9d767">AEROCHEM SENTINEL</div>
        <h1 style="margin:8px 0 0;font-size:28px">{title}</h1>
      </div>
      <div style="padding:24px;border:1px solid #dce2dc;border-top:0">
        <p style="line-height:1.6;color:#4d5b55">{summary}</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">{''.join(rows)}</table>
        <div style="padding:12px;background:#f1f3ee;font-size:12px;color:#63706a">
          Generated {generated}. Values marked demo are not current environmental observations.
        </div>
      </div>
    </div>
    """


class AeroChemHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def _json_response(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/live-aqi":
            upstream = (
                "https://air-quality-api.open-meteo.com/v1/air-quality?"
                "latitude=20.5576062&longitude=74.5246514&"
                "current=us_aqi,pm10,pm2_5,nitrogen_dioxide,sulphur_dioxide,ozone,carbon_monoxide&"
                "hourly=us_aqi,pm10,pm2_5,nitrogen_dioxide,ozone&past_hours=24&forecast_hours=1&"
                "timezone=Asia%2FKolkata&domains=cams_global"
            )
            request = urllib.request.Request(upstream, headers={"User-Agent": "AeroChem-Sentinel/2.0"})
            try:
                with urllib.request.urlopen(request, timeout=15) as response:
                    payload = json.loads(response.read().decode("utf-8"))
            except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
                self.log_error("Live AQ proxy failed: %s", exc)
                self._json_response(HTTPStatus.BAD_GATEWAY, {"ok": False, "error": "Live air-quality model unavailable"})
                return
            self._json_response(HTTPStatus.OK, payload)
            return
        if parsed.path == "/api/report/status":
            user, password, recipient = _mail_settings()
            self._json_response(
                HTTPStatus.OK,
                {
                    "configured": bool(user and password and recipient),
                    "recipient": _masked_email(recipient),
                },
            )
            return
        if parsed.path == "/api/chat/status":
            api_key, model = _ai_settings()
            self._json_response(
                HTTPStatus.OK,
                {"configured": bool(api_key), "model": model if api_key else "local evidence mode"},
            )
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path not in {"/api/report", "/api/chat"}:
            self._json_response(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Not found"})
            return

        content_length = int(self.headers.get("Content-Length", "0") or 0)
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self._json_response(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Invalid report size"})
            return

        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json_response(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Invalid JSON"})
            return

        if parsed.path == "/api/chat":
            api_key, model = _ai_settings()
            if not api_key:
                self._json_response(
                    HTTPStatus.SERVICE_UNAVAILABLE,
                    {"ok": False, "error": "General AI is not configured on this server"},
                )
                return
            try:
                answer, sources = _request_ai_answer(api_key, model, payload)
            except ValueError as exc:
                self._json_response(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
                return
            except (OSError, urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
                self.log_error("OpenAI response failed: %s", exc)
                self._json_response(
                    HTTPStatus.BAD_GATEWAY,
                    {"ok": False, "error": "The general AI service is temporarily unavailable"},
                )
                return
            self._json_response(
                HTTPStatus.OK,
                {"ok": True, "answer": answer, "sources": sources, "model": model},
            )
            return

        user, app_password, configured_recipient = _mail_settings()
        if not (user and app_password and configured_recipient):
            self._json_response(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {"ok": False, "error": "Gmail delivery is not configured on the server"},
            )
            return

        requested_recipient = str(payload.get("recipient", "")).strip()
        if requested_recipient and (
            not EMAIL_RE.match(requested_recipient)
            or requested_recipient.lower() != configured_recipient.lower()
        ):
            self._json_response(
                HTTPStatus.FORBIDDEN,
                {"ok": False, "error": "Recipient does not match the server-configured report address"},
            )
            return

        report = payload.get("report")
        if not isinstance(report, dict):
            self._json_response(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Report payload is required"})
            return

        subject = str(report.get("title", "AeroChem Sentinel Report"))[:140]
        report_html = _build_report_html(report)
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = formataddr(("AeroChem Sentinel", user))
        message["To"] = configured_recipient
        plain_facts = "\n".join(
            f"{item.get('label', '')}: {item.get('value', '')}"
            for item in report.get("facts", [])[:20]
            if isinstance(item, dict)
        )
        message.set_content(
            f"{subject}\n\n{report.get('summary', 'AeroChem Sentinel report')}\n\n"
            f"{plain_facts}\n\nGenerated: {report.get('generatedAt', 'Not supplied')}"
        )
        message.add_alternative(report_html, subtype="html")
        message.add_attachment(report_html, subtype="html", filename="aerochem-sentinel-report.html")

        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as smtp:
                smtp.login(user, app_password)
                smtp.send_message(message)
        except (OSError, smtplib.SMTPException) as exc:
            self.log_error("Gmail delivery failed: %s", exc)
            self._json_response(HTTPStatus.BAD_GATEWAY, {"ok": False, "error": "Gmail delivery failed"})
            return

        self._json_response(HTTPStatus.OK, {"ok": True, "recipient": _masked_email(configured_recipient)})


if __name__ == "__main__":
    port = int(os.environ.get("AEROCHEM_PORT", "4173"))
    print(f"AeroChem Sentinel running at http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), AeroChemHandler).serve_forever()
