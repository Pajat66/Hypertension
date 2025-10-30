#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试后端服务器是否正常运行
"""
import requests
import time

def test_server():
    """测试服务器连接"""
    base_url = "http://192.168.150.117:5000"
    
    print("=== 测试后端服务器连接 ===")
    print(f"测试地址: {base_url}")
    
    # 测试健康检查
    try:
        print("\n1. 测试健康检查...")
        response = requests.get(f"{base_url}/api/healthz", timeout=5)
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.json()}")
        if response.status_code == 200:
            print("✅ 健康检查通过")
        else:
            print("❌ 健康检查失败")
    except Exception as e:
        print(f"❌ 健康检查失败: {e}")
    
    # 测试医生登录
    try:
        print("\n2. 测试医生登录...")
        response = requests.post(
            f"{base_url}/api/doctors/login",
            json={"phone": "13700000001", "password": "0001"},
            timeout=5
        )
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.json()}")
        if response.status_code == 200:
            print("✅ 医生登录测试通过")
        else:
            print("❌ 医生登录测试失败")
    except Exception as e:
        print(f"❌ 医生登录测试失败: {e}")
    
    # 测试患者登录
    try:
        print("\n3. 测试患者登录...")
        response = requests.post(
            f"{base_url}/api/patients/login",
            json={"phone": "13800000001", "password": "0001"},
            timeout=5
        )
        print(f"状态码: {response.status_code}")
        print(f"响应: {response.json()}")
        if response.status_code == 200:
            print("✅ 患者登录测试通过")
        else:
            print("❌ 患者登录测试失败")
    except Exception as e:
        print(f"❌ 患者登录测试失败: {e}")

if __name__ == "__main__":
    test_server()
