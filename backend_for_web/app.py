# app.py
# -*- coding: utf-8 -*-
import os
import re
import uuid
from typing import Optional, Tuple
from datetime import datetime, timezone

from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
from models import db, Patient, Doctor, BpRecord, Medicine, DocMsg, Reminder, ChatMessage, GenderEnum, MethodEnum, PlanTypeEnum, ChannelEnum

# 讯飞 ASR/TTS（无 pydub 版，基于 ffmpeg 转码）
# 文件需与 app.py 
from tts import asr_iflytek, tts_iflytek


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        # 更换网络时记得改 IP
        "mysql+pymysql://project:Zbp42682600@192.168.150.117:3306/hypertension_db?charset=utf8mb4"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False


def create_app():
    app = Flask(__name__, static_folder="static", static_url_path="/")
    app.config.from_object(Config)

    # 仅放开 /api/* 的跨域
    FRONTEND_ORIGINS = os.environ.get(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,https://your-frontend.com"
    )
    origins = [o.strip() for o in FRONTEND_ORIGINS.split(",") if o.strip()]
    CORS(app, resources={r"/api/*": {"origins": origins}}, supports_credentials=False)

    db.init_app(app)

    static_dir = os.path.join(app.root_path, "static")
    os.makedirs(static_dir, exist_ok=True)

  
    # 小工具：从中文里解析血压/心率

    def parse_bp(text: str) -> Tuple[Optional[int], Optional[int], Optional[int]]:
        """
        返回 (systolic, diastolic, pulse)
        可识别的范式：
          - "120 80" (两个数字，空格分隔，自动大数为大压，小数为小压)
          - "高压120 低压80 心率70 / 脉搏70"
          - "收缩压120 舒张压80"
          - "120/80 心率70"
          - "高压一百二" 这种中文数字这里不处理（可后续扩展）
        """
        if not text:
            return None, None, None

        # 提取所有数字
        numbers = re.findall(r"\d{2,3}", text)
        
        # 如果只有两个数字，且格式为 "数字 数字" 或 "数字/数字"
        if len(numbers) == 2:
            num1, num2 = int(numbers[0]), int(numbers[1])
            # 自动确定大压和小压
            systolic = max(num1, num2)
            diastolic = min(num1, num2)
            # 验证合理性
            if 50 <= systolic <= 250 and 40 <= diastolic <= 150 and systolic >= diastolic:
                return systolic, diastolic, None

        # 120/80 或 120-80
        m = re.search(r"(\d{2,3})\s*[/\-]\s*(\d{2,3})", text)
        if m:
            sys_v = int(m.group(1))
            dia_v = int(m.group(2))
            # 心率(脉搏)
            pulse = None
            p = re.search(r"(心率|脉搏)[^\d]{0,3}(\d{2,3})", text)
            if p:
                pulse = int(p.group(2))
            return sys_v, dia_v, pulse

        # 高压 / 低压
        sys_v = None
        dia_v = None
        p1 = re.search(r"(高压|收缩压)[^\d]{0,3}(\d{2,3})", text)
        if p1:
            sys_v = int(p1.group(2))
        p2 = re.search(r"(低压|舒张压)[^\d]{0,3}(\d{2,3})", text)
        if p2:
            dia_v = int(p2.group(2))
        p3 = re.search(r"(心率|脉搏)[^\d]{0,3}(\d{2,3})", text)
        pulse = int(p3.group(2)) if p3 else None

        return sys_v, dia_v, pulse


    # 健康检查 / 示例
  
    @app.route("/api/healthz")
    def healthz():
        return jsonify({"ok": True})

    @app.route("/api/ping")
    def ping():
        return jsonify({"message": "pong"})

    @app.route("/api/patients")
    def patients():
        data = [p.to_dict() for p in Patient.query.order_by(Patient.user_id.desc()).all()]
        return jsonify(data)

    # 语音转文字（讯飞 IAT）
 
    @app.route("/api/voice2text", methods=["POST"])
    def voice2text():
        """
        小程序用 wx.uploadFile 上传录音文件（mp3/wav/aac）
        这里保存到 static/ 临时文件，然后走讯飞 IAT 做识别
        返回：{"text": "...识别结果..."}
        """
        file = request.files.get("file")
        if not file:
            return jsonify({"error": "no file"}), 400

        # 保存上传文件
        upload_path = os.path.join(static_dir, f"upload-{uuid.uuid4().hex}.mp3")
        file.save(upload_path)

        text = ""
        try:
            text = asr_iflytek(upload_path)  # 讯飞识别（内部自动 ffmpeg 转成 16k PCM）
            return jsonify({"text": text or ""})
        except Exception as e:
            print("ASR失败：", e)
            return jsonify({"error": "asr_fail", "detail": str(e)}), 500
        finally:
            # 识别完成后清理本次上传文件及转换产生的临时文件，避免占用空间
            try:
                if os.path.exists(upload_path):
                    os.remove(upload_path)
            except Exception:
                pass
            try:
                pcm16k_path = upload_path + ".16k.wav"
                if os.path.exists(pcm16k_path):
                    os.remove(pcm16k_path)
            except Exception:
                pass

   
    # 文本转语音（讯飞 TTS）
   
    @app.route("/api/speak", methods=["POST"])
    def speak():
        """
        前端 POST: {"text":"要朗读的内容"}
        返回：{"audio_url": "/static/tts-xxxx.mp3"}
        """
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        if not text:
            return jsonify({"error": "text is required"}), 400

        try:
            audio_bytes = tts_iflytek(text, voice="xiaoyan", aue="lame")  # mp3
            filename = f"tts-{uuid.uuid4().hex}.mp3"
            out_path = os.path.join(static_dir, filename)
            with open(out_path, "wb") as f:
                f.write(audio_bytes)
            return jsonify({"audio_url": f"/static/{filename}"})
        except Exception as e:
            print("TTS失败：", e)
            return jsonify({"error": "tts_fail", "detail": str(e)}), 500

    
    # 保存测量（解析文本 -> 入库）

    @app.route("/api/save_measure", methods=["POST"])
    def save_measure():
        """
        前端提交识别到的文本，后端尝试解析"收缩压/舒张压/心率"，入库 BpRecord。
        返回保存结果与解析出的数值（可能为空）。
        """
        data = request.get_json(silent=True) or {}
        raw_text = (data.get("text") or "").strip()
        user_id = data.get("user_id")  # 新增：获取用户ID

        # 取得一个患者（没有则创建一个演示用）
        if user_id:
            patient = Patient.query.filter_by(user_id=user_id).first()
        else:
            patient = Patient.query.order_by(Patient.user_id.asc()).first()
        
        if not patient:
            patient = Patient(
                name="示例患者", 
                gender=GenderEnum.U, 
                phone="13800000000",
                village="示例村"
            )
            db.session.add(patient)
            db.session.commit()

        systolic, diastolic, pulse = parse_bp(raw_text)

        bp_record = BpRecord(
            user_id=patient.user_id,
            systolic=systolic,
            diastolic=diastolic,
            heart_rate=pulse,
            method=MethodEnum.SELF_REPORT,
            measured_at=datetime.now(timezone.utc)
        )
        db.session.add(bp_record)
        db.session.commit()

        return jsonify({
            "ok": True,
            "record_id": bp_record.record_id,
            "user_id": patient.user_id,
            "parsed": {"systolic": systolic, "diastolic": diastolic, "heart_rate": pulse},
            "raw_text": raw_text
        })

    # 添加患者注册API
    @app.route("/api/patients", methods=["POST"])
    def create_patient():
        """创建新患者"""
        data = request.get_json(silent=True) or {}
        
        patient = Patient(
            username=data.get("username"),
            phone=data.get("phone"),
            name=data.get("name"),
            id_card=data.get("id_card"),
            gender=GenderEnum(data.get("gender", "U")),
            dob=datetime.strptime(data.get("dob"), "%Y-%m-%d").date() if data.get("dob") else None,
            village=data.get("village"),
            dialect=data.get("dialect"),
            height_cm=data.get("height_cm"),
            weight_kg=data.get("weight_kg"),
            chronic_history=data.get("chronic_history")
        )
        
        db.session.add(patient)
        db.session.commit()
        
        return jsonify({"ok": True, "patient": patient.to_dict()})

    # 添加血压记录查询API
    @app.route("/api/patients/<int:user_id>/bp_records")
    def get_bp_records(user_id):
        """获取患者的血压记录"""
        records = BpRecord.query.filter_by(user_id=user_id).order_by(BpRecord.measured_at.desc()).all()
        return jsonify([r.to_dict() for r in records])

    # 添加用药记录API
    @app.route("/api/patients/<int:user_id>/medicines")
    def get_medicines(user_id):
        """获取患者的用药记录"""
        medicines = Medicine.query.filter_by(user_id=user_id).order_by(Medicine.start_date.desc()).all()
        return jsonify([m.to_dict() for m in medicines])

    # 添加用药记录创建API
    @app.route("/api/patients/<int:user_id>/medicines", methods=["POST"])
    def create_medicine(user_id):
        """为患者添加用药记录"""
        data = request.get_json(silent=True) or {}
        
        medicine = Medicine(
            user_id=user_id,
            drug_name=data.get("drug_name"),
            dose=data.get("dose"),
            frequency=data.get("frequency"),
            start_date=datetime.strptime(data.get("start_date"), "%Y-%m-%d").date() if data.get("start_date") else None,
            end_date=datetime.strptime(data.get("end_date"), "%Y-%m-%d").date() if data.get("end_date") else None,
            prescriber=data.get("prescriber"),
            notes=data.get("notes")
        )
        
        db.session.add(medicine)
        db.session.commit()
        
        return jsonify({"ok": True, "medicine": medicine.to_dict()})

    # 添加医生留言API
    @app.route("/api/patients/<int:user_id>/messages", methods=["POST"])
    def create_message(user_id):
        """为患者创建医生留言"""
        data = request.get_json(silent=True) or {}
        
        message = DocMsg(
            user_id=user_id,
            worker_id=data.get("worker_id"),
            village=data.get("village"),
            subject=data.get("subject"),
            content=data.get("content"),
            media_url=data.get("media_url"),
            urgent=data.get("urgent", False)
        )
        
        db.session.add(message)
        db.session.commit()
        
        return jsonify({"ok": True, "message": message.to_dict()})

    # 获取患者留言API
    @app.route("/api/patients/<int:user_id>/messages")
    def get_messages(user_id):
        """获取患者的留言记录"""
        messages = DocMsg.query.filter_by(user_id=user_id).order_by(DocMsg.created_at.desc()).all()
        return jsonify([m.to_dict() for m in messages])

    # 添加提醒API
    @app.route("/api/patients/<int:user_id>/reminders", methods=["POST"])
    def create_reminder(user_id):
        """为患者创建提醒"""
        data = request.get_json(silent=True) or {}
        
        reminder = Reminder(
            user_id=user_id,
            plan_type=PlanTypeEnum(data.get("plan_type", "other")),
            title=data.get("title"),
            description=data.get("description"),
            cron_expr=data.get("cron_expr"),
            time_of_day=datetime.strptime(data.get("time_of_day"), "%H:%M").time() if data.get("time_of_day") else None,
            weekdays=data.get("weekdays"),
            channel=ChannelEnum(data.get("channel", "app_push")),
            enabled=data.get("enabled", True)
        )
        
        db.session.add(reminder)
        db.session.commit()
        
        return jsonify({"ok": True, "reminder": reminder.to_dict()})

    # 获取患者提醒API
    @app.route("/api/patients/<int:user_id>/reminders")
    def get_reminders(user_id):
        """获取患者的提醒记录"""
        reminders = Reminder.query.filter_by(user_id=user_id).order_by(Reminder.created_at.desc()).all()
        return jsonify([r.to_dict() for r in reminders])

    # 添加医生管理API
    @app.route("/api/doctors")
    def get_doctors():
        """获取所有医生"""
        doctors = Doctor.query.order_by(Doctor.worker_id.desc()).all()
        return jsonify([d.to_dict() for d in doctors])

    @app.route("/api/doctors", methods=["POST"])
    def create_doctor():
        """创建新医生"""
        data = request.get_json(silent=True) or {}
        
        doctor = Doctor(
            name=data.get("name"),
            role=data.get("role"),
            phone=data.get("phone"),
            village=data.get("village")
        )
        
        db.session.add(doctor)
        db.session.commit()
        
        return jsonify({"ok": True, "doctor": doctor.to_dict()})

    # 添加登录API
    @app.route("/api/doctors/login", methods=["POST"])
    def doctor_login():
        """医生登录"""
        data = request.get_json(silent=True) or {}
        phone = data.get("phone", "").strip()
        password = data.get("password", "").strip()
        
        if not phone or not password:
            return jsonify({"error": "手机号和密码不能为空"}), 400
        
        # 查找医生（这里简化处理，实际项目中应该有密码加密）
        doctor = Doctor.query.filter_by(phone=phone).first()
        if not doctor:
            return jsonify({"error": "医生不存在"}), 404
        
        # 这里简化密码验证，实际项目中应该使用加密密码
        # 暂时使用手机号后4位作为密码进行演示
        if password != phone[-4:]:
            return jsonify({"error": "密码错误"}), 401
        
        return jsonify({
            "ok": True,
            "token": f"doctor_{doctor.worker_id}_{phone}",  # 简单的token生成
            "user": doctor.to_dict(),
            "user_type": "doctor"
        })

    @app.route("/api/patients/login", methods=["POST"])
    def patient_login():
        """患者登录"""
        data = request.get_json(silent=True) or {}
        phone = data.get("phone", "").strip()
        password = data.get("password", "").strip()
        
        if not phone or not password:
            return jsonify({"error": "手机号和密码不能为空"}), 400
        
        # 查找患者
        patient = Patient.query.filter_by(phone=phone).first()
        if not patient:
            return jsonify({"error": "患者不存在"}), 404
        
        # 这里简化密码验证，实际项目中应该使用加密密码
        # 暂时使用手机号后4位作为密码进行演示
        if password != phone[-4:]:
            return jsonify({"error": "密码错误"}), 401
        
        return jsonify({
            "ok": True,
            "token": f"patient_{patient.user_id}_{phone}",  # 简单的token生成
            "user": patient.to_dict(),
            "user_type": "patient"
        })

    # 添加注册API
    @app.route("/api/doctors/register", methods=["POST"])
    def doctor_register():
        """医生注册"""
        data = request.get_json(silent=True) or {}
        name = data.get("name", "").strip()
        phone = data.get("phone", "").strip()
        password = data.get("password", "").strip()
        confirm_password = data.get("confirm_password", "").strip()
        doctor_id = data.get("doctor_id", "").strip()
        role = data.get("role", "村医").strip()
        village = data.get("village", "").strip()
        
        # 验证必填字段
        if not all([name, phone, password, confirm_password]):
            return jsonify({"error": "请完整填写必填信息"}), 400
        
        # 验证密码
        if password != confirm_password:
            return jsonify({"error": "两次密码不一致"}), 400
        
        if len(password) < 4:
            return jsonify({"error": "密码长度不能少于4位"}), 400
        
        # 验证手机号格式
        if not phone.isdigit() or len(phone) != 11:
            return jsonify({"error": "请输入正确的手机号"}), 400
        
        # 检查手机号是否已存在
        existing_doctor = Doctor.query.filter_by(phone=phone).first()
        if existing_doctor:
            return jsonify({"error": "该手机号已被注册"}), 400
        
        # 创建新医生
        doctor = Doctor(
            name=name,
            phone=phone,
            role=role,
            village=village
        )
        
        try:
            db.session.add(doctor)
            db.session.commit()
            
            return jsonify({
                "ok": True,
                "message": "注册成功",
                "doctor": doctor.to_dict()
            })
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": "注册失败，请重试"}), 500

    @app.route("/api/patients/register", methods=["POST"])
    def patient_register():
        """患者注册"""
        data = request.get_json(silent=True) or {}
        name = data.get("name", "").strip()
        phone = data.get("phone", "").strip()
        password = data.get("password", "").strip()
        confirm_password = data.get("confirm_password", "").strip()
        gender = data.get("gender", "U").strip()
        village = data.get("village", "").strip()
        dialect = data.get("dialect", "普通话").strip()
        
        # 验证必填字段
        if not all([name, phone, password, confirm_password]):
            return jsonify({"error": "请完整填写必填信息"}), 400
        
        # 验证密码
        if password != confirm_password:
            return jsonify({"error": "两次密码不一致"}), 400
        
        if len(password) < 4:
            return jsonify({"error": "密码长度不能少于4位"}), 400
        
        # 验证手机号格式
        if not phone.isdigit() or len(phone) != 11:
            return jsonify({"error": "请输入正确的手机号"}), 400
        
        # 检查手机号是否已存在
        existing_patient = Patient.query.filter_by(phone=phone).first()
        if existing_patient:
            return jsonify({"error": "该手机号已被注册"}), 400
        
        # 创建新患者
        patient = Patient(
            name=name,
            phone=phone,
            gender=GenderEnum(gender),
            village=village,
            dialect=dialect
        )
        
        try:
            db.session.add(patient)
            db.session.commit()
            
            return jsonify({
                "ok": True,
                "message": "注册成功",
                "patient": patient.to_dict()
            })
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": "注册失败，请重试"}), 500

    # =========================
    # 聊天消息API
    # =========================
    
    @app.route("/api/chat/send", methods=["POST"])
    def send_chat_message():
        """发送聊天消息"""
        data = request.get_json(silent=True) or {}
        patient_id = data.get("patient_id")
        doctor_id = data.get("doctor_id")
        sender_type = data.get("sender_type")  # 'patient' or 'doctor'
        content = data.get("content", "").strip()
        
        if not all([patient_id, doctor_id, sender_type, content]):
            return jsonify({"error": "缺少必要参数"}), 400
        
        if sender_type not in ['patient', 'doctor']:
            return jsonify({"error": "sender_type必须是'patient'或'doctor'"}), 400
        
        # 验证患者和医生是否存在
        patient = Patient.query.get(patient_id)
        doctor = Doctor.query.get(doctor_id)
        
        if not patient or not doctor:
            return jsonify({"error": "患者或医生不存在"}), 404
        
        # 创建消息
        message = ChatMessage(
            patient_id=patient_id,
            doctor_id=doctor_id,
            sender_type=sender_type,
            content=content
        )
        
        db.session.add(message)
        db.session.commit()
        
        return jsonify({"ok": True, "message": message.to_dict()})
    
    @app.route("/api/chat/messages", methods=["GET"])
    def get_chat_messages():
        """获取聊天消息列表"""
        patient_id = request.args.get("patient_id", type=int)
        doctor_id = request.args.get("doctor_id", type=int)
        
        if not patient_id or not doctor_id:
            return jsonify({"error": "缺少必要参数"}), 400
        
        # 查询该患者和医生之间的所有消息
        messages = ChatMessage.query.filter(
            ChatMessage.patient_id == patient_id,
            ChatMessage.doctor_id == doctor_id
        ).order_by(ChatMessage.created_at.asc()).all()
        
        return jsonify({"ok": True, "messages": [m.to_dict() for m in messages]})
    
    @app.route("/api/chat/last_message/<int:patient_id>/<int:doctor_id>", methods=["GET"])
    def get_last_message(patient_id, doctor_id):
        """获取最后一条消息（用于聊天列表显示）"""
        last_message = ChatMessage.query.filter(
            ChatMessage.patient_id == patient_id,
            ChatMessage.doctor_id == doctor_id
        ).order_by(ChatMessage.created_at.desc()).first()
        
        if last_message:
            return jsonify({"ok": True, "message": last_message.to_dict()})
        return jsonify({"ok": True, "message": None})
    
    @app.route("/api/chat/mark_read", methods=["POST"])
    def mark_messages_read():
        """标记消息为已读"""
        data = request.get_json(silent=True) or {}
        patient_id = data.get("patient_id")
        doctor_id = data.get("doctor_id")
        sender_type = data.get("sender_type")  # 'patient' or 'doctor'
        
        if not all([patient_id, doctor_id, sender_type]):
            return jsonify({"error": "缺少必要参数"}), 400
        
        # 标记对方发送的消息为已读
        unread_messages = ChatMessage.query.filter(
            ChatMessage.patient_id == patient_id,
            ChatMessage.doctor_id == doctor_id,
            ChatMessage.sender_type != sender_type,
            ChatMessage.is_read == False
        ).all()
        
        for msg in unread_messages:
            msg.is_read = True
        db.session.commit()
        
        return jsonify({"ok": True, "updated_count": len(unread_messages)})
    
    @app.route("/api/chat/unread_count", methods=["GET"])
    def get_unread_count():
        """获取未读消息数量"""
        patient_id = request.args.get("patient_id", type=int)
        doctor_id = request.args.get("doctor_id", type=int)
        sender_type = request.args.get("sender_type")
        
        if not all([patient_id, doctor_id, sender_type]):
            return jsonify({"error": "缺少必要参数"}), 400
        
        count = ChatMessage.query.filter(
            ChatMessage.patient_id == patient_id,
            ChatMessage.doctor_id == doctor_id,
            ChatMessage.sender_type != sender_type,
            ChatMessage.is_read == False
        ).count()
        
        return jsonify({"ok": True, "unread_count": count})
    
    @app.route("/api/patients/<int:user_id>/doctors", methods=["GET"])
    def get_patient_doctors(user_id):
        """获取患者所在村庄的医生列表"""
        patient = Patient.query.get(user_id)
        if not patient:
            return jsonify({"error": "患者不存在"}), 404
        
        village = patient.village
        doctors = Doctor.query.filter_by(village=village).all()
        
        return jsonify({"ok": True, "doctors": [d.to_dict() for d in doctors]})
    
    @app.route("/api/doctors/<int:doctor_id>/patients", methods=["GET"])
    def get_doctor_patients(doctor_id):
        """获取医生所在村庄的患者列表"""
        doctor = Doctor.query.get(doctor_id)
        if not doctor:
            return jsonify({"error": "医生不存在"}), 404
        
        village = doctor.village
        patients = Patient.query.filter_by(village=village).all()
        
        return jsonify({"ok": True, "patients": [p.to_dict() for p in patients]})
    
    # =========================
    # 前端静态托管（生产用）
    # =========================
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path):
        file_path = os.path.join(static_dir, path)
        if path and os.path.exists(file_path):
            return send_from_directory(static_dir, path)
        index_file = os.path.join(static_dir, "index.html")
        if os.path.exists(index_file):
            return send_from_directory(static_dir, "index.html")
        return jsonify({"ok": True, "hint": "frontend not built yet"}), 200

    return app



# 直接运行后端

if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        db.create_all()
        # 初始化演示数据
        if Patient.query.count() == 0:
            demo_patient = Patient(
                name="张大爷", 
                gender=GenderEnum.M, 
                phone="13800000001",
                village="示例村",
                dialect="普通话"
            )
            db.session.add(demo_patient)
            
            demo_patient2 = Patient(
                name="李阿姨", 
                gender=GenderEnum.F, 
                phone="13900000002",
                village="示例村",
                dialect="普通话"
            )
            db.session.add(demo_patient2)
            
        if Doctor.query.count() == 0:
            demo_doctor = Doctor(
                name="王医生",
                role="村医",
                phone="13700000001",
                village="示例村"
            )
            db.session.add(demo_doctor)
            
            demo_doctor2 = Doctor(
                name="刘医生",
                role="主治医师",
                phone="13600000002",
                village="示例村"
            )
            db.session.add(demo_doctor2)
            
        db.session.commit()
    # 确保手机能访问：同一局域网 + 放行防火墙 5000 端口
    app.run(host="0.0.0.0", port=5000, debug=True)
