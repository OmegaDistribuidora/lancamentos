"""Sincroniza os catálogos WinThor com o Lançamentos por uma API idempotente."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import oracledb


def obrigatoria(nome: str) -> str:
    valor = os.environ.get(nome, "").strip()
    if not valor:
        raise RuntimeError(f"Variável obrigatória ausente: {nome}")
    return valor


def iniciar_cliente() -> None:
    lib = os.environ.get("ORACLE_CLIENT_LIB", r"C:\oracle\instantclient_21_19")
    if Path(lib).is_dir():
        try:
            oracledb.init_oracle_client(lib_dir=lib)
        except oracledb.Error:
            pass


def extrair(prefixo: str) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    host = obrigatoria(f"{prefixo}_HOST")
    porta = int(os.environ.get(f"{prefixo}_PORT", "1521"))
    servico = obrigatoria(f"{prefixo}_SERVICE")
    usuario = obrigatoria(f"{prefixo}_USER")
    senha = obrigatoria(f"{prefixo}_PASSWORD")
    dsn = oracledb.makedsn(host, porta, service_name=servico)
    with oracledb.connect(user=usuario, password=senha, dsn=dsn) as connection:
        connection.call_timeout = 30_000
        with connection.cursor() as cursor:
            cursor.execute("select CODGRUPO, GRUPO from PCGRUPO order by CODGRUPO")
            grupos = [
                {"codigo": str(codigo).strip(), "nome": str(nome or "").strip()}
                for codigo, nome in cursor.fetchall()
            ]
            cursor.execute("select CODCONTA, CONTA, GRUPOCONTA from PCCONTA order by CODCONTA")
            contas = [
                {
                    "codigo": str(codigo).strip(),
                    "nome": str(nome or "").strip(),
                    "grupoCodigo": str(grupo).strip(),
                }
                for codigo, nome, grupo in cursor.fetchall()
            ]
    grupos_validos = {item["codigo"] for item in grupos}
    invalidas = [item["codigo"] for item in contas if item["grupoCodigo"] not in grupos_validos]
    if invalidas:
        raise RuntimeError(f"Contas apontam para grupos inexistentes: {', '.join(invalidas[:20])}")
    return grupos, contas


def enviar(catalogo: str, grupos: list[dict[str, str]], contas: list[dict[str, str]]) -> dict:
    base_url = obrigatoria("LANCAMENTOS_API_URL").rstrip("/")
    token = obrigatoria("LANCAMENTOS_CATALOG_SYNC_TOKEN")
    corpo = json.dumps({"catalogo": catalogo, "grupos": grupos, "contas": contas}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/api/integracoes/catalogos/sincronizar",
        data=corpo,
        method="POST",
        headers={"Content-Type": "application/json", "X-Catalog-Sync-Token": token},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detalhe = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API recusou {catalogo}: HTTP {error.code} - {detalhe[:500]}") from error


def main() -> None:
    iniciar_cliente()
    for catalogo, prefixo in (("FILIAL", "ORACLE_FILIAL"), ("MATRIZ", "ORACLE_MATRIZ")):
        grupos, contas = extrair(prefixo)
        resultado = enviar(catalogo, grupos, contas)
        print(json.dumps(resultado, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Falha na sincronização: {error}", file=sys.stderr)
        raise
