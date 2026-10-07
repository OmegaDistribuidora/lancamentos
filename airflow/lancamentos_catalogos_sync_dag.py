from __future__ import annotations

import os
import subprocess
from datetime import timedelta

import pendulum
from airflow import DAG
from airflow.exceptions import AirflowException
from airflow.providers.standard.operators.python import PythonOperator
from airflow.sdk.bases.hook import BaseHook


APP_WIN = os.getenv("LANCAMENTOS_APP_WIN", r"C:\Repos\lancamentos")
APP_LINUX = os.getenv("LANCAMENTOS_APP_LINUX", "/mnt/c/Repos/lancamentos")
PYTHON_WIN = os.getenv(
    "LANCAMENTOS_SYNC_PYTHON",
    "/mnt/c/Users/POWERBI/OneDrive - omegadistribuidora.com.br/Projetos/Projetos/Transf_Dados/venv_transf/Scripts/python.exe",
)
LOCAL_TZ = pendulum.timezone("America/Sao_Paulo")


def _decode(content: bytes) -> str:
    for encoding in ("utf-8", "cp1252", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def _oracle_env(connection_id: str, prefix: str) -> dict[str, str]:
    connection = BaseHook.get_connection(connection_id)
    service = connection.schema or str((connection.extra_dejson or {}).get("service_name") or "")
    if not connection.host or not connection.login or not connection.password or not service:
        raise AirflowException(f"Conexão {connection_id} incompleta.")
    return {
        f"{prefix}_HOST": connection.host,
        f"{prefix}_PORT": str(connection.port or 1521),
        f"{prefix}_SERVICE": service,
        f"{prefix}_USER": connection.login,
        f"{prefix}_PASSWORD": connection.password,
    }


def _sincronizar() -> None:
    destino = BaseHook.get_connection("lancamentos_catalog_sync")
    if not destino.host or not destino.password:
        raise AirflowException("Conexão lancamentos_catalog_sync incompleta.")
    env = os.environ.copy()
    env.update(_oracle_env("lancamentos_oracle_filial", "ORACLE_FILIAL"))
    env.update(_oracle_env("lancamentos_oracle_matriz", "ORACLE_MATRIZ"))
    env.update({
        "LANCAMENTOS_API_URL": destino.host.rstrip("/"),
        "LANCAMENTOS_CATALOG_SYNC_TOKEN": destino.password,
        "PYTHONUNBUFFERED": "1",
        "TZ": "America/Sao_Paulo",
    })
    forwarded = [item for item in env.get("WSLENV", "").split(":") if item]
    forwarded_names = {item.split("/", 1)[0] for item in forwarded}
    for name in [key for key in env if key.startswith(("ORACLE_FILIAL_", "ORACLE_MATRIZ_", "LANCAMENTOS_"))] + ["PYTHONUNBUFFERED", "TZ"]:
        if name not in forwarded_names:
            forwarded.append(f"{name}/w")
    env["WSLENV"] = ":".join(forwarded)
    script_win = rf"{APP_WIN}\scripts\sincronizar_catalogos.py"
    result = subprocess.run(
        [PYTHON_WIN, script_win],
        cwd=APP_LINUX,
        env=env,
        capture_output=True,
        check=False,
    )
    stdout, stderr = _decode(result.stdout), _decode(result.stderr)
    if stdout.strip():
        print(stdout.strip())
    if stderr.strip():
        print(stderr.strip())
    if result.returncode:
        raise AirflowException(f"Sincronização dos catálogos falhou (exit code {result.returncode}).")


with DAG(
    dag_id="lancamentos_catalogos_sync",
    description="Sincroniza PCGRUPO e PCCONTA da filial e da matriz com o Lançamentos.",
    default_args={
        "owner": "omega",
        "depends_on_past": False,
        "email_on_failure": False,
        "email_on_retry": False,
        "retries": 2,
        "retry_delay": timedelta(minutes=5),
    },
    start_date=pendulum.datetime(2026, 10, 6, 0, 0, tz=LOCAL_TZ),
    schedule="17 * * * *",
    catchup=False,
    max_active_runs=1,
    dagrun_timeout=timedelta(minutes=15),
    is_paused_upon_creation=False,
    tags=["omega", "lancamentos", "oracle", "catalogos"],
) as dag:
    sincronizar_catalogos = PythonOperator(
        task_id="sincronizar_catalogos_se_houver_mudancas",
        python_callable=_sincronizar,
        execution_timeout=timedelta(minutes=10),
    )
