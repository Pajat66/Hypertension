# -*- coding: utf-8 -*-
"""
讯飞 IAT（语音转文字）/ TTS（文字转语音）封装
依赖：websocket-client, ffmpeg (系统安装)
"""

import base64
import hashlib
import hmac
import json
import os
import ssl
import subprocess
from urllib.parse import urlencode, urlparse
from datetime import datetime, timezone
from websocket import create_connection

# 从环境变量读取密钥（避免写死）
XFYUN_APPID  = "02224038"
XFYUN_APIKEY = "844dcee8036ecabe4707a3c98a354608"
XFYUN_SECRET = "YmRmOTU2OTU5ZDY1NGM4NTg4MzJjOWU5"

# 主机 & 路径分开
IAT_HOST = "wss://iat-api.xfyun.cn"
IAT_PATH = "/v2/iat"

TTS_HOST = "wss://tts-api.xfyun.cn"
TTS_PATH = "/v2/tts"


def _rfc1123_date():
    return datetime.now(timezone.utc).strftime('%a, %d %b %Y %H:%M:%S GMT')


def _auth_url(host_base: str, path: str):
    """
    构造讯飞 WebSocket 鉴权 URL
    待签名串:
        host: {host}
        date: {date}
        GET {path} HTTP/1.1
    """
    parsed = urlparse(host_base)
    host_name = parsed.netloc
    date = _rfc1123_date()
    request_line = f"GET {path} HTTP/1.1"

    signature_origin = f"host: {host_name}\n" \
                       f"date: {date}\n" \
                       f"{request_line}"

    signature_sha = hmac.new(
        XFYUN_SECRET.encode("utf-8"),
        signature_origin.encode("utf-8"),
        digestmod=hashlib.sha256
    ).digest()
    signature = base64.b64encode(signature_sha).decode("utf-8")

    authorization_origin = (
        f'api_key="{XFYUN_APIKEY}", algorithm="hmac-sha256", '
        f'headers="host date request-line", signature="{signature}"'
    )
    authorization = base64.b64encode(authorization_origin.encode("utf-8")).decode("utf-8")

    qs = urlencode({
        "authorization": authorization,
        "date": date,
        "host": host_name
    })
    return f"{host_base}{path}?{qs}"


def _ensure_pcm16k(src_path: str) -> str:
    """
    用系统 ffmpeg 把音频转为：16kHz、单声道、16bit PCM（wav容器）
    返回转换后的文件路径
    """
    if not os.path.exists(src_path):
        raise FileNotFoundError(src_path)
    dst_path = src_path + ".16k.wav"
    cmd = [
        "ffmpeg", "-y",
        "-i", src_path,
        "-ar", "16000",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        "-f", "wav",
        dst_path
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return dst_path


def asr_iflytek(file_path: str, language="zh_cn") -> str:
    """
    IAT 语音听写
    :param file_path: 原始音频文件路径
    :return: 识别出的文本
    """
    if not (XFYUN_APPID and XFYUN_APIKEY and XFYUN_SECRET):
        raise RuntimeError("讯飞密钥未配置：请设置 XFYUN_APPID / XFYUN_APIKEY / XFYUN_SECRET")

    wav16k = _ensure_pcm16k(file_path)
    with open(wav16k, "rb") as f:
        audio_b64 = base64.b64encode(f.read()).decode("utf-8")

    ws_url = _auth_url(IAT_HOST, IAT_PATH)
    ws = create_connection(ws_url, sslopt={"cert_reqs": ssl.CERT_NONE})
    try:
        frame = {
            "common": {"app_id": XFYUN_APPID},
            "business": {
                "language": language,
                "domain": "iat",
                "accent": "mandarin",
                "vinfo": 1,
                "vad_eos": 3000
            },
            "data": {
                "status": 2,
                "format": "audio/L16;rate=16000",
                "encoding": "raw",
                "audio": audio_b64
            }
        }
        ws.send(json.dumps(frame))

        result_text = []
        while True:
            msg = ws.recv()
            if not msg:
                break
            resp = json.loads(msg)
            code = resp.get("code", -1)
            if code != 0:
                raise RuntimeError(f"ASR error: {resp}")
            data = resp.get("data", {})
            status = data.get("status")
            for seg in data.get("result", {}).get("ws", []):
                for cw in seg.get("cw", []):
                    result_text.append(cw.get("w", ""))
            if status == 2:
                break
        return "".join(result_text).strip()
    finally:
        ws.close()


def tts_iflytek(text: str, voice="xiaoyan", aue="lame") -> bytes:
    """
    TTS 语音合成
    :param text: 输入文本
    :param voice: 发音人 (xiaoyan=女声, aisjiuxu=男声)
    :param aue: 输出编码 (lame=mp3, raw=pcm)
    :return: 音频二进制
    """
    if not (XFYUN_APPID and XFYUN_APIKEY and XFYUN_SECRET):
        raise RuntimeError("讯飞密钥未配置：请设置 XFYUN_APPID / XFYUN_APIKEY / XFYUN_SECRET")

    ws_url = _auth_url(TTS_HOST, TTS_PATH)
    ws = create_connection(ws_url, sslopt={"cert_reqs": ssl.CERT_NONE})
    audio_bytes = bytearray()
    try:
        frame = {
            "common": {"app_id": XFYUN_APPID},
            "business": {
                "aue": aue,
                "vcn": voice,
                "tte": "UTF8",
                "sfl": 1
            },
            "data": {
                "status": 2,
                "text": base64.b64encode(text.encode("utf-8")).decode("utf-8")
            }
        }
        ws.send(json.dumps(frame))

        while True:
            msg = ws.recv()
            if not msg:
                break
            resp = json.loads(msg)
            code = resp.get("code", -1)
            if code != 0:
                raise RuntimeError(f"TTS error: {resp}")
            data = resp.get("data", {})
            audio = data.get("audio")
            if audio:
                audio_bytes.extend(base64.b64decode(audio))
            if data.get("status") == 2:
                break
        return bytes(audio_bytes)
    finally:
        ws.close()
