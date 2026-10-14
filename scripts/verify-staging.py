"""Authorized Docker runtime verification, never the default Compose project or .env.

Run after: docker build -t doorman:verification .
Uses synthetic data only; removes only the resources it creates, even on failure.
"""
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PROJECT = "doorman-verification"
ENV = os.environ.copy()
for key in list(ENV):
    if key.startswith("COMPOSE_") or key in (
        "POSTGRES_PASSWORD", "DISCORD_BOT_TOKEN", "DISCORD_CLIENT_ID",
        "DISCORD_CLIENT_SECRET", "AUTH_SECRET", "PUBLIC_URL", "DATABASE_URL",
        "UPLOADS_DIR", "DOORMAN_BIND_ADDRESS", "DOORMAN_PORT", "SERVICE",
    ):
        ENV.pop(key)
ENV["MSYS_NO_PATHCONV"] = "1"
REDACT = []


def run(args, input_text=None):
    result = subprocess.run(args, env=ENV, cwd=ROOT, input=input_text,
                            capture_output=True, text=True)
    # No configuration, cookies or credentials are printed, including on failure.
    if result.returncode:
        details = result.stdout + result.stderr
        for value in REDACT:
            details = details.replace(value, "[redacted synthetic credential]")
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(args[:3])}\n" + details)
    return result.stdout


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def response(opener, url, **kwargs):
    try:
        return opener.open(urllib.request.Request(url, **kwargs), timeout=10)
    except urllib.error.HTTPError as error:
        return error


# Refuse any pre-existing resources: cleanup must never claim another run's state.
for resource, command in (
    ("containers", ["docker", "ps", "-aq"]),
    ("volumes", ["docker", "volume", "ls", "-q"]),
    ("networks", ["docker", "network", "ls", "-q"]),
):
    if run(command + ["--filter", f"label=com.docker.compose.project={PROJECT}"]).strip():
        raise RuntimeError(f"Pre-existing {resource} for {PROJECT}; refusing to reuse/remove them")
run(["docker", "image", "inspect", "doorman:verification", "--format", "{{.Id}}"])
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
origin = f"http://127.0.0.1:{port}"
with tempfile.TemporaryDirectory(prefix="doorman-verification-") as tmp:
    tmp = Path(tmp)
    fixture = tmp / "synthetic.env"
    fixture.write_text(
        "POSTGRES_PASSWORD=" + secrets.token_hex(24) + "\n"
        "DISCORD_BOT_TOKEN=synthetic-never-start-bot\n"
        "DISCORD_CLIENT_ID=123456789012345678\n"
        "DISCORD_CLIENT_SECRET=synthetic-not-a-discord-secret\n"
        "AUTH_SECRET=" + secrets.token_hex(32) + "\n"
        f"PUBLIC_URL={origin}\nDOORMAN_BIND_ADDRESS=127.0.0.1\nDOORMAN_PORT={port}\n"
    )
    fixture.chmod(0o600)
    REDACT.extend(line.split("=", 1)[1] for line in fixture.read_text().splitlines()
                  if line.split("=", 1)[0] in ("POSTGRES_PASSWORD", "DISCORD_BOT_TOKEN", "DISCORD_CLIENT_SECRET", "AUTH_SECRET"))
    override = tmp / "override.yaml"
    # Runtime omits the root build config; mount only this public file for Vitest.
    override.write_text("services:\n" + "".join(
        f"  {service}:\n    image: doorman:verification\n" for service in ("schema", "bot", "web")
    ) + "    volumes:\n      - " + json.dumps(
        (ROOT / "tsconfig.base.json").as_posix() + ":/app/tsconfig.base.json:ro") + "\n")
    compose = ["docker", "compose", "--env-file", str(fixture), "--project-name", PROJECT,
               "-f", str(ROOT / "compose.yaml"), "-f", str(override)]
    created = False
    try:
        run(compose + ["config", "--quiet"])
        created = True
        run(compose + ["up", "-d", "--no-build", "--wait", "--wait-timeout", "180", "db"])
        print("Fresh non-root/read-only PostgreSQL initialized and healthy.")
        legacy = run(["git", "show", "HEAD:packages/database/prisma/schema.prisma"])
        # The old schema is read from Git, never from a live DB or a backup.
        legacy_command = (
            "const fs=require('fs'),cp=require('child_process');"
            "fs.writeFileSync('/tmp/legacy.prisma',fs.readFileSync(0));"
            "process.exit(cp.spawnSync(process.execPath,"
            "['packages/database/node_modules/prisma/build/index.js','db','push',"
            "'--schema','/tmp/legacy.prisma','--skip-generate'],{stdio:'inherit'}).status);"
        )
        run(compose + ["run", "--rm", "--no-deps", "-T", "--entrypoint", "node", "schema", "-e", legacy_command], legacy)
        run(compose + ["exec", "-T", "db", "psql", "-U", "doorman", "-d", "doorman", "-v", "ON_ERROR_STOP=1"], '''
INSERT INTO "Guild" (id,name,"defaultRoleIds","updatedAt") VALUES
 ('legacy','Legacy synthetic guild',ARRAY['300'],now()), ('100','Staging synthetic guild',ARRAY['300'],now());
INSERT INTO "InviteRoleMap" (id,"guildId","inviteCode","roleId") VALUES ('legacy-map','legacy','synthetic','300');
INSERT INTO "PendingApproval" (id,"guildId","userId",username,"accountCreatedAt","joinedAt") VALUES
 ('legacy-pending-1','legacy','200','Synthetic',now(),now()),
 ('legacy-pending-2','legacy','200','Synthetic',now(),now());
INSERT INTO "JoinEvent" (id,"guildId","userId") VALUES ('legacy-join','legacy','200');
''')
        run(compose + ["up", "-d", "--no-build", "--wait", "--wait-timeout", "180", "web"])
        states = [json.loads(line) for line in run(compose + ["ps", "-a", "--format", "json"]).splitlines()]
        assert {state["Service"] for state in states} == {"db", "schema", "web"}
        assert next(state for state in states if state["Service"] == "schema")["ExitCode"] == 0
        assert all(state["Health"] == "healthy" for state in states if state["Service"] in ("db", "web"))
        print("Current schema job exited 0; web healthy; bot never created.")
        for service in ("db", "web"):
            cid = run(compose + ["ps", "-q", service]).strip()
            flags = run(["docker", "inspect", cid, "--format",
                         "{{.Config.User}} {{.HostConfig.ReadonlyRootfs}} {{json .HostConfig.CapDrop}} {{json .HostConfig.SecurityOpt}}"])
            assert "true" in flags and '"ALL"' in flags and "no-new-privileges:true" in flags
            assert flags.startswith("postgres " if service == "db" else "node ")
        assert run(compose + ["exec", "-T", "web", "id", "-u"]).strip() == "1000"

        # Never follow the OAuth redirect; all HTTP requests remain on localhost.
        jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPCookieProcessor(jar))
        for pathname in ("/", "/guilds", "/guilds/100"):
            result = response(opener, origin + pathname)
            if result.status == 307:
                assert urllib.parse.urlsplit(result.headers["Location"]).path == "/api/auth/login"
            else:
                assert result.status == 200 and b"NEXT_REDIRECT;replace;/api/auth/login;307;" in result.read()
        result = response(opener, origin + "/api/auth/login")
        assert result.status == 307
        target = urllib.parse.urlsplit(result.headers["Location"])
        assert target.hostname == "discord.com"
        query = urllib.parse.parse_qs(target.query)
        assert query["redirect_uri"] == [origin + "/api/auth/callback"]
        assert query["scope"] == ["identify guilds"]
        cookie_header = result.headers["Set-Cookie"]
        assert "HttpOnly" in cookie_header and "SameSite=lax" in cookie_header
        result = response(opener, origin + "/api/auth/callback?state=invalid&code=synthetic")
        assert result.status == 400 and json.load(result) == {"error": "Invalid OAuth state"}
        assert not list(jar)
        response(opener, origin + "/api/auth/login")
        state = next(cookie.value for cookie in jar if cookie.name == "doorman_oauth_state")
        result = response(opener, origin + "/api/auth/callback?" + urllib.parse.urlencode({"state": state, "error": "access_denied"}))
        assert result.status == 307 and result.headers["Location"] == origin + "/"
        assert not list(jar)
        result = response(opener, origin + "/api/auth/logout", method="GET")
        assert result.status == 405
        result = response(opener, origin + "/api/auth/logout", method="POST", headers={"Origin": "http://evil.invalid"})
        assert result.status == 403
        result = response(opener, origin + "/api/auth/logout", method="POST", headers={"Origin": origin})
        assert result.status == 303 and result.headers["Location"] == origin + "/"
        print("HTTP setup/login redirects, invalid OAuth state, denied login and logout CSRF checks passed (no Discord request).")
        output = run(compose + ["exec", "-T", "-e", "DOORMAN_STAGING_CHECK=1", "web", "sh", "-c",
                               "cd /app/apps/web && node /app/node_modules/vitest/vitest.mjs run --config staging/vitest.config.mts --configLoader runner"])
        print(output)
        run(compose + ["restart", "db"])
        run(compose + ["up", "-d", "--no-build", "--wait", "--wait-timeout", "180", "db"])
        count = run(compose + ["exec", "-T", "db", "psql", "-U", "doorman", "-d", "doorman", "-Atc",
                               'SELECT count(*) FROM "Guild" WHERE id=\'legacy\''])
        assert count.strip() == "1"
        print("Populated non-root PostgreSQL restart preserved legacy data.")
    except Exception:
        if created:
            diagnostics = run(compose + ["logs", "--no-color", "--tail", "60", "schema", "web"])
            for value in REDACT:
                diagnostics = diagnostics.replace(value, "[redacted synthetic credential]")
            print(diagnostics)
        raise
    finally:
        if created:
            run(compose + ["down", "--volumes", "--remove-orphans"])
            print("Removed only doorman-verification containers, network and throwaway volumes.")
