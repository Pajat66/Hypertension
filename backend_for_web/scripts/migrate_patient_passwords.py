"""
migrate_patient_passwords.py
用途：批量迁移 patients 表中明文密码（如果存在列 `password`）到 `password_hash`（werkzeug generate_password_hash）。

注意：
- 如果数据库中只有 MD5 值（32 字符 hex），无法无损转换为明文再哈希，本脚本不会尝试用 MD5 值直接替换（那会破坏密码）。
- 强烈建议先备份数据库。

用法示例：
    C:\Python\python.exe migrate_patient_passwords.py --host 192.168.164.117 --port 3306 --user project --password Zbp42682600 --database hypertension_db

输出：会列出检测到的列、样本统计，并在发现 `password` 明文列时按用户替换到 `password_hash`（除非使用 --dry-run）。
"""
import os
import argparse
import pymysql
import re
from werkzeug.security import generate_password_hash


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--host', default=os.environ.get('DB_HOST', '127.0.0.1'))
    p.add_argument('--port', type=int, default=int(os.environ.get('DB_PORT', 3306)))
    p.add_argument('--user', default=os.environ.get('DB_USER', 'root'))
    p.add_argument('--password', default=os.environ.get('DB_PASSWORD', 'Zbp42682600'))
    p.add_argument('--database', default=os.environ.get('DB_NAME', 'hypertension_db'))
    p.add_argument('--dry-run', action='store_true', help='只打印将要执行的操作，不提交更改')
    return p.parse_args()


def get_columns(conn, database, table):
    with conn.cursor() as cur:
        cur.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s", (database, table))
        return [r[0] for r in cur.fetchall()]


def inspect_and_migrate(conn, database, dry_run=False):
    table = 'patients'
    cols = get_columns(conn, database, table)
    print(f"表 {table} 的列: {cols}")

    has_plain = 'password' in cols
    has_hash = 'password_hash' in cols

    if not has_hash:
        print("警告：表中不存在 `password_hash` 列，请先确认或使用 add_doctors_password_hash.py 添加。")

    # 统计样本
    with conn.cursor() as cur:
        select_cols = ['user_id', 'phone']
        if has_plain:
            select_cols.append('password')
        if has_hash:
            select_cols.append('password_hash')
        cur.execute(f"SELECT {', '.join(select_cols)} FROM {table} LIMIT 1000")
        rows = cur.fetchall()

    md5_re = re.compile(r'^[A-Fa-f0-9]{32}$')
    cnt_plain = 0
    cnt_hash = 0
    cnt_md5 = 0
    cnt_empty = 0
    sample_md5 = []

    for row in rows:
        # map by index
        mapping = dict(zip(select_cols, row))
        ph = mapping.get('password_hash')
        pp = mapping.get('password')

        if ph:
            cnt_hash += 1
        if pp:
            cnt_plain += 1
        if pp and md5_re.match(pp):
            cnt_md5 += 1
            if len(sample_md5) < 5:
                sample_md5.append((mapping.get('user_id'), mapping.get('phone'), pp))
        if not ph and not pp:
            cnt_empty += 1

    print(f"样本统计 (最多1000行)：password_hash 存在: {cnt_hash}, password(明文) 存在: {cnt_plain}, MD5 样本: {cnt_md5}, 无密码样本: {cnt_empty}")
    if sample_md5:
        print("MD5 样例（user_id, phone, md5）:")
        for s in sample_md5:
            print(s)

    # 如果存在明文 password，则可以批量迁移
    if has_plain:
        print('\n开始批量迁移明文 password -> password_hash')
        if dry_run:
            print('dry-run: 不会提交任何更改')
            return

        with conn.cursor() as cur:
            cur.execute(f"SELECT user_id, password FROM {table} WHERE password IS NOT NULL AND password != ''")
            to_migrate = cur.fetchall()

            print(f"发现 {len(to_migrate)} 条需要迁移的记录")
            for user_id, plain in to_migrate:
                new_hash = generate_password_hash(plain)
                cur.execute(f"UPDATE {table} SET password_hash=%s WHERE user_id=%s", (new_hash, user_id))
        conn.commit()
        print('批量迁移完成：已将明文密码写入 password_hash。')
    else:
        print('\n未发现明文 password 列，无法批量升级 MD5（需要用户登录触发升级）。')
        print('建议：让用户通过登录触发自动升级，或手动与用户确认密码然后用脚本设置。')


if __name__ == '__main__':
    args = parse_args()
    print(f"连接数据库 {args.user}@{args.host}:{args.port}/{args.database} ...")
    try:
        conn = pymysql.connect(host=args.host, port=args.port, user=args.user, password=args.password, db=args.database, charset='utf8mb4', autocommit=False)
    except Exception as e:
        print(f"连接数据库失败: {e}")
        raise SystemExit(1)

    try:
        inspect_and_migrate(conn, args.database, dry_run=args.dry_run)
    finally:
        try:
            conn.close()
        except:
            pass
