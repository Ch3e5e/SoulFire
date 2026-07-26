from __future__ import annotations

import base64
import contextlib
import hashlib
import hmac
import json
import os
import platform
import queue
import re
import shutil
import socket
import subprocess
import tarfile
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import zipfile
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT_USER_UUID = "00000000-0000-0000-0000-000000000000"
RELEASES_API = "https://api.github.com/repos/soulfiremc-com/SoulFire/releases"
DEFAULT_STARTUP_TIMEOUT = 120.0
ANSI_ESCAPE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


@dataclass(frozen=True)
class LocalSoulFireServer:
    base_url: str
    directory: Path
    jar_path: Path
    java_path: Path
    pid: int
    run_directory: Path
    version: str


@dataclass
class LocalServerHandle:
    info: LocalSoulFireServer
    token: str
    _process: subprocess.Popen[str]

    def close(self) -> None:
        if self._process.poll() is not None:
            return
        self._process.terminate()
        try:
            self._process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self._process.kill()
            self._process.wait()


def install_local_server(
    *,
    directory: str | os.PathLike[str] | None = None,
    version: str | None = None,
    java_args: Iterable[str] = (),
    port: int | None = None,
    startup_timeout: float = DEFAULT_STARTUP_TIMEOUT,
    on_log: Callable[[str], None] | None = None,
) -> LocalServerHandle:
    install_directory = Path(directory or ".soulfire").expanduser().resolve()
    install_directory.mkdir(parents=True, exist_ok=True)

    java_path = _ensure_jvm(install_directory / "jvm-25")
    release = _resolve_release(version)
    asset = _resolve_dedicated_asset(release, version)
    jar_path = install_directory / "jars" / asset["name"]
    _ensure_download(
        asset["browser_download_url"],
        jar_path,
        _require_sha256_digest(asset["digest"], "SoulFire release"),
    )

    run_directory = install_directory / "server"
    run_directory.mkdir(parents=True, exist_ok=True)
    selected_port = port if port is not None else _find_available_port()
    _validate_port(selected_port)

    process = subprocess.Popen(
        [
            str(java_path),
            *java_args,
            f"-Dsf.grpc.port={selected_port}",
            "-jar",
            str(jar_path),
        ],
        cwd=run_directory,
        env={
            **os.environ,
            "JAVA_HOME": str(_java_home(install_directory / "jvm-25")),
        },
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )

    try:
        _wait_for_server_ready(process, on_log, startup_timeout)
        secret_key = (run_directory / "secret-key.bin").read_bytes()
        base_url = f"http://127.0.0.1:{selected_port}"
        return LocalServerHandle(
            info=LocalSoulFireServer(
                base_url=base_url,
                directory=install_directory,
                jar_path=jar_path,
                java_path=java_path,
                pid=process.pid,
                run_directory=run_directory,
                version=release["tag_name"],
            ),
            token=_create_root_api_token(secret_key),
            _process=process,
        )
    except BaseException:
        _stop_process(process)
        raise


def _resolve_release(version: str | None) -> dict[str, Any]:
    requested_version = version.strip() if version is not None else None
    if version is not None and not requested_version:
        raise ValueError("SoulFire version must not be empty")

    endpoint = (
        f"{RELEASES_API}/latest"
        if requested_version is None
        else f"{RELEASES_API}/tags/{urllib.parse.quote(requested_version, safe='')}"
    )
    release = _read_json(endpoint, user_agent="soulfire-sdk-python")
    if not isinstance(release.get("tag_name"), str) or not isinstance(release.get("assets"), list):
        raise RuntimeError("SoulFire release metadata was incomplete")
    return release


def _resolve_dedicated_asset(
    release: dict[str, Any],
    requested_version: str | None,
) -> dict[str, str]:
    expected_name = (
        f"SoulFireDedicated-{requested_version.strip()}.jar"
        if requested_version is not None
        else f"SoulFireDedicated-{release['tag_name']}.jar"
    )
    assets = release["assets"]
    asset = next(
        (
            candidate
            for candidate in assets
            if isinstance(candidate, dict) and candidate.get("name") == expected_name
        ),
        None,
    )
    if asset is None:
        asset = next(
            (
                candidate
                for candidate in assets
                if isinstance(candidate, dict)
                and re.fullmatch(
                    r"SoulFireDedicated-.+\.jar",
                    str(candidate.get("name", "")),
                )
            ),
            None,
        )

    required_fields = ("browser_download_url", "digest", "name")
    if not isinstance(asset, dict) or not all(
        isinstance(asset.get(field), str) and asset[field] for field in required_fields
    ):
        raise RuntimeError(
            f"SoulFire release {release['tag_name']} has no verified dedicated server JAR"
        )
    return {field: asset[field] for field in required_fields}


def _ensure_jvm(jvm_directory: Path) -> Path:
    java_path = _java_home(jvm_directory) / "bin" / _java_executable()
    if java_path.is_file():
        return java_path

    metadata_url = (
        "https://api.adoptium.net/v3/assets/latest/25/hotspot"
        f"?architecture={_detect_architecture()}"
        f"&image_type=jre&os={_detect_os()}&vendor=eclipse"
    )
    releases = _read_json(metadata_url, user_agent="soulfire-sdk-python")
    try:
        release = releases[0]
        package = release["binary"]["package"]
        checksum = package["checksum"]
        download_url = package["link"]
        release_name = release["release_name"]
    except (IndexError, KeyError, TypeError) as error:
        raise RuntimeError("JVM metadata was incomplete") from error
    metadata_values = (checksum, download_url, release_name)
    if not all(isinstance(value, str) and value for value in metadata_values):
        raise RuntimeError("JVM metadata was incomplete")

    jvm_directory.parent.mkdir(parents=True, exist_ok=True)
    temporary_root = Path(tempfile.mkdtemp(prefix=".jvm-25-", dir=jvm_directory.parent))
    archive_path = temporary_root.with_suffix(".download")
    try:
        _download_file(download_url, archive_path, checksum.lower())
        _extract_archive(archive_path, temporary_root, download_url)
        extracted_jvm = temporary_root / f"{release_name}-jre"
        extracted_java = _java_home(extracted_jvm) / "bin" / _java_executable()
        if not extracted_java.is_file():
            raise RuntimeError("Extracted JVM is missing the Java executable")

        if jvm_directory.exists():
            shutil.rmtree(jvm_directory)
        extracted_jvm.replace(jvm_directory)
    finally:
        archive_path.unlink(missing_ok=True)
        shutil.rmtree(temporary_root, ignore_errors=True)

    return java_path


def _ensure_download(url: str, destination: Path, checksum: str) -> None:
    if destination.is_file() and _sha256_file(destination) == checksum:
        return

    destination.parent.mkdir(parents=True, exist_ok=True)
    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{destination.name}-",
        suffix=".download",
        dir=destination.parent,
    )
    os.close(file_descriptor)
    temporary_path = Path(temporary_name)
    temporary_path.unlink()
    try:
        _download_file(url, temporary_path, checksum)
        temporary_path.replace(destination)
    finally:
        temporary_path.unlink(missing_ok=True)


def _download_file(url: str, destination: Path, checksum: str) -> None:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "soulfire-sdk-python"},
    )
    digest = hashlib.sha256()
    with urllib.request.urlopen(request) as response, destination.open("xb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
            digest.update(chunk)
        output.flush()
        os.fsync(output.fileno())

    if not hmac.compare_digest(digest.hexdigest(), checksum.lower()):
        raise RuntimeError("Downloaded file checksum verification failed")


def _read_json(url: str, *, user_agent: str) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": user_agent,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            return json.load(response)
    except OSError as error:
        raise RuntimeError(f"Failed to fetch metadata from {url}") from error


def _extract_archive(archive_path: Path, destination: Path, download_url: str) -> None:
    if download_url.endswith(".zip"):
        with zipfile.ZipFile(archive_path) as archive:
            _validate_archive_paths(destination, (entry.filename for entry in archive.infolist()))
            archive.extractall(destination)
        return
    if download_url.endswith(".tar.gz"):
        with tarfile.open(archive_path, "r:gz") as archive:
            members = archive.getmembers()
            _validate_archive_paths(destination, (entry.name for entry in members))
            _validate_tar_links(destination, members)
            archive.extractall(destination)
        return
    raise RuntimeError("Unsupported JVM archive type")


def _validate_archive_paths(destination: Path, entries: Iterable[str]) -> None:
    resolved_destination = destination.resolve()
    for entry in entries:
        target = (destination / entry).resolve()
        if not target.is_relative_to(resolved_destination):
            raise RuntimeError("JVM archive contains an unsafe path")


def _validate_tar_links(destination: Path, members: Iterable[tarfile.TarInfo]) -> None:
    resolved_destination = destination.resolve()
    for member in members:
        if member.issym():
            target = (destination / member.name).parent / member.linkname
        elif member.islnk():
            target = destination / member.linkname
        else:
            continue
        if not target.resolve().is_relative_to(resolved_destination):
            raise RuntimeError("JVM archive contains an unsafe link")


def _wait_for_server_ready(
    process: subprocess.Popen[str],
    on_log: Callable[[str], None] | None,
    startup_timeout: float,
) -> None:
    if not isinstance(startup_timeout, (int, float)) or startup_timeout <= 0:
        raise ValueError("startup_timeout must be positive")
    if process.stdout is None:
        raise RuntimeError("SoulFire process output is unavailable")

    result: queue.Queue[tuple[str, int | None]] = queue.Queue(maxsize=1)

    def read_output() -> None:
        ready = False
        for raw_line in process.stdout:
            line = ANSI_ESCAPE.sub("", raw_line).strip()
            if not line:
                continue
            if on_log is not None:
                with contextlib.suppress(Exception):
                    on_log(line)
            if not ready and "Finished loading!" in line:
                ready = True
                result.put(("ready", None))
        if not ready:
            result.put(("exit", process.poll()))

    threading.Thread(
        target=read_output,
        name="soulfire-server-output",
        daemon=True,
    ).start()
    try:
        status, exit_code = result.get(timeout=startup_timeout)
    except queue.Empty as error:
        raise TimeoutError(
            f"SoulFire did not finish loading within {startup_timeout:g} seconds"
        ) from error
    if status == "exit":
        raise RuntimeError(f"SoulFire exited before finishing loading (exit code {exit_code})")


def _stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def _create_root_api_token(secret_key: bytes) -> str:
    issued_at = int(time.time())
    header = _base64url_json({"alg": "HS256", "typ": "JWT"})
    claims = _base64url_json(
        {
            "aud": ["api"],
            "iat": issued_at,
            "sub": ROOT_USER_UUID,
        }
    )
    unsigned_token = f"{header}.{claims}"
    signature = base64.urlsafe_b64encode(
        hmac.new(secret_key, unsigned_token.encode(), hashlib.sha256).digest()
    ).rstrip(b"=")
    return f"{unsigned_token}.{signature.decode()}"


def _base64url_json(value: dict[str, Any]) -> str:
    serialized = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(serialized).rstrip(b"=").decode()


def _require_sha256_digest(digest: str, label: str) -> str:
    match = re.fullmatch(r"sha256:([a-fA-F0-9]{64})", digest)
    if match is None:
        raise RuntimeError(f"{label} did not include a SHA-256 digest")
    return match.group(1).lower()


def _sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _detect_architecture() -> str:
    architecture = platform.machine().lower()
    mapping = {
        "aarch64": "aarch64",
        "amd64": "x64",
        "arm64": "aarch64",
        "i386": "x32",
        "i686": "x32",
        "ppc64": "ppc64",
        "ppc64le": "ppc64",
        "riscv64": "riscv64",
        "s390x": "s390x",
        "x86": "x32",
        "x86_64": "x64",
    }
    try:
        return mapping[architecture]
    except KeyError as error:
        raise RuntimeError(f"Unsupported architecture: {architecture}") from error


def _detect_os() -> str:
    operating_system = platform.system().lower()
    mapping = {
        "darwin": "mac",
        "linux": "linux",
        "windows": "windows",
    }
    try:
        return mapping[operating_system]
    except KeyError as error:
        raise RuntimeError(f"Unsupported operating system: {operating_system}") from error


def _java_executable() -> str:
    return "java.exe" if platform.system() == "Windows" else "java"


def _java_home(jvm_directory: Path) -> Path:
    if platform.system() == "Darwin":
        return jvm_directory / "Contents" / "Home"
    return jvm_directory


def _find_available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        return int(server.getsockname()[1])


def _validate_port(port: int) -> None:
    if isinstance(port, bool) or not isinstance(port, int) or not 1 <= port <= 65_535:
        raise ValueError("port must be an integer between 1 and 65535")
