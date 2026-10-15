# Infrastructure checks without deployment

This check uses only repository files and **fake** credentials in a temporary directory. It does not read `.env`, contact Discord, download images, start Docker or access the daemon. It requires installed Docker Compose (only the local parser), Bash, `sh` and Python 3. The code checks syntax, overwrite protection, rejection of non-interactive input, entrypoint dispatch/failure and Compose ordering/binding/permissions.

From the root, run the following block:

```bash
python - <<'PY'
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path.cwd()
bash, sh = shutil.which('bash'), shutil.which('sh')
subprocess.run([bash, '-n', (root / 'install.sh').as_posix()], check=True)
subprocess.run([sh, '-n', (root / 'docker-entrypoint.sh').as_posix()], check=True)
env = os.environ.copy()
for key in ('POSTGRES_PASSWORD', 'DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID',
            'DISCORD_CLIENT_SECRET', 'AUTH_SECRET', 'PUBLIC_URL',
            'DOORMAN_BIND_ADDRESS', 'DOORMAN_PORT', 'SERVICE', 'COMPOSE_FILE',
            'COMPOSE_ENV_FILES', 'COMPOSE_PROFILES'):
    env.pop(key, None)
with tempfile.TemporaryDirectory(prefix='doorman-check-') as tmp:
    tmp = Path(tmp)
    fixture = tmp / 'fixture.env'
    fixture.write_text('POSTGRES_PASSWORD=fake-db\nDISCORD_BOT_TOKEN=fake-token\n'
                       'DISCORD_CLIENT_ID=123456789012345678\n'
                       'DISCORD_CLIENT_SECRET=fake-secret\nAUTH_SECRET=' + 'a' * 64 + '\n')
    config = json.loads(subprocess.check_output([
        'docker', 'compose', '--env-file', str(fixture), '-f', str(root / 'compose.yaml'),
        'config', '--format', 'json'], env=env, text=True))
    services = config['services']
    assert 'ports' not in services['db']
    assert services['db']['user'] == 'postgres'
    assert services['db']['healthcheck']['test'][-1].endswith('-h 127.0.0.1')
    assert services['schema']['restart'] == 'no'
    assert services['schema']['depends_on']['db']['condition'] == 'service_healthy'
    for name in ('bot', 'web'):
        assert services[name]['depends_on']['schema']['condition'] == 'service_completed_successfully'
        assert services[name]['image'] == services['schema']['image'] == 'doorman:local'
    for name in services:
        assert services[name]['read_only'] is True
        assert services[name]['cap_drop'] == ['ALL']
        assert services[name]['security_opt'] == ['no-new-privileges:true']
    port = services['web']['ports'][0]
    assert port['host_ip'] == '127.0.0.1' and port['target'] == 3000
    assert services['bot']['volumes'][0]['read_only'] is True
    assert 'DISCORD_BOT_TOKEN' not in services['schema']['environment']
    # Pages can stream HTTP 200 before redirecting; use the non-streaming OAuth route.
    healthcheck = services['web']['healthcheck']['test'][-1]
    assert "http://127.0.0.1:3000/api/auth/login" in healthcheck
    assert "redirect:'manual'" in healthcheck and 'r.status===307' in healthcheck

    shutil.copyfile(root / 'install.sh', tmp / 'install.sh')
    sentinel = tmp / '.env'
    sentinel.write_bytes(b'private-sentinel\n')
    result = subprocess.run([bash, (tmp / 'install.sh').as_posix()], env=env,
                            stdin=subprocess.DEVNULL, capture_output=True)
    assert result.returncode != 0 and sentinel.read_bytes() == b'private-sentinel\n'
    sentinel.unlink()
    result = subprocess.run([bash, (tmp / 'install.sh').as_posix()], env=env,
                            stdin=subprocess.DEVNULL, capture_output=True)
    assert result.returncode != 0 and not sentinel.exists()

    mock = tmp / 'bin'
    mock.mkdir()
    node = mock / 'node'
    node.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\nexit "${MOCK_EXIT:-0}"\n')
    node.chmod(0o755)
    env['PATH'] = str(mock) + os.pathsep + env['PATH']
    for service, first_arg in (
        ('schema', 'packages/database/node_modules/prisma/build/index.js'),
        ('web', 'apps/web/node_modules/next/dist/bin/next'),
        ('bot', 'apps/bot/dist/index.js')):
        env['SERVICE'] = service
        result = subprocess.run([sh, (root / 'docker-entrypoint.sh').as_posix()],
                                env=env, capture_output=True, text=True)
        assert result.returncode == 0 and result.stdout.splitlines()[0] == first_arg
        if service == 'schema':
            assert '--skip-generate' in result.stdout and '--accept-data-loss' not in result.stdout
    env['SERVICE'] = 'schema'
    env['MOCK_EXIT'] = '17'
    result = subprocess.run([sh, (root / 'docker-entrypoint.sh').as_posix()], env=env, capture_output=True)
    assert result.returncode == 17
    env['SERVICE'] = 'unknown'
    result = subprocess.run([sh, (root / 'docker-entrypoint.sh').as_posix()], env=env, capture_output=True)
    assert result.returncode == 1

installer = (root / 'install.sh').read_text()
assert 'read -rsp' in installer and 'set -o noclobber' in installer
assert installer.count('openssl rand -hex 32') == 2
assert '"$CONFIRM" != START' in installer
image = (root / 'Dockerfile').read_text()
assert 'pnpm install --frozen-lockfile' in image and 'USER node' in image
assert 'pnpm build' in image and 'corepack install --global pnpm@11.9.0' in image
print('Infrastructure checks OK (no deployment).')
PY
```

On Unix hosts with `pty`, the interactive installer can be tested in a temporary copy with a mocked `docker` command; do not use the actual checkout for tests that generate `.env`. Hidden input and initial creation are checked statically by the check above, not end-to-end.

These checks **do not prove** that the image builds/runs correctly, PostgreSQL initializes volumes, Prisma applies the schema or OAuth/Discord work. Builds, container smoke tests, Hadolint/Dockle/Trivy scans and Discord tests require separate tools/environment and authorization. Do not install scanners or run privileged containers as a side effect of this check.
