"""AeroChem Sentinel local server with an optional secure Gmail report endpoint.

Required environment variables for email delivery:
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
import urllib.error
import urllib.request
from urllib.parse import urlparse
from email.message import EmailMessage
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


APP_DIR = Path(__file__).resolve().parent
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MAX_BODY_BYTES = 64 * 1024


def _mail_settings() -> tuple[str, str, str]:
    return (
        os.environ.get("AEROCHEM_GMAIL_USER", "").strip(),
        os.environ.get("AEROCHEM_GMAIL_APP_PASSWORD", "").strip(),
        os.environ.get("AEROCHEM_REPORT_RECIPIENT", "").strip(),
    )


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
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/report":
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

        user, app_password, configured_recipient = _mail_settings()
        if not (user and app_password and configured_recipient):
            self._json_response(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {"ok": False, "error": "Gmail delivery is not configured on the server"},
            )
            return

        requested_recipient = str(payload.get("recipient", "")).strip()
        if not EMAIL_RE.match(requested_recipient) or requested_recipient.lower() != configured_recipient.lower():
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
        message["From"] = user
        message["To"] = configured_recipient
        message.set_content(str(report.get("summary", "AeroChem Sentinel report"))[:6000])
        message.add_alternative(report_html, subtype="html")

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
