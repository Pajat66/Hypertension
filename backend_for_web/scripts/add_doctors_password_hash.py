"""
脚本: add_doctors_password_hash.py
用途：检查并为 `doctors` 和 `patients` 表添加 `password_hash` 列（如果不存在）。

用法：在命令行提供数据库连接参数或设置环境变量：

示例（命令行参数）:
    C:\Python\python.exe d:\Anew_file\hypertension_spa_full\miniapp\backend_for_web\scripts\add_doctors_password_hash.py --host 192.168.164.117 --port 3306 --user project --password Zbp42682600 --database hypertension_db

示例（环境变量）:
    set DB_HOST=192.168.164.117
    set DB_PORT=3306
    set DB_USER=project
    set DB_PASSWORD=Zbp42682600
    set DB_NAME=hypertension_db
    C:\Python\python.exe d:\Anew_file\hypertension_spa_full\miniapp\backend_for_web\scripts\add_doctors_password_hash.py

说明：
1) 脚本连接到指定数据库
2) 检查 `doctors.password_hash` 和 `patients.password_hash` 是否存在
3) 对于缺失的列执行 ALTER TABLE 添加（VARCHAR(255)）
4) 打印操作结果并退出

注意：在生产数据库上运行前请先备份。
"""

import os
import argparse
import pymysql
import re


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--host', default=os.environ.get('DB_HOST', '127.0.0.1'))
    p.add_argument('--port', type=int, default=int(os.environ.get('DB_PORT', 3306)))
    p.add_argument('--user', default=os.environ.get('DB_USER', 'root'))
    p.add_argument('--password', default=os.environ.get('DB_PASSWORD', 'Zbp42682600'))
    p.add_argument('--database', default=os.environ.get('DB_NAME', 'hypertension_db'))
    return p.parse_args()


def _valid_identifier(name):
    # 仅允许字母数字和下划线，防止注入
    return re.match(r'^[A-Za-z0-9_]+$', name) is not None


def column_exists(conn, database, table, column):
    with conn.cursor() as cur:
        sql = (
            "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
            "WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s AND COLUMN_NAME=%s"
        )
        cur.execute(sql, (database, table, column))
        res = cur.fetchone()
        return bool(res and res[0] > 0)


def add_column_if_missing(conn, database, table, column, definition):
    if not _valid_identifier(table) or not _valid_identifier(column):
        raise ValueError(f"Invalid table/column name: {table}.{column}")

    if column_exists(conn, database, table, column):
        print(f"列 {table}.{column} 已存在，跳过。")
        return False

    sql = f"ALTER TABLE `{table}` ADD COLUMN `{column}` {definition};"
    print(f"执行 SQL: {sql}")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    print(f"已为表 {table} 添加列 {column}。")
    return True


if __name__ == '__main__':
    args = parse_args()

    print(f"连接数据库 {args.user}@{args.host}:{args.port}/{args.database} ...")
    try:
        conn = pymysql.connect(host=args.host, port=args.port, user=args.user, password=args.password, db=args.database, charset='utf8mb4')
    except Exception as e:
        print(f"连接数据库失败: {e}")
        raise SystemExit(1)

    try:
        # 要检测并添加的表/列列表
        targets = [
            ('doctors', 'password_hash', 'VARCHAR(255)'),
            ('patients', 'password_hash', 'VARCHAR(255)')
        ]

        changed = False
        for table, column, definition in targets:
            try:
                changed |= add_column_if_missing(conn, args.database, table, column, definition)
            except Exception as e:
                print(f"对 {table}.{column} 操作失败: {e}")

        if not changed:
            print("无需更改：所有目标列已存在。")
        else:
            print("所有缺失列已尝试添加（如有）。")

    except Exception as e:
        print(f"操作失败: {e}")
        print("请手动检查数据库或备份后重试。")
    finally:
        try:
            conn.close()
        except:
            pass
